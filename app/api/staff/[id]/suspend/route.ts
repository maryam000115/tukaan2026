import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { execute, queryOne } from '@/lib/db';
import { UserRole } from '@/lib/types';
import { createAuditLog } from '@/lib/audit';

/**
 * POST /api/staff/[id]/suspend
 * Suspend a staff user account
 * Only ADMIN and OWNER can suspend staff
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const userRole = user.role as UserRole;

    // Only ADMIN and OWNER can suspend staff
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.OWNER) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Check if staff exists in staff_users table
    const staff = await queryOne<{
      id: string | number;
      shop_id: string | number | null;
      first_name: string;
      last_name: string;
      phone: string;
      role: string;
      status: string;
    }>(
      'SELECT id, shop_id, first_name, last_name, phone, role, status FROM staff_users WHERE id = ?',
      [id]
    );

    if (!staff) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
    }

    // Prevent suspending yourself
    if (String(staff.id) === String(user.id)) {
      return NextResponse.json(
        { error: 'You cannot suspend your own account' },
        { status: 400 }
      );
    }

    // ADMIN can only suspend staff in their shop
    if (userRole === UserRole.ADMIN && staff.shop_id !== user.shopId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Prevent suspending SUPER_ADMIN (only OWNER can do this, and only if not themselves)
    if (staff.role === 'SUPER_ADMIN' && userRole !== UserRole.OWNER) {
      return NextResponse.json(
        { error: 'Only system owner can suspend super admin accounts' },
        { status: 403 }
      );
    }

    // Update status to SUSPENDED
    await execute(
      'UPDATE staff_users SET status = ? WHERE id = ?',
      ['SUSPENDED', id]
    );

    // Audit log
    await createAuditLog(
      String(user.id),
      'STAFF_SUSPENDED',
      'STAFF_USER',
      String(staff.id),
      {
        staffPhone: staff.phone,
        staffName: `${staff.first_name} ${staff.last_name}`,
        staffRole: staff.role,
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Staff suspended successfully',
    });
  } catch (error: any) {
    console.error('Suspend staff error:', error);
    return NextResponse.json(
      { error: 'Failed to suspend staff' },
      { status: 500 }
    );
  }
}
