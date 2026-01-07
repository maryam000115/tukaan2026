import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query, execute } from '@/lib/db';
import { UserRole, UserStatus } from '@/lib/types';
import { canCreateItems, checkShopAccess } from '@/lib/permissions';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const userRole = user.role as UserRole;
    
    // Filters
    const searchParams = req.nextUrl.searchParams;
    const takenType = (searchParams.get('takenType') || 'ALL').toUpperCase(); // ALL | DEEN | LA_BIXSHAY
    const customerId = searchParams.get('customerId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build where conditions based on role and filters
    let whereConditions: string[] = [];
    let params: any[] = [];

    // Owner can see all items, Admin/Staff see items in their shop
    if (userRole === UserRole.ADMIN || userRole === UserRole.STAFF) {
      if (user.shopId || user.tukaanId) {
        const shopId = user.shopId || user.tukaanId;
        // Try shop_id first (actual schema), fallback handled in query
        whereConditions.push('shop_id = ?');
        params.push(shopId);
      } else {
        return NextResponse.json({ error: 'You must be associated with a shop' }, { status: 403 });
      }
    }
    // Customer cannot view items list (they can only see items when creating invoices)
    if (userRole === UserRole.CUSTOMER) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Filter by taken type and customer/date (legacy schema primarily)
    // For new schema (no payment_type / taken_by), these filters may not apply
    if (takenType === 'DEEN') {
      whereConditions.push("(payment_type = 'DEEN' OR payment_type IS NULL)");
    } else if (takenType === 'LA_BIXSHAY') {
      whereConditions.push("payment_type = 'LA_BIXSHAY'");
    }

    if (customerId) {
      // Try customer_phone_taken_by first (actual schema), fallback to taken_by (legacy)
      whereConditions.push('(customer_phone_taken_by = ? OR taken_by = ?)');
      params.push(customerId, customerId);
    }

    if (startDate && endDate) {
      whereConditions.push('DATE(taken_date) >= ?');
      whereConditions.push('DATE(taken_date) <= ?');
      params.push(startDate, endDate);
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Fetch items from items table (using actual database schema)
    // Actual schema: customer_phone_taken_by, shop_id, staff_id, payment_type
    let items: any[] = [];
    try {
      // Try actual schema first: customer_phone_taken_by, shop_id, staff_id
      items = await query<{
        id: string;
        shop_id: string | null;
        item_name: string;
        detail: string | null;
        quantity: number;
        price: number;
        customer_phone_taken_by: string | null;
        taken_by: string | null;
        taken_date: string | null;
        staff_id: string | null;
        user_id: string | null;
        payment_type: string | null;
        created_at: Date;
      }>(
        `SELECT 
          id, shop_id, item_name, detail, quantity, price, 
          customer_phone_taken_by, taken_by, taken_date, staff_id, user_id, payment_type, created_at
         FROM items 
         ${whereClause}
         ORDER BY created_at DESC`,
        params
      );
    } catch (error: any) {
      // If customer_phone_taken_by doesn't exist, try with taken_by
      if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('customer_phone_taken_by') || error.message?.includes('staff_id')) {
        // Fallback to legacy schema with taken_by and user_id
        const oldWhereClause = whereClause
          .replace(/customer_phone_taken_by = \?/g, 'taken_by = ?')
          .replace(/shop_id = \?/g, 'user_id = ?');

        items = await query<{
          id: string;
          item_name: string;
          detail: string | null;
          quantity: number;
          price: number;
          taken_by: string | null;
          taken_date: string | null;
          user_id: string | null;
          shop_id: string | null;
          payment_type: string | null;
          created_at: Date;
        }>(
          `SELECT 
            id, item_name, detail, quantity, price, taken_by, taken_date, user_id, shop_id,
            payment_type, created_at
           FROM items 
           ${oldWhereClause || 'WHERE 1=1'}
           ORDER BY created_at DESC`,
          params.length > 0 ? params : []
        );
      } else {
        throw error;
      }
    }

    // Compute totals based on payment_type and quantity * price
    let totalDeen = 0;
    let totalPaid = 0;

    const mappedItems = items.map((item) => {
      const quantity = item.quantity ?? 1;
      const price = Number(item.price) || 0;
      const total = quantity * price;
      const paymentType = (item.payment_type || '').toUpperCase();

      if (paymentType === 'DEEN') {
        totalDeen += total;
      } else if (paymentType === 'LA_BIXSHAY' || paymentType === 'PAID') {
        totalPaid += total;
      }

      return {
        id: item.id,
        shopId: item.shop_id || null,
        itemName: item.item_name,
        description: item.detail || null,
        price,
        quantity: item.quantity || null,
        tag: null, // Not in actual schema
        status: 'ACTIVE', // Default status
        createdBy: item.staff_id || item.user_id || null,
        takenBy: item.customer_phone_taken_by || item.taken_by || null,
        takenDate: item.taken_date || null,
        userId: item.staff_id || item.user_id || null,
        paymentType: paymentType || null,
        createdAt: item.created_at,
        updatedAt: item.created_at,
        total,
      };
    });

    const balance = totalDeen - totalPaid;

    return NextResponse.json({
      success: true,
      items: mappedItems,
      totals: {
        totalDeen,
        totalPaid,
        balance,
      },
    });
  } catch (error: any) {
    console.error('Items fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch items',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const userRole = user.role as UserRole;

    // Check permission to create items
    const permission = canCreateItems(userRole);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || 'Forbidden' },
        { status: 403 }
      );
    }

    // Staff and Admin must be associated with a shop
    if ((userRole === UserRole.ADMIN || userRole === UserRole.STAFF) && !user.shopId) {
      return NextResponse.json(
        { error: 'You must be associated with a shop' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { itemName, description, price, tag } = body;

    // Required field validation
    if (!itemName || price === undefined) {
      return NextResponse.json(
        { error: 'itemName and price are required' },
        { status: 400 }
      );
    }

    const unitPrice = Number(price);
    if (isNaN(unitPrice) || unitPrice < 0) {
      return NextResponse.json(
        { error: 'Price must be a number greater than or equal to 0' },
        { status: 400 }
      );
    }

    const shopId = user.shopId || user.tukaanId;
    if (!shopId && userRole !== UserRole.OWNER) {
      return NextResponse.json(
        { error: 'You must be associated with a shop' },
        { status: 400 }
      );
    }

    // Generate UUID
    const [uuidResult] = await query<any>('SELECT UUID() as id');
    const itemId = uuidResult.id;

    // Try new schema first (shop_id, description, created_by, status, tag)
    try {
      await execute(
        `INSERT INTO items (
          id, shop_id, item_name, description, price, tag, status,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          itemId,
          shopId || null,
          itemName,
          description || null,
          unitPrice,
          tag || null,
          'ACTIVE',
          user.id,
        ]
      );
    } catch (error: any) {
      // If new schema columns don't exist, try legacy schema
      if (
        error.code === 'ER_BAD_FIELD_ERROR' ||
        error.message?.includes('shop_id') ||
        error.message?.includes('created_by') ||
        error.message?.includes('status')
      ) {
        // Legacy schema: item_name, detail, price, user_id, created_at
        await execute(
          `INSERT INTO items (
            id, item_name, detail, price, user_id, created_at, shop_id
          ) VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
          [
            itemId,
            itemName,
            description || null,
            unitPrice,
            user.id,
            shopId || null,
          ]
        );
      } else if (error.code === 'ER_DUP_ENTRY') {
        return NextResponse.json(
          { error: 'An item with this name already exists in your shop' },
          { status: 409 }
        );
      } else {
        console.error('Item creation error:', error);
        throw error;
      }
    }

    // Fetch created item
    let createdItem: any;
    try {
      const items = await query<any>(
        `SELECT 
          id, shop_id as shopId, item_name as itemName, description, price, tag, status,
          created_by as createdBy, created_at as createdAt, updated_at as updatedAt
        FROM items WHERE id = ?`,
        [itemId]
      );
      if (items.length > 0) {
        createdItem = items[0];
      } else {
        // Try legacy schema
        const legacyItems = await query<any>(
          `SELECT 
            id, item_name as itemName, detail as description, price, user_id as createdBy,
            created_at as createdAt, shop_id as shopId
          FROM items WHERE id = ?`,
          [itemId]
        );
        createdItem = legacyItems[0] || null;
      }
    } catch (fetchError) {
      console.error('Error fetching created item:', fetchError);
      // Item was created, but we couldn't fetch it - return basic info
      createdItem = {
        id: itemId,
        itemName,
        description: description || null,
        price: unitPrice,
        tag: tag || null,
        status: 'ACTIVE',
        createdBy: user.id,
        shopId: shopId || null,
      };
    }

    await createAuditLog(
      user.id,
      'ITEM_CREATED',
      'ITEM',
      itemId,
      {
        itemName,
        price: unitPrice,
        shopId: shopId || null,
      },
      req.headers.get('x-forwarded-for') || undefined,
      req.headers.get('user-agent') || undefined
    );

    return NextResponse.json(
      {
        success: true,
        item: {
          id: createdItem.id,
          shopId: createdItem.shopId || null,
          itemName: createdItem.itemName || itemName,
          description: createdItem.description || description || null,
          price: Number(createdItem.price || unitPrice),
          tag: createdItem.tag || tag || null,
          status: createdItem.status || 'ACTIVE',
          createdBy: createdItem.createdBy || user.id,
          createdAt: createdItem.createdAt || new Date().toISOString(),
          updatedAt: createdItem.updatedAt || createdItem.createdAt || new Date().toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Item creation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create item',
        details:
          process.env.NODE_ENV === 'development'
            ? error.message || String(error)
            : undefined,
      },
      { status: 500 }
    );
  }
}
