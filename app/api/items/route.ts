import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query, execute } from '@/lib/db';
import { UserRole, UserStatus } from '@/lib/types';
import { canCreateItems, checkShopAccess } from '@/lib/permissions';
import { createAuditLog } from '@/lib/audit';
import { buildItemsQuery, addItemFilters, ItemQueryResult } from '@/lib/items-query';

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
    const takenType = (searchParams.get('takenType') || 'ALL').toUpperCase(); // ALL | DEEN | CASH
    const customerId = searchParams.get('customerId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build where conditions based on role and filters
    let whereConditions: string[] = [];
    let params: any[] = [];

    // Shop-scoped visibility rules:
    // - Owner: can see all items (no shop filter)
    // - Admin/Staff: can only see items where items.shop_id = session.shopId
    // - Customer: can only see items where customer_phone_taken_by = their phone AND shop_id = their shop_id
    
    let shopId: string | number | undefined;
    let customerPhone: string | undefined;
    
    if (userRole === UserRole.OWNER) {
      // Owner sees all items - no filter
      shopId = undefined;
    } else if (userRole === UserRole.ADMIN || userRole === UserRole.STAFF) {
      // Staff/Admin: filter by their shop_id
      if (!user.shopId && !user.tukaanId) {
        return NextResponse.json({ error: 'You must be associated with a shop' }, { status: 403 });
      }
      shopId = user.shopId || user.tukaanId;
    } else if (userRole === UserRole.CUSTOMER) {
      // Customer: filter by their phone AND shop_id
      if (!user.phone) {
        return NextResponse.json({ error: 'Phone number not found in session' }, { status: 403 });
      }
      if (!user.shopId && !user.tukaanId) {
        return NextResponse.json({ error: 'You must be associated with a shop' }, { status: 403 });
      }
      customerPhone = user.phone;
      shopId = user.shopId || user.tukaanId;
    }

    // For customers, always filter by their phone (enforced)
    const customerPhoneFilter = userRole === UserRole.CUSTOMER 
      ? customerPhone 
      : (customerId || undefined);

    const { where: filterWhere, params: filterParams } = addItemFilters(
      [],
      [],
      {
        paymentType: takenType === 'CASH' ? 'CASH' : takenType === 'DEEN' ? 'DEEN' : 'ALL',
        customerPhone: customerPhoneFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }
    );

    const { sql, params: queryParams } = buildItemsQuery(shopId, filterWhere);
    // Merge params: shopId param comes first from buildItemsQuery, then filter params
    const allParams = [...queryParams, ...filterParams];

    // Fetch items using optimized query
    const items = await query<ItemQueryResult>(sql, allParams);

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
      } else if (paymentType === 'CASH' || paymentType === 'LA_BIXSHAY' || paymentType === 'PAID') {
        totalPaid += total;
      }

      // Build customer info (who took the item) - ALWAYS EXISTS
      const customerInfo = {
        id: item.taken_by_customer_id,
        firstName: item.taken_by_customer_first_name,
        middleName: item.taken_by_customer_middle_name,
        lastName: item.taken_by_customer_last_name,
        phone: item.taken_by_customer_phone,
        fullName: `${item.taken_by_customer_first_name || ''} ${item.taken_by_customer_middle_name || ''} ${item.taken_by_customer_last_name || ''}`.trim(),
      };

      // Build staff info (who recorded the item) - ALWAYS EXISTS
      const staffInfo = {
        id: item.recorded_by_staff_id,
        firstName: item.recorded_by_staff_first_name,
        middleName: item.recorded_by_staff_middle_name,
        lastName: item.recorded_by_staff_last_name,
        phone: item.recorded_by_staff_phone,
        role: item.recorded_by_staff_role,
        fullName: `${item.recorded_by_staff_first_name || ''} ${item.recorded_by_staff_middle_name || ''} ${item.recorded_by_staff_last_name || ''}`.trim(),
      };

      return {
        id: item.id,
        shopId: item.shop_id,
        shopName: item.shop_name,
        shopLocation: item.shop_location,
        itemName: item.item_name,
        description: item.detail || null,
        price,
        quantity: item.quantity || null,
        createdBy: item.staff_id,
        takenBy: item.customer_phone_taken_by,
        takenByType: 'CUSTOMER', // Always CUSTOMER - items are always taken by customers
        customerInfo,
        staffInfo,
        takenDate: item.taken_date || null,
        userId: item.staff_id,
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
      totalDeen,
      totalPaid,
      balance,
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
