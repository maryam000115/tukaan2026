import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { execute, queryOne } from '@/lib/db';
import { UserRole } from '@/lib/types';
import { createAuditLog } from '@/lib/audit';

/**
 * POST /api/users/[id]/activate
 * Activate a customer (user) account
 * Only ADMIN and OWNER can activate customers
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

    // Only ADMIN and OWNER can activate customers
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

    // ADMIN can only activate customers in their shop
    if (userRole === UserRole.ADMIN && customer.shop_id !== user.shopId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update status to ACTIVE
    await execute(
      'UPDATE users SET status = ? WHERE id = ?',
      ['ACTIVE', id]
    );

    // Audit log
    await createAuditLog(
      String(user.id),
      'USER_ACTIVATED',
      'USER',
      String(customer.id),
      {
        customerPhone: customer.phone,
        customerName: `${customer.first_name} ${customer.last_name}`,
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Customer activated successfully',
    });
  } catch (error: any) {
    console.error('Activate customer error:', error);
    return NextResponse.json(
      { error: 'Failed to activate customer' },
      { status: 500 }
    );
  }
}
