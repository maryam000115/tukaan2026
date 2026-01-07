import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query, execute } from '@/lib/db';
import { UserRole, UserStatus } from '@/lib/types';
import { createAuditLog } from '@/lib/audit';
import { canEditItems, canDeactivateItems, checkShopAccess } from '@/lib/permissions';

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
    let items: any[] = [];
    
    try {
      // Try new schema first
      items = await query<any>(
        `SELECT 
          i.id,
          i.shop_id as shopId,
          i.item_name as itemName,
          i.description,
          i.price,
          i.tag,
          i.status,
          i.created_by as createdBy,
          i.created_at as createdAt,
          i.updated_at as updatedAt,
          u.id as creator_id,
          u.first_name as creator_firstName,
          u.last_name as creator_lastName
        FROM items i
        JOIN users u ON i.created_by = u.id
        WHERE i.id = ?`,
        [id]
      );
    } catch (error: any) {
      // If new schema columns don't exist, try actual schema with customer_phone_taken_by and staff_id
      if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('description') || error.message?.includes('created_by')) {
        try {
          items = await query<any>(
            `SELECT 
              i.id,
              i.shop_id as shopId,
              i.item_name as itemName,
              i.detail as description,
              i.quantity,
              i.price,
              i.customer_phone_taken_by as takenBy,
              i.taken_by as takenByLegacy,
              i.taken_date as takenDate,
              i.staff_id as userId,
              i.user_id as userIdLegacy,
              i.payment_type,
              i.created_at as createdAt,
              s.id as creator_id,
              s.first_name as creator_firstName,
              s.last_name as creator_lastName
            FROM items i
            LEFT JOIN staff_users s ON i.staff_id = s.id
            WHERE i.id = ?`,
            [id]
          );
        } catch (legacyError: any) {
          // If staff_id doesn't exist, try with user_id
          items = await query<any>(
            `SELECT 
              i.id,
              i.shop_id as shopId,
              i.item_name as itemName,
              i.detail as description,
              i.quantity,
              i.price,
              i.taken_by as takenBy,
              i.taken_date as takenDate,
              i.user_id as userId,
              i.created_at as createdAt,
              u.id as creator_id,
              u.first_name as creator_firstName,
              u.last_name as creator_lastName
            FROM items i
            LEFT JOIN users u ON i.user_id = u.id
            WHERE i.id = ?`,
            [id]
          );
        }
      } else {
        throw error;
      }
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const itemRow = items[0];
    const item = {
      id: itemRow.id,
      shopId: itemRow.shopId || null,
      itemName: itemRow.itemName,
      description: itemRow.description || null,
      price: itemRow.price,
      tag: itemRow.tag || null,
      status: itemRow.status || 'ACTIVE',
      createdBy: itemRow.createdBy || itemRow.userId || itemRow.userIdLegacy || null,
      takenBy: itemRow.takenBy || itemRow.takenByLegacy || null,
      takenDate: itemRow.takenDate || null,
      paymentType: itemRow.payment_type || null,
      createdAt: itemRow.createdAt,
      updatedAt: itemRow.updatedAt || itemRow.createdAt,
      creator: itemRow.creator_id ? {
        id: itemRow.creator_id,
        firstName: itemRow.creator_firstName,
        lastName: itemRow.creator_lastName,
      } : null,
    };

    // Permission check - handle both shop_id and user_id
    const itemShopId = item.shopId || item.user_id;
    if (
      (session.user.role === UserRole.ADMIN ||
        session.user.role === UserRole.STAFF) &&
      itemShopId &&
      session.user.shopId &&
      itemShopId !== session.user.shopId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error('Item get error:', error);
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
    
    // Check permission to edit items
    const permission = canEditItems(userRole);
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason || 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    let items: any[] = [];
    
    try {
      // Try new schema first
      items = await query<any>(
        'SELECT id, shop_id as shopId FROM items WHERE id = ?',
        [id]
      );
    } catch (error: any) {
      // If shop_id doesn't exist, try old schema
      if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('shop_id')) {
        items = await query<any>(
          'SELECT id, user_id as shopId FROM items WHERE id = ?',
          [id]
        );
      } else {
        throw error;
      }
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const item = items[0];

    // Permission check - handle both shop_id and user_id
    const itemShopId = item.shopId || item.user_id;
    if (itemShopId && session.user.shopId && itemShopId !== session.user.shopId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { itemName, description, price, tag, status } = body;

    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (itemName !== undefined) {
      updateFields.push('item_name = ?');
      updateValues.push(itemName);
    }
    if (description !== undefined) {
      // Try description first, fallback to detail if column doesn't exist
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (price !== undefined) {
      updateFields.push('price = ?');
      updateValues.push(parseFloat(price));
    }
    if (tag !== undefined) {
      updateFields.push('tag = ?');
      updateValues.push(tag);
    }
    if (status !== undefined) {
      // Check permission to deactivate items
      if (status === UserStatus.INACTIVE) {
        const deactivatePermission = canDeactivateItems(userRole);
        if (!deactivatePermission.allowed) {
          return NextResponse.json({ error: deactivatePermission.reason || 'Forbidden' }, { status: 403 });
        }
      }
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Try to add updated_at if column exists
    try {
      updateFields.push('updated_at = NOW()');
    } catch (e) {
      // Column might not exist in old schema
    }
    updateValues.push(id);

    // Try update with new schema first, fallback to old schema
    try {
      await execute(
        `UPDATE items SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    } catch (error: any) {
      // If description column doesn't exist, replace with detail
      if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('description')) {
        const oldUpdateFields = updateFields.map(field => 
          field.replace('description', 'detail').replace('updated_at = NOW()', '')
        ).filter(f => f);
        await execute(
          `UPDATE items SET ${oldUpdateFields.join(', ')} WHERE id = ?`,
          updateValues
        );
      } else {
        throw error;
      }
    }

    const [updatedItemRow] = await query<any>(
      `SELECT 
        i.id,
        i.shop_id as shopId,
        i.item_name as itemName,
        i.description,
        i.price,
        i.tag,
        i.status,
        i.created_by as createdBy,
        i.created_at as createdAt,
        i.updated_at as updatedAt,
        u.id as creator_id,
        u.first_name as creator_firstName,
        u.last_name as creator_lastName
      FROM items i
      JOIN users u ON i.created_by = u.id
      WHERE i.id = ?`,
      [id]
    );

    const updatedItem = {
      id: updatedItemRow.id,
      shopId: updatedItemRow.shopId,
      itemName: updatedItemRow.itemName,
      description: updatedItemRow.description,
      price: updatedItemRow.price,
      tag: updatedItemRow.tag,
      status: updatedItemRow.status,
      createdBy: updatedItemRow.createdBy,
      createdAt: updatedItemRow.createdAt,
      updatedAt: updatedItemRow.updatedAt,
      creator: {
        id: updatedItemRow.creator_id,
        firstName: updatedItemRow.creator_firstName,
        lastName: updatedItemRow.creator_lastName,
      },
    };

    await createAuditLog(
      session.user.id,
      'ITEM_UPDATED',
      'ITEM',
      updatedItem.id,
      { changes: Object.keys(updateData) },
      req.headers.get('x-forwarded-for') || undefined,
      req.headers.get('user-agent') || undefined
    );

    return NextResponse.json({ item: updatedItem });
  } catch (error) {
    console.error('Item update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

