import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query } from '@/lib/db';
import { UserRole } from '@/lib/types';

/**
 * GET /api/reports/customers
 * Customer Summary Report - Groups items by customer and computes totals
 * 
 * Query params:
 * - startDate (optional): Filter by taken_date >= startDate
 * - endDate (optional): Filter by taken_date <= endDate
 * - paymentType (optional): 'DEEN' | 'LA_BIXSHAY' | 'ALL'
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const userRole = user.role as UserRole;

    // Only STAFF/ADMIN can view reports
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.STAFF && userRole !== UserRole.OWNER) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const shopId = user.shopId || user.tukaanId;
    if (!shopId && userRole !== UserRole.OWNER) {
      return NextResponse.json(
        { error: 'You must be associated with a shop' },
        { status: 403 }
      );
    }

    // Get filters from query params
    const searchParams = req.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const paymentType = (searchParams.get('paymentType') || 'ALL').toUpperCase();

    // Build WHERE conditions
    let whereConditions: string[] = [];
    let params: any[] = [];

    // Shop filter (always required for non-owner)
    if (shopId && userRole !== UserRole.OWNER) {
      whereConditions.push('i.shop_id = ?');
      params.push(shopId);
    }

    // Date filters
    if (startDate) {
      whereConditions.push('i.taken_date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      whereConditions.push('i.taken_date <= ?');
      params.push(endDate);
    }

    // Payment type filter
    if (paymentType !== 'ALL') {
      whereConditions.push('i.payment_type = ?');
      params.push(paymentType);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Customer Summary Query - Group by customer
    const sql = `
      SELECT
        u.id AS customer_id,
        u.phone AS customer_phone,
        CONCAT_WS(' ', u.first_name, u.middle_name, u.last_name) AS customer_full_name,
        COUNT(i.id) AS total_items,
        SUM(CASE WHEN i.payment_type = 'CASH' OR i.payment_type = 'LA_BIXSHAY' OR i.payment_type = 'PAID' 
                 THEN (i.quantity * i.price) ELSE 0 END) AS total_cash,
        SUM(CASE WHEN i.payment_type = 'DEEN' 
                 THEN (i.quantity * i.price) ELSE 0 END) AS total_deen
      FROM users u
      INNER JOIN items i ON u.phone = i.customer_phone_taken_by AND u.shop_id = i.shop_id
      ${whereClause}
      GROUP BY u.id, u.phone, u.first_name, u.middle_name, u.last_name
      HAVING total_items > 0
      ORDER BY total_deen DESC, customer_full_name ASC
    `;

    const results = await query<any>(sql, params);

    // Format results
    const customerSummary = results.map((row: any) => {
      const totalCash = Number(row.total_cash) || 0;
      const totalDeen = Number(row.total_deen) || 0;
      const balance = totalDeen - totalCash;

      return {
        customerId: row.customer_id,
        customerPhone: row.customer_phone,
        customerFullName: row.customer_full_name || 'Unknown',
        totalItems: Number(row.total_items) || 0,
        totalCash,
        totalDeen,
        balance,
      };
    });

    return NextResponse.json({
      success: true,
      summary: customerSummary,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        paymentType: paymentType !== 'ALL' ? paymentType : 'ALL',
      },
    });
  } catch (error: any) {
    console.error('Customer summary report error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate customer summary report',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
