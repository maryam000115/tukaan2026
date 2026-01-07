import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query } from '@/lib/db';
import { UserRole, UserStatus } from '@/lib/types';
import { hashPassword } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { canManageUsersInShop, canCreateStaffOrCustomer, canViewPlatformOverview } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const userRole = user.role as UserRole;
    
    // Owner can see all users (platform overview)
    // Admin can see all users in their shop
    // Staff cannot view users list (not in requirements)
    let whereConditions: string[] = [];
    let params: any[] = [];

    if (userRole === UserRole.OWNER) {
      // Owner sees all users - no filter
    } else if (userRole === UserRole.ADMIN && user.shopId) {
      whereConditions.push('shop_id = ?');
      params.push(user.shopId);
    } else {
      // Staff and Customer cannot view users list
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const users = await query<any>(
      `SELECT 
        id,
        first_name as firstName,
        middle_name as middleName,
        last_name as lastName,
        phone,
        email,
        gender,
        role,
        status,
        shop_id as shopId,
        created_at as createdAt
      FROM users
      ${whereClause}
      ORDER BY created_at DESC`,
      params
    );

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Users list error:', error);
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
    
    const user = session.user;
    const userRole = user.role as UserRole;
    
    // Check permission to create users
    const permission = canCreateStaffOrCustomer(userRole);
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason || 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const {
      firstName,
      middleName,
      lastName,
      phone,
      email,
      password,
      gender,
      role,
      shopId,
    } = body;

    if (!firstName || !lastName || !phone || !password || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // ADMIN can only create STAFF and CUSTOMER in their shop
    // OWNER can create ADMIN accounts (for managing admins)
    if (userRole === UserRole.ADMIN) {
      if (![UserRole.STAFF, UserRole.CUSTOMER].includes(role)) {
        return NextResponse.json(
          { error: 'You can only create staff or customer users' },
          { status: 403 }
        );
      }
      if (shopId !== user.shopId) {
        return NextResponse.json(
          { error: 'You can only create users for your shop' },
          { status: 403 }
        );
      }
    } else if (userRole === UserRole.OWNER) {
      // Owner can create ADMIN accounts
      if (role !== UserRole.ADMIN) {
        return NextResponse.json(
          { error: 'Owner can only create admin accounts' },
          { status: 403 }
        );
      }
    }

    // Check if phone already exists
    const existing = await query<any>(
      'SELECT id FROM users WHERE phone = ?',
      [phone]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Phone number already registered' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);
    const finalShopId = user.role === UserRole.ADMIN ? user.shopId : shopId;

    // Generate UUID
    const [uuidResult] = await query<any>('SELECT UUID() as id');
    const userId = uuidResult.id;

    // Try password_hash first, fallback to password if column doesn't exist
    try {
      await query(
        `INSERT INTO users (
          id, first_name, middle_name, last_name, phone, email,
          password_hash, gender, role, status, shop_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          userId,
          firstName,
          middleName || null,
          lastName,
          phone,
          email || null,
          passwordHash,
          gender || null,
          role,
          UserStatus.ACTIVE,
          finalShopId || null,
        ]
      );
    } catch (error: any) {
      // If password_hash column doesn't exist, try with password column
      if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('password_hash')) {
        await query(
          `INSERT INTO users (
            id, first_name, middle_name, last_name, phone, email,
            password, gender, role, status, shop_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            userId,
            firstName,
            middleName || null,
            lastName,
            phone,
            email || null,
            passwordHash,
            gender || null,
            role,
            UserStatus.ACTIVE,
            finalShopId || null,
          ]
        );
      } else {
        throw error;
      }
    }

    const [newUserRow] = await query<any>(
      `SELECT 
        id,
        first_name as firstName,
        middle_name as middleName,
        last_name as lastName,
        phone,
        email,
        gender,
        role,
        status,
        shop_id as shopId,
        created_at as createdAt
      FROM users WHERE id = ?`,
      [userId]
    );

    const newUser = newUserRow;

    await createAuditLog(
      user.id,
      'USER_CREATED',
      'USER',
      newUser.id,
      { phone, role },
      req.headers.get('x-forwarded-for') || undefined,
      req.headers.get('user-agent') || undefined
    );

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error: any) {
    console.error('User creation error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { error: 'Phone or email already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

