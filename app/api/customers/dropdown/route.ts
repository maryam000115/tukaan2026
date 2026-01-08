import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const userRole = user.role as string;

    // Only STAFF/ADMIN can see customers
    if (userRole !== 'admin' && userRole !== 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get shop_id from session (NEVER trust frontend)
    const shopId = user.shopId || user.tukaanId;
    if (!shopId) {
      return NextResponse.json({ 
        error: 'You must be associated with a shop' 
      }, { status: 403 });
    }

    // Query customers from same shop
    const customers = await query<any>(
      `SELECT 
        u.id,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.phone,
        u.shop_id,
        CONCAT(
          COALESCE(u.first_name, ''),
          CASE WHEN u.middle_name IS NOT NULL AND u.middle_name != '' THEN CONCAT(' ', u.middle_name) ELSE '' END,
          CASE WHEN u.last_name IS NOT NULL AND u.last_name != '' THEN CONCAT(' ', u.last_name) ELSE '' END
        ) AS full_name
      FROM users u
      WHERE (u.user_type = 'customer' OR u.user_type = 'normal')
        AND u.shop_id = ?
      ORDER BY u.first_name, u.last_name ASC`,
      [shopId]
    );

    const formattedCustomers = customers.map((c: any) => ({
      id: c.id,
      phone: c.phone,
      fullName: c.full_name,
      firstName: c.first_name,
      middleName: c.middle_name,
      lastName: c.last_name,
      shopId: c.shop_id,
    }));

    return NextResponse.json({ 
      success: true,
      customers: formattedCustomers 
    });
  } catch (error: any) {
    console.error('Customers dropdown error:', error);
    return NextResponse.json(
      { error: 'Failed to load customers' },
      { status: 500 }
    );
  }
}

