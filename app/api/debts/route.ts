import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query } from '@/lib/db';
import { UserRole, TransactionType } from '@/lib/types';
import { createAuditLog } from '@/lib/audit';
import { canRecordPayments, canAddDebtAdjustments, checkShopAccess } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const searchParams = req.nextUrl.searchParams;
    let where: any = {};

    let whereConditions: string[] = [];
    let params: any[] = [];

    if (user.role === UserRole.CUSTOMER) {
      // Customer can only see their own debts
      const customers = await query<any>(
        'SELECT id FROM customers WHERE user_id = ?',
        [user.id]
      );
      if (customers.length > 0) {
        whereConditions.push('dl.customer_id = ?');
        params.push(customers[0].id);
      } else {
        return NextResponse.json({ debts: [] });
      }
    } else if (user.role === UserRole.ADMIN || user.role === UserRole.STAFF) {
      if (user.shopId) {
        whereConditions.push('dl.shop_id = ?');
        params.push(user.shopId);
      }
    }
    // OWNER can see all debts

    const customerId = searchParams.get('customerId');
    if (customerId) {
      whereConditions.push('dl.customer_id = ?');
      params.push(customerId);
    }

    const transactionType = searchParams.get('transactionType');
    if (transactionType) {
      whereConditions.push('dl.transaction_type = ?');
      params.push(transactionType);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const debts = await query<any>(
      `SELECT 
        dl.id,
        dl.shop_id as shopId,
        dl.customer_id as customerId,
        dl.invoice_id as invoiceId,
        dl.transaction_type as transactionType,
        dl.amount,
        dl.notes,
        dl.created_by as createdBy,
        dl.created_at as createdAt,
        c.id as customer_id,
        c.name as customer_name,
        u.id as customer_user_id,
        u.first_name as customer_user_firstName,
        u.last_name as customer_user_lastName,
        u.phone as customer_user_phone,
        inv.id as invoice_id,
        inv.invoice_number as invoice_invoiceNumber,
        creator.id as creator_id,
        creator.first_name as creator_firstName,
        creator.last_name as creator_lastName
      FROM debt_ledger dl
      JOIN customers c ON dl.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      LEFT JOIN invoices inv ON dl.invoice_id = inv.id
      JOIN users creator ON dl.created_by = creator.id
      ${whereClause}
      ORDER BY dl.created_at DESC`,
      params
    );

    const formattedDebts = debts.map((d: any) => ({
      id: d.id,
      shopId: d.shopId,
      customerId: d.customerId,
      invoiceId: d.invoiceId,
      transactionType: d.transactionType,
      amount: d.amount,
      notes: d.notes,
      createdBy: d.createdBy,
      createdAt: d.createdAt,
      customer: {
        id: d.customer_id,
        name: d.customer_name,
        userId: d.customer_user_id,
        user: {
          id: d.customer_user_id,
          firstName: d.customer_user_firstName,
          lastName: d.customer_user_lastName,
          phone: d.customer_user_phone,
        },
      },
      invoice: d.invoice_id ? {
        id: d.invoice_id,
        invoiceNumber: d.invoice_invoiceNumber,
      } : null,
      creator: {
        id: d.creator_id,
        firstName: d.creator_firstName,
        lastName: d.creator_lastName,
      },
    }));

    // Calculate current balance per customer
    const balanceMap = new Map<string, number>();
    formattedDebts.forEach((debt: any) => {
      const current = balanceMap.get(debt.customerId) || 0;
      if (debt.transactionType === TransactionType.DEBT_ADD) {
        balanceMap.set(debt.customerId, current + debt.amount);
      } else if (debt.transactionType === TransactionType.PAYMENT) {
        balanceMap.set(debt.customerId, current - debt.amount);
      }
    });

    return NextResponse.json({ debts: formattedDebts, balances: Object.fromEntries(balanceMap) });
  } catch (error) {
    console.error('Debts list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = session.user.role as UserRole;
    
    // Check permission to record payments/debts
    const permission = canRecordPayments(userRole);
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason || 'Forbidden' }, { status: 403 });
    }

    if (!session.user.shopId) {
      return NextResponse.json(
        { error: 'You must be associated with a shop' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { customerId, invoiceId, transactionType, amount, notes } = body;

    if (!customerId || !transactionType || amount === undefined) {
      return NextResponse.json(
        { error: 'Customer ID, transaction type, and amount are required' },
        { status: 400 }
      );
    }

    // Check permission for debt adjustments (only admin can add adjustments)
    if (transactionType === TransactionType.ADJUSTMENT) {
      const adjustmentPermission = canAddDebtAdjustments(userRole);
      if (!adjustmentPermission.allowed) {
        return NextResponse.json({ error: adjustmentPermission.reason || 'Forbidden' }, { status: 403 });
      }
    }

    // Verify customer exists and belongs to the shop
    const customers = await query<any>(
      'SELECT id, shop_id as shopId FROM customers WHERE id = ?',
      [customerId]
    );

    if (customers.length === 0 || customers[0].shopId !== session.user.shopId) {
      return NextResponse.json(
        { error: 'Customer not found or invalid shop' },
        { status: 404 }
      );
    }

    // Generate UUID
    const [uuidResult] = await query<any>('SELECT UUID() as id');
    const debtId = uuidResult.id;

    await query(
      `INSERT INTO debt_ledger (
        id, shop_id, customer_id, invoice_id, transaction_type,
        amount, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        debtId,
        session.user.shopId,
        customerId,
        invoiceId || null,
        transactionType,
        parseFloat(amount),
        notes || null,
        session.user.id,
      ]
    );

    // Fetch created debt with relations
    const [debtRow] = await query<any>(
      `SELECT 
        dl.id,
        dl.shop_id as shopId,
        dl.customer_id as customerId,
        dl.invoice_id as invoiceId,
        dl.transaction_type as transactionType,
        dl.amount,
        dl.notes,
        dl.created_by as createdBy,
        dl.created_at as createdAt,
        c.id as customer_id,
        c.name as customer_name,
        u.id as customer_user_id,
        u.first_name as customer_user_firstName,
        u.last_name as customer_user_lastName,
        u.phone as customer_user_phone,
        inv.id as invoice_id,
        inv.invoice_number as invoice_invoiceNumber,
        creator.id as creator_id,
        creator.first_name as creator_firstName,
        creator.last_name as creator_lastName
      FROM debt_ledger dl
      JOIN customers c ON dl.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      LEFT JOIN invoices inv ON dl.invoice_id = inv.id
      JOIN users creator ON dl.created_by = creator.id
      WHERE dl.id = ?`,
      [debtId]
    );

    const debt = {
      id: debtRow.id,
      shopId: debtRow.shopId,
      customerId: debtRow.customerId,
      invoiceId: debtRow.invoiceId,
      transactionType: debtRow.transactionType,
      amount: debtRow.amount,
      notes: debtRow.notes,
      createdBy: debtRow.createdBy,
      createdAt: debtRow.createdAt,
      customer: {
        id: debtRow.customer_id,
        name: debtRow.customer_name,
        userId: debtRow.customer_user_id,
        user: {
          id: debtRow.customer_user_id,
          firstName: debtRow.customer_user_firstName,
          lastName: debtRow.customer_user_lastName,
          phone: debtRow.customer_user_phone,
        },
      },
      invoice: debtRow.invoice_id ? {
        id: debtRow.invoice_id,
        invoiceNumber: debtRow.invoice_invoiceNumber,
      } : null,
      creator: {
        id: debtRow.creator_id,
        firstName: debtRow.creator_firstName,
        lastName: debtRow.creator_lastName,
      },
    };

    // If it's a payment, update the invoice if invoiceId is provided
    if (transactionType === TransactionType.PAYMENT && invoiceId) {
      const invoices = await query<any>(
        'SELECT id, total_amount as totalAmount, paid_amount as paidAmount FROM invoices WHERE id = ?',
        [invoiceId]
      );
      if (invoices.length > 0) {
        const invoice = invoices[0];
        const newPaidAmount = (invoice.paidAmount || 0) + parseFloat(amount);
        await query(
          `UPDATE invoices 
          SET paid_amount = ?, remaining_debt = ?, updated_at = NOW()
          WHERE id = ?`,
          [newPaidAmount, Math.max(0, invoice.totalAmount - newPaidAmount), invoiceId]
        );
      }
    }

    await createAuditLog(
      session.user.id,
      'DEBT_RECORDED',
      'DEBT_LEDGER',
      debt.id,
      { transactionType, amount },
      req.headers.get('x-forwarded-for') || undefined,
      req.headers.get('user-agent') || undefined
    );

    return NextResponse.json({ debt }, { status: 201 });
  } catch (error) {
    console.error('Debt creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

