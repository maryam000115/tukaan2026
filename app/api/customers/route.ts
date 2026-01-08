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

    // Build WHERE clause for users table (customers are in users table with user_type = 'customer')
    // For ADMIN/STAFF: filter by shop_id from session
    // For CUSTOMER: filter by user_id (they can only see themselves)
    // For OWNER: no filter (can see all)
    
    let customers: any[] = [];
    
    try {
      // Query users table where user_type = 'customer' or 'normal' and filtered by shop_id
      if (userRole === UserRole.CUSTOMER) {
        // Customer can only see themselves
        customers = await query<any>(
          `SELECT 
            u.id,
            u.shop_id as shopId,
            u.first_name,
            u.middle_name,
            u.last_name,
            u.phone,
            u.gender,
            u.user_type,
            u.shop_id,
            u.location,
            u.created_at as createdAt
          FROM users u
          WHERE (u.user_type = 'customer' OR u.user_type = 'normal') AND u.id = ?
          ORDER BY u.created_at DESC`,
          [user.id]
        );
      } else if (userRole === UserRole.ADMIN || userRole === UserRole.STAFF) {
        // Admin/Staff see customers from their shop
        const shopId = user.shopId || user.tukaanId;
        if (!shopId) {
          return NextResponse.json({ 
            customers: [],
            message: 'You must be associated with a shop'
          });
        }
        
        let customerWhere = ['(u.user_type = ? OR u.user_type = ?)', 'u.shop_id = ?'];
        let customerParams: any[] = ['customer', 'normal', shopId];
        
        if (status) {
          // Note: users table may not have status column, so we'll skip status filter for now
          // If you need status filtering, you may need to add a status column or use a different approach
        }
        
        customers = await query<any>(
          `SELECT 
            u.id,
            u.shop_id as shopId,
            u.first_name,
            u.middle_name,
            u.last_name,
            u.phone,
            u.gender,
            u.user_type,
            u.shop_id,
            u.location,
            u.created_at as createdAt
          FROM users u
          WHERE ${customerWhere.join(' AND ')}
          ORDER BY u.created_at DESC`,
          customerParams
        );
      } else if (userRole === UserRole.OWNER) {
        // Owner can see all customers
        let ownerWhere = ['(u.user_type = ? OR u.user_type = ?)'];
        let ownerParams: any[] = ['customer', 'normal'];
        
        customers = await query<any>(
          `SELECT 
            u.id,
            u.shop_id as shopId,
            u.first_name,
            u.middle_name,
            u.last_name,
            u.phone,
            u.gender,
            u.user_type,
            u.shop_id,
            u.location,
            u.created_at as createdAt
          FROM users u
          WHERE ${ownerWhere.join(' AND ')}
          ORDER BY u.created_at DESC`,
          ownerParams
        );
      }
    } catch (error: any) {
      console.error('Customers query error:', error);
      // If users table doesn't exist or query fails, try fallback to tukaan_users
      if (
        error.code === 'ER_NO_SUCH_TABLE' ||
        error.code === 'ER_BAD_FIELD_ERROR' ||
        error.message?.includes('users')
      ) {
        console.log('Users table query failed, trying tukaan_users fallback');
        const shopId = user.shopId || user.tukaanId;
        if (shopId && (userRole === UserRole.ADMIN || userRole === UserRole.STAFF)) {
          try {
            const legacyCustomers = await query<any>(
              `SELECT 
                id,
                first_name,
                last_name,
                phone,
                user_type,
                tukaan_id
              FROM tukaan_users
              WHERE (user_type = 'normal' OR user_type = 'customer') AND tukaan_id = ?
              ORDER BY id DESC`,
              [shopId]
            );

            customers = legacyCustomers.map((c: any) => ({
              id: String(c.id),
              shopId: c.tukaan_id,
              first_name: c.first_name,
              middle_name: null,
              last_name: c.last_name,
              phone: c.phone,
              gender: null,
              user_type: c.user_type,
              shop_id: c.tukaan_id,
              location: null,
              createdAt: null,
            }));
          } catch (legacyError: any) {
            console.error('Legacy tukaan_users customers query error:', legacyError);
            customers = [];
          }
        } else {
          customers = [];
        }
      } else {
        throw error;
      }
    }

    const formattedCustomers = customers.map((c: any) => ({
      id: c.id,
      shopId: c.shopId || c.shop_id,
      userId: c.id, // For users table, id is the user_id
      name: `${c.first_name || ''} ${c.middle_name || ''} ${c.last_name || ''}`.trim() || c.phone || `Customer ${c.id}`,
      phone: c.phone || '',
      address: c.location || null,
      status: 'ACTIVE', // Default status since users table may not have status column
      createdAt: c.createdAt || c.created_at || null,
      updatedAt: null, // users table may not have updated_at
      user: {
        id: c.id,
        firstName: c.first_name,
        middleName: c.middle_name,
        lastName: c.last_name,
        phone: c.phone,
        email: null, // users table may not have email
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

