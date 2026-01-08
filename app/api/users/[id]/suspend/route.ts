import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { execute, queryOne } from '@/lib/db';
import { UserRole } from '@/lib/types';
import { createAuditLog } from '@/lib/audit';

/**
 * POST /api/users/[id]/suspend
 * Suspend a customer (user) account
 * Only ADMIN and OWNER can suspend customers
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

    // Only ADMIN and OWNER can suspend customers
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.OWNER) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Check if user exists in users table (customers)
    const customer = await queryOne<{
      id: string | number;
      shop_id: string | number | null;
      first_name: string;
      last_name: string;
      phone: string;
      status: string;
    }>(
      'SELECT id, shop_id, first_name, last_name, phone, status FROM users WHERE id = ?',
      [id]
    );

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // ADMIN can only suspend customers in their shop
    if (userRole === UserRole.ADMIN && customer.shop_id !== user.shopId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update status to SUSPENDED
    await execute(
      'UPDATE users SET status = ? WHERE id = ?',
      ['SUSPENDED', id]
    );

    // Audit log
    await createAuditLog(
      String(user.id),
      'USER_SUSPENDED',
      'USER',
      String(customer.id),
      {
        customerPhone: customer.phone,
        customerName: `${customer.first_name} ${customer.last_name}`,
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Customer suspended successfully',
    });
  } catch (error: any) {
    console.error('Suspend customer error:', error);
    return NextResponse.json(
      { error: 'Failed to suspend customer' },
      { status: 500 }
    );
  }
}
