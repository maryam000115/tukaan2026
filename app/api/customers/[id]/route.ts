import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query, execute } from '@/lib/db';
import { UserRole } from '@/lib/types';
import { createAuditLog } from '@/lib/audit';
import { canManageCustomers, canViewCustomerHistory, checkShopAccess } from '@/lib/permissions';

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
    const customers = await query<any>(
      `SELECT 
        c.id,
        c.shop_id as shopId,
        c.user_id as userId,
        c.name,
        c.phone,
        c.address,
        c.status,
        c.created_at as createdAt,
        c.updated_at as updatedAt,
        u.id as user_id,
        u.first_name as user_firstName,
        u.middle_name as user_middleName,
        u.last_name as user_lastName,
        u.phone as user_phone,
        u.email as user_email
      FROM customers c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?`,
      [id]
    );

    if (customers.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const customerRow = customers[0];
    const customer = {
      id: customerRow.id,
      shopId: customerRow.shopId,
      userId: customerRow.userId,
      name: customerRow.name,
      phone: customerRow.phone,
      address: customerRow.address,
      status: customerRow.status,
      createdAt: customerRow.createdAt,
      updatedAt: customerRow.updatedAt,
      user: {
        id: customerRow.user_id,
        firstName: customerRow.user_firstName,
        middleName: customerRow.user_middleName,
        lastName: customerRow.user_lastName,
        phone: customerRow.user_phone,
        email: customerRow.user_email,
      },
    };

    // Permission check
    if (session.user.role === UserRole.CUSTOMER && customer.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (
      (session.user.role === UserRole.ADMIN || session.user.role === UserRole.STAFF) &&
      customer.shopId !== session.user.shopId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ customer });
  } catch (error) {
    console.error('Customer get error:', error);
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

    const userRole = session.user.role as UserRole;
    
    // Check permission to manage customers
    const permission = canManageCustomers(userRole);
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason || 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const customers = await query<any>(
      'SELECT id, shop_id as shopId FROM customers WHERE id = ?',
      [id]
    );

    if (customers.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const customer = customers[0];

    // Permission check
    if (customer.shopId !== session.user.shopId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { name, phone, address, status } = body;

    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }
    if (address !== undefined) {
      updateFields.push('address = ?');
      updateValues.push(address);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    await execute(
      `UPDATE customers SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const [updatedCustomerRow] = await query<any>(
      `SELECT 
        c.id,
        c.shop_id as shopId,
        c.user_id as userId,
        c.name,
        c.phone,
        c.address,
        c.status,
        c.created_at as createdAt,
        c.updated_at as updatedAt,
        u.id as user_id,
        u.first_name as user_firstName,
        u.middle_name as user_middleName,
        u.last_name as user_lastName,
        u.phone as user_phone,
        u.email as user_email
      FROM customers c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?`,
      [id]
    );

    const updatedCustomer = {
      id: updatedCustomerRow.id,
      shopId: updatedCustomerRow.shopId,
      userId: updatedCustomerRow.userId,
      name: updatedCustomerRow.name,
      phone: updatedCustomerRow.phone,
      address: updatedCustomerRow.address,
      status: updatedCustomerRow.status,
      createdAt: updatedCustomerRow.createdAt,
      updatedAt: updatedCustomerRow.updatedAt,
      user: {
        id: updatedCustomerRow.user_id,
        firstName: updatedCustomerRow.user_firstName,
        middleName: updatedCustomerRow.user_middleName,
        lastName: updatedCustomerRow.user_lastName,
        phone: updatedCustomerRow.user_phone,
        email: updatedCustomerRow.user_email,
      },
    };

    await createAuditLog(
      session.user.id,
      'CUSTOMER_UPDATED',
      'CUSTOMER',
      updatedCustomer.id,
      { changes: Object.keys(updateData) },
      req.headers.get('x-forwarded-for') || undefined,
      req.headers.get('user-agent') || undefined
    );

    return NextResponse.json({ customer: updatedCustomer });
  } catch (error) {
    console.error('Customer update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

