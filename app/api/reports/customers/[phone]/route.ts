import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query } from '@/lib/db';
import { UserRole } from '@/lib/types';

/**
 * GET /api/reports/customers/[phone]
 * Single Customer Detail Report - Shows customer profile and all items taken
 * 
 * Query params:
 * - startDate (optional): Filter by taken_date >= startDate
 * - endDate (optional): Filter by taken_date <= endDate
 * - paymentType (optional): 'DEEN' | 'LA_BIXSHAY' | 'ALL'
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { phone: string } }
) {
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

    const customerPhone = decodeURIComponent(params.phone);

    // Get filters from query params
    const searchParams = req.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const paymentType = (searchParams.get('paymentType') || 'ALL').toUpperCase();

    // Build WHERE conditions
    let whereConditions: string[] = [];
    let params: any[] = [];

    // Customer phone filter (required)
    whereConditions.push('u.phone = ?');
    params.push(customerPhone);

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

    // Get customer profile
    const customerProfile = await query<any>(
      `SELECT
        u.id,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.phone,
        u.gender,
        u.location,
        u.shop_id,
        u.created_at
      FROM users u
      WHERE u.phone = ? AND (u.user_type = 'customer' OR u.user_type = 'normal')
        ${shopId && userRole !== UserRole.OWNER ? 'AND u.shop_id = ?' : ''}
      LIMIT 1`,
      shopId && userRole !== UserRole.OWNER 
        ? [customerPhone, shopId]
        : [customerPhone]
    );

    if (customerProfile.length === 0) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    const customer = customerProfile[0];

    // Get all items for this customer
    const itemsSql = `
      SELECT
        i.id,
        i.item_name,
        i.detail,
        i.quantity,
        i.price,
        (i.quantity * i.price) AS total_amount,
        i.payment_type,
        i.taken_date,
        i.created_at,
        CONCAT_WS(' ', su.first_name, su.middle_name, su.last_name) AS recorded_by_staff_name,
        su.phone AS recorded_by_staff_phone,
        su.role AS recorded_by_staff_role
      FROM items i
      INNER JOIN users u ON u.phone = i.customer_phone_taken_by AND u.shop_id = i.shop_id
      INNER JOIN staff_users su ON su.id = i.staff_id AND su.shop_id = i.shop_id
      ${whereClause}
      ORDER BY i.taken_date DESC, i.created_at DESC
    `;

    const items = await query<any>(itemsSql, params);

    // Calculate totals
    let totalItems = 0;
    let totalCash = 0;
    let totalDeen = 0;

    const formattedItems = items.map((item: any) => {
      const quantity = Number(item.quantity) || 1;
      const price = Number(item.price) || 0;
      const total = quantity * price;
      const paymentTypeValue = (item.payment_type || '').toUpperCase();

      totalItems++;
      if (paymentTypeValue === 'DEEN') {
        totalDeen += total;
      } else if (paymentTypeValue === 'CASH' || paymentTypeValue === 'LA_BIXSHAY' || paymentTypeValue === 'PAID') {
        totalCash += total;
      }

      return {
        id: item.id,
        itemName: item.item_name,
        description: item.detail || null,
        quantity,
        price,
        totalAmount: total,
        paymentType: paymentTypeValue,
        takenDate: item.taken_date,
        createdAt: item.created_at,
        recordedBy: {
          staffName: item.recorded_by_staff_name || 'Unknown',
          staffPhone: item.recorded_by_staff_phone || 'N/A',
          staffRole: item.recorded_by_staff_role || 'N/A',
        },
      };
    });

    const balance = totalDeen - totalCash;

    return NextResponse.json({
      success: true,
      customer: {
        id: customer.id,
        firstName: customer.first_name,
        middleName: customer.middle_name,
        lastName: customer.last_name,
        fullName: `${customer.first_name || ''} ${customer.middle_name || ''} ${customer.last_name || ''}`.trim(),
        phone: customer.phone,
        gender: customer.gender || null,
        location: customer.location || null,
        shopId: customer.shop_id,
        createdAt: customer.created_at,
      },
      items: formattedItems,
      totals: {
        totalItems,
        totalCash,
        totalDeen,
        balance,
      },
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        paymentType: paymentType !== 'ALL' ? paymentType : 'ALL',
      },
    });
  } catch (error: any) {
    console.error('Customer detail report error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate customer detail report',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
