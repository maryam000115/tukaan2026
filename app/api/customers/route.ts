import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query } from '@/lib/db';
import { UserRole } from '@/lib/types';
import { createAuditLog } from '@/lib/audit';
import { canManageCustomers, canViewCustomerHistory, checkShopAccess } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;

    // Normalize role so we can handle both enum (backend) and lowercase string (frontend)
    const roleValue = String(user.role || '').toUpperCase();
    let userRole: UserRole;
    if (roleValue === 'ADMIN') {
      userRole = UserRole.ADMIN;
    } else if (roleValue === 'STAFF') {
      userRole = UserRole.STAFF;
    } else if (roleValue === 'OWNER') {
      userRole = UserRole.OWNER;
    } else if (roleValue === 'CUSTOMER') {
      userRole = UserRole.CUSTOMER;
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    let whereConditions: string[] = [];
    let params: any[] = [];

    if (userRole === UserRole.CUSTOMER) {
      // Customer can only see themselves
      whereConditions.push('c.user_id = ?');
      params.push(user.id);
    } else if (userRole === UserRole.ADMIN || userRole === UserRole.STAFF) {
      // Admin and Staff can see customers in their shop
      const shopId = user.shopId || user.tukaanId || null;
      if (shopId) {
        whereConditions.push('c.shop_id = ?');
        params.push(shopId);
      } else {
        return NextResponse.json({ error: 'You must be associated with a shop' }, { status: 403 });
      }
    } else if (userRole === UserRole.OWNER) {
      // Owner can see all customers (platform overview)
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = req.nextUrl.searchParams.get('status');
    if (status) {
      whereConditions.push('c.status = ?');
      params.push(status);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    let customers: any[] = [];
    let useLegacyTable = false;

    // Try new customers table first
    try {
      customers = await query<any>(
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
        LEFT JOIN users u ON c.user_id = u.id
        ${whereClause}
        ORDER BY c.created_at DESC`,
        params
      );
    } catch (error: any) {
      // If customers table doesn't exist or JOIN fails, use legacy table
      if (
        error.code === 'ER_NO_SUCH_TABLE' ||
        error.code === 'ER_BAD_FIELD_ERROR' ||
        error.message?.includes('customers') ||
        error.message?.includes('users')
      ) {
        console.log('Customers table not found or JOIN failed, using tukaan_users fallback');
        useLegacyTable = true;
        customers = [];
      } else {
        console.error('Customers table query error:', error);
        throw error;
      }
    }

    // Fallback: use tukaan_users as customers when customers table doesn't exist or is empty
    if (
      useLegacyTable ||
      (customers.length === 0 &&
      (userRole === UserRole.ADMIN || userRole === UserRole.STAFF) &&
      (user.tukaanId || user.shopId))
    ) {
      const shopId = user.shopId || user.tukaanId;
      if (!shopId) {
        return NextResponse.json({ 
          customers: [],
          message: 'No shop associated with your account'
        });
      }

      try {
        // Build legacy query with status filter if needed
        let legacyWhere = `(user_type = 'normal' OR user_type = 'customer') AND tukaan_id = ?`;
        const legacyParams: any[] = [shopId];
        
        // Apply status filter if provided (for legacy, we assume ACTIVE if status filter is ACTIVE)
        if (status && status === 'ACTIVE') {
          // For legacy table, we don't have status column, so we'll return all
          // You can add additional filtering here if needed
        }

        const legacyCustomers = await query<any>(
          `SELECT 
            id,
            first_name,
            last_name,
            phone,
            user_type,
            tukaan_id
          FROM tukaan_users
          WHERE ${legacyWhere}
          ORDER BY id DESC`,
          legacyParams
        );

        customers = legacyCustomers.map((c: any) => ({
          id: String(c.id),
          shopId: c.tukaan_id,
          userId: String(c.id),
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.phone || `Customer ${c.id}`,
          phone: c.phone || '',
          address: null,
          status: 'ACTIVE',
          createdAt: null,
          updatedAt: null,
          user_id: String(c.id),
          user_firstName: c.first_name,
          user_middleName: null,
          user_lastName: c.last_name,
          user_phone: c.phone,
          user_email: null,
        }));

        console.log(`Loaded ${customers.length} customers from tukaan_users for shop ${shopId}`);
      } catch (legacyError: any) {
        console.error('Legacy tukaan_users customers query error:', legacyError);
        // Return empty array instead of error
        customers = [];
      }
    }

    const formattedCustomers = customers.map((c: any) => ({
      id: c.id,
      shopId: c.shopId,
      userId: c.userId,
      name: c.name,
      phone: c.phone,
      address: c.address,
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      user: {
        id: c.user_id,
        firstName: c.user_firstName,
        middleName: c.user_middleName,
        lastName: c.user_lastName,
        phone: c.user_phone,
        email: c.user_email,
      },
    }));

    return NextResponse.json({ customers: formattedCustomers });
  } catch (error) {
    console.error('Customers list error:', error);
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
    
    // Check permission to manage customers
    const permission = canManageCustomers(userRole);
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
    const { userId, name, phone, address } = body;

    if (!userId || !name || !phone) {
      return NextResponse.json(
        { error: 'User ID, name, and phone are required' },
        { status: 400 }
      );
    }

    // Verify user exists and is CUSTOMER role
    const users = await query<any>(
      'SELECT id, role FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0 || users[0].role !== UserRole.CUSTOMER) {
      return NextResponse.json(
        { error: 'User not found or is not a customer' },
        { status: 400 }
      );
    }

    // Generate UUID
    const [uuidResult] = await query<any>('SELECT UUID() as id');
    const customerId = uuidResult.id;

    await query(
      `INSERT INTO customers (
        id, shop_id, user_id, name, phone, address, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        customerId,
        session.user.shopId,
        userId,
        name,
        phone,
        address || null,
        'ACTIVE',
      ]
    );

    const [customerRow] = await query<any>(
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
      [customerId]
    );

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

    await createAuditLog(
      session.user.id,
      'CUSTOMER_CREATED',
      'CUSTOMER',
      customer.id,
      { name, phone },
      req.headers.get('x-forwarded-for') || undefined,
      req.headers.get('user-agent') || undefined
    );

    return NextResponse.json({ customer }, { status: 201 });
  } catch (error: any) {
    console.error('Customer creation error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { error: 'Customer with this user already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

