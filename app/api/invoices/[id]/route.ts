import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query, execute } from '@/lib/db';
import { UserRole, InvoiceStatus } from '@/lib/types';
import { createAuditLog } from '@/lib/audit';
import { 
  canAcceptInvoice, 
  canPrepareInvoice, 
  canEnterInvoiceAmount, 
  canConfirmDelivery, 
  canRejectInvoice,
  checkShopAccess 
} from '@/lib/permissions';
import { confirmDeliveryWithDebt } from '@/lib/transactions';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const invoices = await query<any>(
      `SELECT 
        i.id,
        i.invoice_number as invoiceNumber,
        i.shop_id as shopId,
        i.customer_id as customerId,
        i.requested_month as requestedMonth,
        i.status,
        i.subtotal,
        i.total_amount as totalAmount,
        i.paid_amount as paidAmount,
        i.remaining_debt as remainingDebt,
        i.accepted_by as acceptedBy,
        i.delivered_by as deliveredBy,
        i.delivered_at as deliveredAt,
        i.created_at as createdAt,
        i.updated_at as updatedAt,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        u.id as customer_user_id,
        u.first_name as customer_user_firstName,
        u.last_name as customer_user_lastName,
        u.phone as customer_user_phone,
        accepted_user.id as accepted_user_id,
        accepted_user.first_name as accepted_user_firstName,
        accepted_user.last_name as accepted_user_lastName,
        delivered_user.id as delivered_user_id,
        delivered_user.first_name as delivered_user_firstName,
        delivered_user.last_name as delivered_user_lastName
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      LEFT JOIN users accepted_user ON i.accepted_by = accepted_user.id
      LEFT JOIN users delivered_user ON i.delivered_by = delivered_user.id
      WHERE i.id = ?`,
      [id]
    );

    if (invoices.length === 0) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const invoiceRow = invoices[0];

    // Permission check
    if (session.user.role === UserRole.CUSTOMER) {
      const customers = await query<any>(
        'SELECT id FROM customers WHERE user_id = ?',
        [session.user.id]
      );
      if (customers.length === 0 || invoiceRow.customerId !== customers[0].id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (
      (session.user.role === UserRole.ADMIN || session.user.role === UserRole.STAFF) &&
      invoiceRow.shopId !== session.user.shopId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch invoice items
    const invoiceItems = await query<any>(
      `SELECT 
        ii.id,
        ii.invoice_id as invoiceId,
        ii.item_id as itemId,
        ii.item_name_snapshot as itemNameSnapshot,
        ii.quantity,
        ii.unit_price_snapshot as unitPriceSnapshot,
        ii.line_total as lineTotal,
        i.id as item_id,
        i.item_name as item_itemName
      FROM invoice_items ii
      LEFT JOIN items i ON ii.item_id = i.id
      WHERE ii.invoice_id = ?`,
      [id]
    );

    const invoice = {
      id: invoiceRow.id,
      invoiceNumber: invoiceRow.invoiceNumber,
      shopId: invoiceRow.shopId,
      customerId: invoiceRow.customerId,
      requestedMonth: invoiceRow.requestedMonth,
      status: invoiceRow.status,
      subtotal: invoiceRow.subtotal,
      totalAmount: invoiceRow.totalAmount,
      paidAmount: invoiceRow.paidAmount,
      remainingDebt: invoiceRow.remainingDebt,
      acceptedBy: invoiceRow.acceptedBy,
      deliveredBy: invoiceRow.deliveredBy,
      deliveredAt: invoiceRow.deliveredAt,
      createdAt: invoiceRow.createdAt,
      updatedAt: invoiceRow.updatedAt,
      customer: {
        id: invoiceRow.customer_id,
        name: invoiceRow.customer_name,
        phone: invoiceRow.customer_phone,
        userId: invoiceRow.customer_user_id,
        user: {
          id: invoiceRow.customer_user_id,
          firstName: invoiceRow.customer_user_firstName,
          lastName: invoiceRow.customer_user_lastName,
          phone: invoiceRow.customer_user_phone,
        },
      },
      items: invoiceItems.map((item: any) => ({
        id: item.id,
        invoiceId: item.invoiceId,
        itemId: item.itemId,
        itemNameSnapshot: item.itemNameSnapshot,
        quantity: item.quantity,
        unitPriceSnapshot: item.unitPriceSnapshot,
        lineTotal: item.lineTotal,
        item: item.item_id ? {
          id: item.item_id,
          itemName: item.item_itemName,
        } : null,
      })),
      acceptedByUser: invoiceRow.accepted_user_id ? {
        id: invoiceRow.accepted_user_id,
        firstName: invoiceRow.accepted_user_firstName,
        lastName: invoiceRow.accepted_user_lastName,
      } : null,
      deliveredByUser: invoiceRow.delivered_user_id ? {
        id: invoiceRow.delivered_user_id,
        firstName: invoiceRow.delivered_user_firstName,
        lastName: invoiceRow.delivered_user_lastName,
      } : null,
    };

    return NextResponse.json({ invoice });
  } catch (error) {
    console.error('Invoice get error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const invoices = await query<any>(
      'SELECT id, shop_id as shopId, status, total_amount as totalAmount, paid_amount as paidAmount, invoice_number as invoiceNumber, customer_id as customerId FROM invoices WHERE id = ?',
      [id]
    );

    if (invoices.length === 0) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const invoice = invoices[0];

    // Permission check
    if (
      (session.user.role === UserRole.ADMIN || session.user.role === UserRole.STAFF) &&
      invoice.shopId !== session.user.shopId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { status, totalAmount, paidAmount } = body;

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    const oldStatus = invoice.status;

    const userRole = session.user.role as UserRole;
    
    if (status) {
      // Validate status transitions
      const validTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
        DRAFT: [InvoiceStatus.SUBMITTED, InvoiceStatus.REJECTED],
        SUBMITTED: [InvoiceStatus.ACCEPTED, InvoiceStatus.REJECTED],
        ACCEPTED: [InvoiceStatus.PREPARING],
        PREPARING: [InvoiceStatus.AMOUNT_ENTERED],
        AMOUNT_ENTERED: [InvoiceStatus.DELIVERED_CONFIRMED],
        DELIVERED_CONFIRMED: [],
        REJECTED: [],
      };

      if (!validTransitions[oldStatus]?.includes(status)) {
        return NextResponse.json(
          { error: 'Invalid status transition' },
          { status: 400 }
        );
      }

      // Check permissions for each status transition
      let permission;
      if (status === InvoiceStatus.ACCEPTED) {
        permission = canAcceptInvoice(userRole);
      } else if (status === InvoiceStatus.PREPARING) {
        permission = canPrepareInvoice(userRole);
      } else if (status === InvoiceStatus.AMOUNT_ENTERED) {
        permission = canEnterInvoiceAmount(userRole);
      } else if (status === InvoiceStatus.DELIVERED_CONFIRMED) {
        permission = canConfirmDelivery(userRole);
      } else if (status === InvoiceStatus.REJECTED) {
        permission = canRejectInvoice(userRole);
      } else {
        permission = { allowed: false, reason: 'Invalid status' };
      }

      if (!permission.allowed) {
        return NextResponse.json({ error: permission.reason || 'Forbidden' }, { status: 403 });
      }

      updateFields.push('status = ?');
      updateValues.push(status);

      if (status === InvoiceStatus.ACCEPTED) {
        updateFields.push('accepted_by = ?');
        updateValues.push(session.user.id);
      }

      if (status === InvoiceStatus.DELIVERED_CONFIRMED) {
        updateFields.push('delivered_by = ?', 'delivered_at = NOW()');
        updateValues.push(session.user.id);
      }
    }

    if (totalAmount !== undefined) {
      const total = parseFloat(totalAmount);
      updateFields.push('total_amount = ?');
      updateValues.push(total);
      updateFields.push('remaining_debt = ?');
      updateValues.push(total - (invoice.paidAmount || 0));
    }

    if (paidAmount !== undefined) {
      const newPaidAmount = parseFloat(paidAmount);
      updateFields.push('paid_amount = ?');
      updateValues.push(newPaidAmount);
      const remainingDebt = newPaidAmount >= invoice.totalAmount 
        ? 0 
        : invoice.totalAmount - newPaidAmount;
      updateFields.push('remaining_debt = ?');
      updateValues.push(remainingDebt);
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    // Update invoice
    await execute(
      `UPDATE invoices SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Create debt ledger entry if invoice is delivered and has remaining debt
    if (status === InvoiceStatus.DELIVERED_CONFIRMED) {
      const [updatedInvoiceRow] = await query<any>(
        'SELECT remaining_debt as remainingDebt FROM invoices WHERE id = ?',
        [id]
      );

      if (updatedInvoiceRow.remainingDebt > 0) {
        const [uuidResult] = await query<any>('SELECT UUID() as id');
        const debtId = uuidResult.id;

        await query(
          `INSERT INTO debt_ledger (
            id, shop_id, customer_id, invoice_id, transaction_type,
            amount, notes, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            debtId,
            invoice.shopId,
            invoice.customerId,
            invoice.id,
            'DEBT_ADD',
            updatedInvoiceRow.remainingDebt,
            `Debt from invoice ${invoice.invoiceNumber}`,
            session.user.id,
          ]
        );
      }
    }

    // Fetch updated invoice with relations
    const [updatedInvoiceRow] = await query<any>(
      `SELECT 
        i.id,
        i.invoice_number as invoiceNumber,
        i.shop_id as shopId,
        i.customer_id as customerId,
        i.requested_month as requestedMonth,
        i.status,
        i.subtotal,
        i.total_amount as totalAmount,
        i.paid_amount as paidAmount,
        i.remaining_debt as remainingDebt,
        i.accepted_by as acceptedBy,
        i.delivered_by as deliveredBy,
        i.delivered_at as deliveredAt,
        i.created_at as createdAt,
        i.updated_at as updatedAt,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        u.id as customer_user_id,
        u.first_name as customer_user_firstName,
        u.last_name as customer_user_lastName,
        u.phone as customer_user_phone
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE i.id = ?`,
      [id]
    );

    const invoiceItems = await query<any>(
      `SELECT 
        ii.id,
        ii.invoice_id as invoiceId,
        ii.item_id as itemId,
        ii.item_name_snapshot as itemNameSnapshot,
        ii.quantity,
        ii.unit_price_snapshot as unitPriceSnapshot,
        ii.line_total as lineTotal,
        i.id as item_id,
        i.item_name as item_itemName
      FROM invoice_items ii
      LEFT JOIN items i ON ii.item_id = i.id
      WHERE ii.invoice_id = ?`,
      [id]
    );

    updatedInvoice = {
      id: updatedInvoiceRow.id,
      invoiceNumber: updatedInvoiceRow.invoiceNumber,
      shopId: updatedInvoiceRow.shopId,
      customerId: updatedInvoiceRow.customerId,
      requestedMonth: updatedInvoiceRow.requestedMonth,
      status: updatedInvoiceRow.status,
      subtotal: updatedInvoiceRow.subtotal,
      totalAmount: updatedInvoiceRow.totalAmount,
      paidAmount: updatedInvoiceRow.paidAmount,
      remainingDebt: updatedInvoiceRow.remainingDebt,
      acceptedBy: updatedInvoiceRow.acceptedBy,
      deliveredBy: updatedInvoiceRow.deliveredBy,
      deliveredAt: updatedInvoiceRow.deliveredAt,
      createdAt: updatedInvoiceRow.createdAt,
      updatedAt: updatedInvoiceRow.updatedAt,
      customer: {
        id: updatedInvoiceRow.customer_id,
        name: updatedInvoiceRow.customer_name,
        phone: updatedInvoiceRow.customer_phone,
        userId: updatedInvoiceRow.customer_user_id,
        user: {
          id: updatedInvoiceRow.customer_user_id,
          firstName: updatedInvoiceRow.customer_user_firstName,
          lastName: updatedInvoiceRow.customer_user_lastName,
          phone: updatedInvoiceRow.customer_user_phone,
        },
      },
      items: invoiceItems.map((item: any) => ({
        id: item.id,
        invoiceId: item.invoiceId,
        itemId: item.itemId,
        itemNameSnapshot: item.itemNameSnapshot,
        quantity: item.quantity,
        unitPriceSnapshot: item.unitPriceSnapshot,
        lineTotal: item.lineTotal,
        item: item.item_id ? {
          id: item.item_id,
          itemName: item.item_itemName,
        } : null,
      })),
    };

    await createAuditLog(
      session.user.id,
      'INVOICE_UPDATED',
      'INVOICE',
      updatedInvoice.id,
      { status: status || oldStatus, changes: Object.keys(updateData) },
      req.headers.get('x-forwarded-for') || undefined,
      req.headers.get('user-agent') || undefined
    );

    if (status && status !== oldStatus) {
      await createAuditLog(
        session.user.id,
        `INVOICE_${status}`,
        'INVOICE',
        updatedInvoice.id,
        {},
        req.headers.get('x-forwarded-for') || undefined,
        req.headers.get('user-agent') || undefined
      );
    }

    return NextResponse.json({ invoice: updatedInvoice });
  } catch (error) {
    console.error('Invoice update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

