import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query, execute } from '@/lib/db';
import { UserRole } from '@/lib/types';
import { createAuditLog } from '@/lib/audit';
import { canManageShopProfile, canViewPlatformOverview, checkShopAccess } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const userRole = user.role as UserRole;
    
    let whereClause = '';
    let params: any[] = [];

    if (userRole === UserRole.OWNER) {
      // Owner can see all shops (platform overview)
    } else if (userRole === UserRole.ADMIN && user.shopId) {
      // Admin can only see their own shop
      whereClause = 'WHERE s.id = ?';
      params.push(user.shopId);
    } else {
      // Staff and Customer cannot view shops list
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const shops = await query<any>(
      `SELECT 
        s.id,
        s.admin_user_id as adminUserId,
        s.creator_id as creatorId,
        s.shop_name as shopName,
        s.location,
        s.status,
        s.created_at as createdAt,
        s.updated_at as updatedAt,
        u.id as admin_id,
        u.first_name as admin_firstName,
        u.last_name as admin_lastName,
        u.phone as admin_phone
      FROM shops s
      JOIN users u ON s.admin_user_id = u.id
      ${whereClause}
      ORDER BY s.created_at DESC`,
      params
    );

    const formattedShops = shops.map((s: any) => ({
      id: s.id,
      adminUserId: s.adminUserId,
      creatorId: s.creatorId,
      shopName: s.shopName,
      location: s.location,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      admin: {
        id: s.admin_id,
        firstName: s.admin_firstName,
        lastName: s.admin_lastName,
        phone: s.admin_phone,
      },
    }));

    return NextResponse.json({ shops: formattedShops });
  } catch (error) {
    console.error('Shops list error:', error);
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
    
    // Only OWNER can create shops (admin accounts)
    if (userRole !== UserRole.OWNER) {
      return NextResponse.json({ error: 'Only system owner can create shops' }, { status: 403 });
    }

    const body = await req.json();
    const { adminUserId, shopName, location } = body;

    if (!adminUserId || !shopName) {
      return NextResponse.json(
        { error: 'Admin user ID and shop name are required' },
        { status: 400 }
      );
    }

    // Verify admin user exists and is ADMIN role
    const adminUsers = await query<any>(
      'SELECT id, role FROM users WHERE id = ?',
      [adminUserId]
    );

    if (adminUsers.length === 0 || adminUsers[0].role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: 'Admin user not found or invalid role' },
        { status: 400 }
      );
    }

    // Generate UUID
    const [uuidResult] = await query<any>('SELECT UUID() as id');
    const shopId = uuidResult.id;

    await query(
      `INSERT INTO shops (
        id, admin_user_id, creator_id, shop_name, location, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        shopId,
        adminUserId,
        session.user.id,
        shopName,
        location || null,
        'ACTIVE',
      ]
    );

    // Update admin user's shopId
    await execute(
      'UPDATE users SET shop_id = ?, updated_at = NOW() WHERE id = ?',
      [shopId, adminUserId]
    );

    const [shopRow] = await query<any>(
      `SELECT 
        s.id,
        s.admin_user_id as adminUserId,
        s.creator_id as creatorId,
        s.shop_name as shopName,
        s.location,
        s.status,
        s.created_at as createdAt,
        s.updated_at as updatedAt,
        u.id as admin_id,
        u.first_name as admin_firstName,
        u.last_name as admin_lastName,
        u.phone as admin_phone
      FROM shops s
      JOIN users u ON s.admin_user_id = u.id
      WHERE s.id = ?`,
      [shopId]
    );

    const shop = {
      id: shopRow.id,
      adminUserId: shopRow.adminUserId,
      creatorId: shopRow.creatorId,
      shopName: shopRow.shopName,
      location: shopRow.location,
      status: shopRow.status,
      createdAt: shopRow.createdAt,
      updatedAt: shopRow.updatedAt,
      admin: {
        id: shopRow.admin_id,
        firstName: shopRow.admin_firstName,
        lastName: shopRow.admin_lastName,
        phone: shopRow.admin_phone,
      },
    };

    await createAuditLog(
      session.user.id,
      'SHOP_CREATED',
      'SHOP',
      shop.id,
      { shopName },
      req.headers.get('x-forwarded-for') || undefined,
      req.headers.get('user-agent') || undefined
    );

    return NextResponse.json({ shop }, { status: 201 });
  } catch (error: any) {
    console.error('Shop creation error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { error: 'Shop with this admin already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

