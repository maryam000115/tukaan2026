import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query, execute } from '@/lib/db';
import { UserRole } from '@/lib/types';
import { createAuditLog } from '@/lib/audit';
import { canManageShopProfile } from '@/lib/permissions';

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
    const user = session.user;
    const userRole = user.role as UserRole;

    // Admin can only see their own shop, Owner can see any shop
    if (userRole === UserRole.ADMIN && user.shopId !== id) {
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
      WHERE s.id = ?`,
      [id]
    );

    if (shops.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const shopRow = shops[0];
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

    return NextResponse.json({ shop });
  } catch (error) {
    console.error('Shop get error:', error);
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
    const user = session.user;
    const userRole = user.role as UserRole;

    // Check permission to manage shop profile
    const permission = canManageShopProfile(userRole);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || 'Forbidden' },
        { status: 403 }
      );
    }

    // Admin can only update their own shop
    if (userRole === UserRole.ADMIN && user.shopId !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { shopName, location, status } = body;

    // Verify shop exists
    const shops = await query<any>(
      'SELECT id, admin_user_id as adminUserId FROM shops WHERE id = ?',
      [id]
    );

    if (shops.length === 0) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Admin can only update their own shop
    if (userRole === UserRole.ADMIN && shops[0].adminUserId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (shopName !== undefined) {
      updateFields.push('shop_name = ?');
      updateValues.push(shopName);
    }
    if (location !== undefined) {
      updateFields.push('location = ?');
      updateValues.push(location);
    }
    if (status !== undefined && userRole === UserRole.OWNER) {
      // Only Owner can change status
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    await execute(
      `UPDATE shops SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Fetch updated shop
    const [updatedShop] = await query<any>(
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
      [id]
    );

    const shop = {
      id: updatedShop.id,
      adminUserId: updatedShop.adminUserId,
      creatorId: updatedShop.creatorId,
      shopName: updatedShop.shopName,
      location: updatedShop.location,
      status: updatedShop.status,
      createdAt: updatedShop.createdAt,
      updatedAt: updatedShop.updatedAt,
      admin: {
        id: updatedShop.admin_id,
        firstName: updatedShop.admin_firstName,
        lastName: updatedShop.admin_lastName,
        phone: updatedShop.admin_phone,
      },
    };

    await createAuditLog(
      user.id,
      'SHOP_UPDATED',
      'SHOP',
      id,
      {
        shopName: shopName || updatedShop.shopName,
        location: location || updatedShop.location,
      },
      req.headers.get('x-forwarded-for') || undefined,
      req.headers.get('user-agent') || undefined
    );

    return NextResponse.json({ success: true, shop });
  } catch (error: any) {
    console.error('Shop update error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update shop',
        details:
          process.env.NODE_ENV === 'development'
            ? error.message || String(error)
            : undefined,
      },
      { status: 500 }
    );
  }
}

