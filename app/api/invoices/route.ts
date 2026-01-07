import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query } from '@/lib/db';
import { UserRole, InvoiceStatus } from '@/lib/types';
import { generateInvoiceNumber } from '@/lib/invoice';
import { createAuditLog } from '@/lib/audit';
import { createInvoiceWithItems } from '@/lib/transactions';

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
      // Customer can only see their own invoices
      const customers = await query<any>(
        'SELECT id FROM customers WHERE user_id = ?',
        [user.id]
      );
      if (customers.length > 0) {
        whereConditions.push('i.customer_id = ?');
        params.push(customers[0].id);
      } else {
        return NextResponse.json({ invoices: [] });
      }
    } else if (user.role === UserRole.ADMIN || user.role === UserRole.STAFF) {
      if (user.shopId) {
        whereConditions.push('i.shop_id = ?');
        params.push(user.shopId);
      }
    }
    // OWNER can see all invoices

    const status = searchParams.get('status');
    if (status) {
      whereConditions.push('i.status = ?');
      params.push(status);
    }

    const customerId = searchParams.get('customerId');
    if (customerId) {
      whereConditions.push('i.customer_id = ?');
      params.push(customerId);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

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
        u.phone as customer_user_phone
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      ${whereClause}
      ORDER BY i.created_at DESC`,
      params
    );

    // Fetch invoice items for each invoice
    const invoiceIds = invoices.map((inv: any) => inv.id);
    const invoiceItems = invoiceIds.length > 0 
      ? await query<any>(
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
          WHERE ii.invoice_id IN (${invoiceIds.map(() => '?').join(',')})`,
          invoiceIds
        )
      : [];

    const itemsMap = new Map<string, any[]>();
    invoiceItems.forEach((item: any) => {
      if (!itemsMap.has(item.invoiceId)) {
        itemsMap.set(item.invoiceId, []);
      }
      itemsMap.get(item.invoiceId)!.push({
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
      });
    });

    const formattedInvoices = invoices.map((inv: any) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      shopId: inv.shopId,
      customerId: inv.customerId,
      requestedMonth: inv.requestedMonth,
      status: inv.status,
      subtotal: inv.subtotal,
      totalAmount: inv.totalAmount,
      paidAmount: inv.paidAmount,
      remainingDebt: inv.remainingDebt,
      acceptedBy: inv.acceptedBy,
      deliveredBy: inv.deliveredBy,
      deliveredAt: inv.deliveredAt,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
      customer: {
        id: inv.customer_id,
        name: inv.customer_name,
        phone: inv.customer_phone,
        userId: inv.customer_user_id,
        user: {
          id: inv.customer_user_id,
          firstName: inv.customer_user_firstName,
          lastName: inv.customer_user_lastName,
          phone: inv.customer_user_phone,
        },
      },
      items: itemsMap.get(inv.id) || [],
    }));

    return NextResponse.json({ invoices: formattedInvoices });
  } catch (error) {
    console.error('Invoices list error:', error);
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

    const body = await req.json();
    const { customerId, requestedMonth, items } = body;

    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Customer ID and items are required' },
        { status: 400 }
      );
    }

    let shopId: string | null = null;

    if (session.user.role === UserRole.CUSTOMER) {
      // Customer creating their own invoice
      const customers = await query<any>(
        'SELECT id, shop_id as shopId FROM customers WHERE user_id = ? AND id = ?',
        [session.user.id, customerId]
      );
      if (customers.length === 0) {
        return NextResponse.json(
          { error: 'Customer not found' },
          { status: 404 }
        );
      }
      shopId = customers[0].shopId;
    } else if (session.user.role === UserRole.ADMIN || session.user.role === UserRole.STAFF) {
      if (!session.user.shopId) {
        return NextResponse.json(
          { error: 'You must be associated with a shop' },
          { status: 400 }
        );
      }
      shopId = session.user.shopId;
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify customer exists and belongs to the shop
    const customers = await query<any>(
      'SELECT id, shop_id as shopId FROM customers WHERE id = ?',
      [customerId]
    );

    if (customers.length === 0 || customers[0].shopId !== shopId) {
      return NextResponse.json(
        { error: 'Customer not found or invalid shop' },
        { status: 404 }
      );
    }

    // Fetch items and calculate totals
    const itemIds = items.map((i: any) => i.itemId).filter(Boolean);
    let dbItems: any[] = [];
    
    if (itemIds.length > 0) {
      try {
        // Try new schema first (shop_id, status)
        dbItems = await query<any>(
          `SELECT id, item_name as itemName, price FROM items 
          WHERE id IN (${itemIds.map(() => '?').join(',')}) 
          AND shop_id = ? AND status = ?`,
          [...itemIds, shopId, 'ACTIVE']
        );
      } catch (error: any) {
        // If new schema columns don't exist, try old schema (user_id)
        if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('shop_id') || error.message?.includes('status')) {
          dbItems = await query<any>(
            `SELECT id, item_name as itemName, price FROM items 
            WHERE id IN (${itemIds.map(() => '?').join(',')}) 
            AND user_id = ?`,
            [...itemIds, shopId]
          );
        } else {
          throw error;
        }
      }
    }

    const itemMap = new Map(dbItems.map((item: any) => [item.id, item]));

    let subtotal = 0;
    const invoiceItemsData: any[] = [];

    for (const item of items) {
      const dbItem = itemMap.get(item.itemId);
      if (!dbItem) {
        return NextResponse.json(
          { error: `Item ${item.itemId} not found` },
          { status: 400 }
        );
      }

      const quantity = parseInt(item.quantity) || 0;
      const unitPrice = dbItem.price;
      const lineTotal = quantity * unitPrice;
      subtotal += lineTotal;

      invoiceItemsData.push({
        itemId: dbItem.id,
        itemNameSnapshot: dbItem.itemName,
        quantity,
        unitPriceSnapshot: unitPrice,
        lineTotal,
      });
    }

    const invoiceNumber = generateInvoiceNumber();
    const status =
      session.user.role === UserRole.CUSTOMER
        ? InvoiceStatus.SUBMITTED
        : InvoiceStatus.DRAFT;

    const invoice = await createInvoiceWithItems(
      {
        invoiceNumber,
        shopId: shopId!,
        customerId,
        requestedMonth: requestedMonth || null,
        status,
        subtotal,
        totalAmount: subtotal,
        remainingDebt: subtotal,
      },
      invoiceItemsData
    );

    await createAuditLog(
      session.user.id,
      'INVOICE_CREATED',
      'INVOICE',
      invoice.id,
      { invoiceNumber, status },
      req.headers.get('x-forwarded-for') || undefined,
      req.headers.get('user-agent') || undefined
    );

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    console.error('Invoice creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

