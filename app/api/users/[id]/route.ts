import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query, execute } from '@/lib/db';
import { UserRole, UserStatus } from '@/lib/types';
import { hashPassword } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { canManageUsersInShop, canDeactivateUsers } from '@/lib/permissions';

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
      FROM users WHERE id = ?`,
      [id]
    );

    if (users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const targetUser = users[0];

    // Permission check
    if (session.user.role === UserRole.ADMIN && targetUser.shopId !== session.user.shopId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ user: targetUser });
  } catch (error) {
    console.error('User get error:', error);
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
    
    // Check permission to edit users
    const permission = canManageUsersInShop(userRole);
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason || 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const users = await query<any>(
      'SELECT id, shop_id as shopId, status FROM users WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const targetUser = users[0];

    // Permission check
    if (session.user.role === UserRole.ADMIN && targetUser.shopId !== session.user.shopId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
      status,
      shopId,
    } = body;

    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (firstName !== undefined) {
      updateFields.push('first_name = ?');
      updateValues.push(firstName);
    }
    if (middleName !== undefined) {
      updateFields.push('middle_name = ?');
      updateValues.push(middleName);
    }
    if (lastName !== undefined) {
      updateFields.push('last_name = ?');
      updateValues.push(lastName);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }
    if (email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    if (gender !== undefined) {
      updateFields.push('gender = ?');
      updateValues.push(gender);
    }
    if (role !== undefined) {
      updateFields.push('role = ?');
      updateValues.push(role);
    }
    if (status !== undefined) {
      // Check permission to deactivate users
      if (status === UserStatus.INACTIVE) {
        const deactivatePermission = canDeactivateUsers(userRole);
        if (!deactivatePermission.allowed) {
          return NextResponse.json({ error: deactivatePermission.reason || 'Forbidden' }, { status: 403 });
        }
      }
      updateFields.push('status = ?');
      updateValues.push(status);
    }
    if (shopId !== undefined && session.user.role === UserRole.OWNER) {
      updateFields.push('shop_id = ?');
      updateValues.push(shopId);
    }
    if (password) {
      const passwordHash = await hashPassword(password);
      // Try password_hash first, will handle error in execute if column doesn't exist
      updateFields.push('password_hash = ?');
      updateValues.push(passwordHash);
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    // Try password_hash first, fallback to password if column doesn't exist
    try {
      await execute(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    } catch (error: any) {
      // If password_hash column doesn't exist, retry with password column
      if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('password_hash')) {
        // Replace password_hash with password in the SQL
        const sqlWithPassword = updateFields
          .map(field => field.replace('password_hash', 'password'))
          .join(', ');
        await execute(
          `UPDATE users SET ${sqlWithPassword} WHERE id = ?`,
          updateValues
        );
      } else {
        throw error;
      }
    }

    const [updatedUserRow] = await query<any>(
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
      [id]
    );

    const updatedUser = updatedUserRow;

    await createAuditLog(
      session.user.id,
      'USER_UPDATED',
      'USER',
      updatedUser.id,
      { changes: Object.keys(updateData) },
      req.headers.get('x-forwarded-for') || undefined,
      req.headers.get('user-agent') || undefined
    );

    if (status && status !== targetUser.status) {
      await createAuditLog(
        session.user.id,
        `USER_${status}`,
        'USER',
        updatedUser.id,
        {},
        req.headers.get('x-forwarded-for') || undefined,
        req.headers.get('user-agent') || undefined
      );
    }

    return NextResponse.json({ user: updatedUser });
  } catch (error: any) {
    console.error('User update error:', error);
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

