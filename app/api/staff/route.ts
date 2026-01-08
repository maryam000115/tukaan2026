import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query } from '@/lib/db';
import { UserRole } from '@/lib/types';

/**
 * GET /api/staff
 * Get list of staff users
 * ADMIN can see staff in their shop, OWNER can see all staff
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const userRole = user.role as UserRole;

    // Only ADMIN and OWNER can view staff
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.OWNER) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let whereConditions: string[] = [];
    let params: any[] = [];

    // ADMIN can only see staff in their shop
    if (userRole === UserRole.ADMIN) {
      if (!user.shopId) {
        return NextResponse.json(
          { error: 'You must be associated with a shop' },
          { status: 403 }
        );
      }
      whereConditions.push('shop_id = ?');
      params.push(user.shopId);
    }
    // OWNER can see all staff (no filter)

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const staff = await query<any>(
      `SELECT 
        id,
        shop_id as shopId,
        first_name as firstName,
        middle_name as middleName,
        last_name as lastName,
        phone,
        gender,
        role,
        status,
        created_at as createdAt
      FROM staff_users
      ${whereClause}
      ORDER BY created_at DESC`,
      params
    );

    return NextResponse.json({ success: true, staff });
  } catch (error: any) {
    console.error('Staff list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
