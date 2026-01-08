# Tukaan Shop Management System - Complete Implementation Guide

## Table of Contents
1. [SQL Queries](#sql-queries)
2. [Backend API Routes](#backend-api-routes)
3. [Frontend Components](#frontend-components)
4. [Security & Validation](#security--validation)

---

## SQL Queries

### A) Customer Dropdown Query (by shop_id)

```sql
-- Get customers for dropdown (same shop only)
SELECT 
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
WHERE u.user_type = 'customer'
  AND u.shop_id = ?  -- logged_in_shop_id from session
ORDER BY u.first_name, u.last_name ASC
```

### B) Items List Query (with joins and filters)

```sql
-- Get items with customer and staff info (same shop only)
SELECT 
  -- Item fields
  i.id,
  i.item_name,
  i.detail,
  i.quantity,
  i.price,
  i.payment_type,
  i.taken_date,
  i.shop_id,
  i.created_at,
  
  -- Calculated total
  (i.quantity * i.price) AS total,
  
  -- Customer info (who took the item)
  u.id AS taken_by_customer_id,
  CONCAT(
    COALESCE(u.first_name, ''),
    CASE WHEN u.middle_name IS NOT NULL AND u.middle_name != '' THEN CONCAT(' ', u.middle_name) ELSE '' END,
    CASE WHEN u.last_name IS NOT NULL AND u.last_name != '' THEN CONCAT(' ', u.last_name) ELSE '' END
  ) AS taken_by_customer_name,
  u.phone AS taken_by_customer_phone,
  
  -- Staff info (who recorded the item)
  s.id AS recorded_by_staff_id,
  CONCAT(
    COALESCE(s.first_name, ''),
    CASE WHEN s.middle_name IS NOT NULL AND s.middle_name != '' THEN CONCAT(' ', s.middle_name) ELSE '' END,
    CASE WHEN s.last_name IS NOT NULL AND s.last_name != '' THEN CONCAT(' ', s.last_name) ELSE '' END
  ) AS recorded_by_staff_name,
  s.role AS recorded_by_staff_role,
  s.phone AS recorded_by_staff_phone

FROM items i

-- Join customer (who took the item) - INNER JOIN since customer_phone_taken_by is NOT NULL
INNER JOIN users u ON i.customer_phone_taken_by = u.phone 
  AND u.user_type = 'customer'
  AND u.shop_id = i.shop_id

-- Join staff (who recorded the item) - INNER JOIN since staff_id is NOT NULL
INNER JOIN staff_users s ON i.staff_id = s.id 
  AND s.shop_id = i.shop_id
  AND s.status = 'ACTIVE'

WHERE i.shop_id = ?  -- logged_in_shop_id from session

  -- Filter by payment type
  AND (? IS NULL OR ? = 'ALL' OR i.payment_type = ?)
  
  -- Filter by customer phone
  AND (? IS NULL OR i.customer_phone_taken_by = ?)
  
  -- Filter by date range
  AND (? IS NULL OR DATE(i.taken_date) >= ?)
  AND (? IS NULL OR DATE(i.taken_date) <= ?)

ORDER BY i.created_at DESC
```

### C) Summary Totals Query

```sql
-- Get summary totals (DEEN, CASH, Balance) for same shop
SELECT 
  SUM(CASE WHEN i.payment_type = 'DEEN' THEN (i.quantity * i.price) ELSE 0 END) AS total_deen,
  SUM(CASE WHEN i.payment_type = 'CASH' THEN (i.quantity * i.price) ELSE 0 END) AS total_cash,
  SUM(CASE WHEN i.payment_type = 'DEEN' THEN (i.quantity * i.price) ELSE 0 END) - 
  SUM(CASE WHEN i.payment_type = 'CASH' THEN (i.quantity * i.price) ELSE 0 END) AS balance
FROM items i
WHERE i.shop_id = ?  -- logged_in_shop_id from session
  AND (? IS NULL OR ? = 'ALL' OR i.payment_type = ?)
  AND (? IS NULL OR i.customer_phone_taken_by = ?)
  AND (? IS NULL OR DATE(i.taken_date) >= ?)
  AND (? IS NULL OR DATE(i.taken_date) <= ?)
```

### D) Customer-wise Summary Report Query

```sql
-- Customer summary report (grouped by customer, same shop only)
SELECT 
  u.id AS customer_id,
  CONCAT(
    COALESCE(u.first_name, ''),
    CASE WHEN u.middle_name IS NOT NULL AND u.middle_name != '' THEN CONCAT(' ', u.middle_name) ELSE '' END,
    CASE WHEN u.last_name IS NOT NULL AND u.last_name != '' THEN CONCAT(' ', u.last_name) ELSE '' END
  ) AS customer_name,
  u.phone AS customer_phone,
  COUNT(i.id) AS total_items,
  SUM(CASE WHEN i.payment_type = 'CASH' THEN (i.quantity * i.price) ELSE 0 END) AS total_cash,
  SUM(CASE WHEN i.payment_type = 'DEEN' THEN (i.quantity * i.price) ELSE 0 END) AS total_deen,
  SUM(CASE WHEN i.payment_type = 'DEEN' THEN (i.quantity * i.price) ELSE 0 END) - 
  SUM(CASE WHEN i.payment_type = 'CASH' THEN (i.quantity * i.price) ELSE 0 END) AS balance
FROM users u
INNER JOIN items i ON i.customer_phone_taken_by = u.phone 
  AND i.shop_id = u.shop_id
WHERE u.user_type = 'customer'
  AND u.shop_id = ?  -- logged_in_shop_id from session
  AND (? IS NULL OR DATE(i.taken_date) >= ?)
  AND (? IS NULL OR DATE(i.taken_date) <= ?)
GROUP BY u.id, u.first_name, u.middle_name, u.last_name, u.phone
ORDER BY balance DESC, customer_name ASC
```

### E) Single Customer Detail Report Query

```sql
-- Single customer detail report with all items
SELECT 
  -- Customer info
  u.id AS customer_id,
  CONCAT(
    COALESCE(u.first_name, ''),
    CASE WHEN u.middle_name IS NOT NULL AND u.middle_name != '' THEN CONCAT(' ', u.middle_name) ELSE '' END,
    CASE WHEN u.last_name IS NOT NULL AND u.last_name != '' THEN CONCAT(' ', u.last_name) ELSE '' END
  ) AS customer_name,
  u.phone AS customer_phone,
  u.location AS customer_location,
  u.gender AS customer_gender,
  
  -- Item details
  i.id AS item_id,
  i.item_name,
  i.detail,
  i.quantity,
  i.price,
  (i.quantity * i.price) AS item_total,
  i.payment_type,
  i.taken_date,
  i.created_at AS item_created_at,
  
  -- Staff who recorded
  s.id AS recorded_by_staff_id,
  CONCAT(
    COALESCE(s.first_name, ''),
    CASE WHEN s.middle_name IS NOT NULL AND s.middle_name != '' THEN CONCAT(' ', s.middle_name) ELSE '' END,
    CASE WHEN s.last_name IS NOT NULL AND s.last_name != '' THEN CONCAT(' ', s.last_name) ELSE '' END
  ) AS recorded_by_staff_name,
  s.role AS recorded_by_staff_role,
  s.phone AS recorded_by_staff_phone

FROM users u
LEFT JOIN items i ON i.customer_phone_taken_by = u.phone 
  AND i.shop_id = u.shop_id
LEFT JOIN staff_users s ON i.staff_id = s.id 
  AND s.shop_id = i.shop_id

WHERE u.user_type = 'customer'
  AND u.phone = ?  -- customer phone parameter
  AND u.shop_id = ?  -- logged_in_shop_id from session (security check)

ORDER BY i.taken_date DESC, i.created_at DESC
```

---

## Backend API Routes

### 1. Get Customers for Dropdown

**File:** `app/api/customers/dropdown/route.ts`

```typescript
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
      WHERE u.user_type = 'customer'
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
```

### 2. Get Items List with Filters

**File:** `app/api/items/route.ts` (Updated)

```typescript
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

    // Only STAFF/ADMIN can view items
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

    // Get filters from query params
    const searchParams = req.nextUrl.searchParams;
    const paymentType = searchParams.get('paymentType') || 'ALL';
    const customerPhone = searchParams.get('customerPhone') || null;
    const startDate = searchParams.get('startDate') || null;
    const endDate = searchParams.get('endDate') || null;

    // Build query with filters
    const items = await query<any>(
      `SELECT 
        i.id,
        i.item_name,
        i.detail,
        i.quantity,
        i.price,
        i.payment_type,
        i.taken_date,
        i.shop_id,
        i.created_at,
        (i.quantity * i.price) AS total,
        u.id AS taken_by_customer_id,
        CONCAT(
          COALESCE(u.first_name, ''),
          CASE WHEN u.middle_name IS NOT NULL AND u.middle_name != '' THEN CONCAT(' ', u.middle_name) ELSE '' END,
          CASE WHEN u.last_name IS NOT NULL AND u.last_name != '' THEN CONCAT(' ', u.last_name) ELSE '' END
        ) AS taken_by_customer_name,
        u.phone AS taken_by_customer_phone,
        s.id AS recorded_by_staff_id,
        CONCAT(
          COALESCE(s.first_name, ''),
          CASE WHEN s.middle_name IS NOT NULL AND s.middle_name != '' THEN CONCAT(' ', s.middle_name) ELSE '' END,
          CASE WHEN s.last_name IS NOT NULL AND s.last_name != '' THEN CONCAT(' ', s.last_name) ELSE '' END
        ) AS recorded_by_staff_name,
        s.role AS recorded_by_staff_role,
        s.phone AS recorded_by_staff_phone
      FROM items i
      INNER JOIN users u ON i.customer_phone_taken_by = u.phone 
        AND u.user_type = 'customer'
        AND u.shop_id = i.shop_id
      INNER JOIN staff_users s ON i.staff_id = s.id 
        AND s.shop_id = i.shop_id
        AND s.status = 'ACTIVE'
      WHERE i.shop_id = ?
        AND (? IS NULL OR ? = 'ALL' OR i.payment_type = ?)
        AND (? IS NULL OR i.customer_phone_taken_by = ?)
        AND (? IS NULL OR DATE(i.taken_date) >= ?)
        AND (? IS NULL OR DATE(i.taken_date) <= ?)
      ORDER BY i.created_at DESC`,
      [
        shopId,
        paymentType, paymentType, paymentType,
        customerPhone, customerPhone,
        startDate, startDate,
        endDate, endDate,
      ]
    );

    // Get summary totals
    const [totals] = await query<any>(
      `SELECT 
        SUM(CASE WHEN i.payment_type = 'DEEN' THEN (i.quantity * i.price) ELSE 0 END) AS total_deen,
        SUM(CASE WHEN i.payment_type = 'CASH' THEN (i.quantity * i.price) ELSE 0 END) AS total_cash,
        SUM(CASE WHEN i.payment_type = 'DEEN' THEN (i.quantity * i.price) ELSE 0 END) - 
        SUM(CASE WHEN i.payment_type = 'CASH' THEN (i.quantity * i.price) ELSE 0 END) AS balance
      FROM items i
      WHERE i.shop_id = ?
        AND (? IS NULL OR ? = 'ALL' OR i.payment_type = ?)
        AND (? IS NULL OR i.customer_phone_taken_by = ?)
        AND (? IS NULL OR DATE(i.taken_date) >= ?)
        AND (? IS NULL OR DATE(i.taken_date) <= ?)`,
      [
        shopId,
        paymentType, paymentType, paymentType,
        customerPhone, customerPhone,
        startDate, startDate,
        endDate, endDate,
      ]
    );

    return NextResponse.json({
      success: true,
      items: items.map((item: any) => ({
        id: item.id,
        itemName: item.item_name,
        detail: item.detail,
        quantity: item.quantity,
        price: Number(item.price),
        total: Number(item.total),
        paymentType: item.payment_type,
        takenDate: item.taken_date,
        createdAt: item.created_at,
        takenByCustomer: {
          id: item.taken_by_customer_id,
          name: item.taken_by_customer_name,
          phone: item.taken_by_customer_phone,
        },
        recordedByStaff: {
          id: item.recorded_by_staff_id,
          name: item.recorded_by_staff_name,
          role: item.recorded_by_staff_role,
          phone: item.recorded_by_staff_phone,
        },
      })),
      totals: {
        totalDeen: Number(totals.total_deen || 0),
        totalCash: Number(totals.total_cash || 0),
        balance: Number(totals.balance || 0),
      },
    });
  } catch (error: any) {
    console.error('Items list error:', error);
    return NextResponse.json(
      { error: 'Failed to load items' },
      { status: 500 }
    );
  }
}
```

### 3. Create Item API

**File:** `app/api/items/route.ts` (POST method)

```typescript
export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const userRole = user.role as string;

    // Only STAFF/ADMIN can create items
    if (userRole !== 'admin' && userRole !== 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get shop_id and staff_id from session (NEVER trust frontend)
    const shopId = user.shopId || user.tukaanId;
    const staffId = user.id;

    if (!shopId || !staffId) {
      return NextResponse.json({ 
        error: 'You must be associated with a shop' 
      }, { status: 403 });
    }

    // Verify staff is ACTIVE
    const [staff] = await query<any>(
      'SELECT id, status FROM staff_users WHERE id = ? AND shop_id = ?',
      [staffId, shopId]
    );

    if (!staff || staff.status !== 'ACTIVE') {
      return NextResponse.json({ 
        error: 'Staff account is not active' 
      }, { status: 403 });
    }

    const body = await req.json();
    const {
      customerId,      // customer user ID
      itemName,
      detail,
      quantity,
      price,
      paymentType,     // 'CASH' or 'DEEN'
      takenDate,
    } = body;

    // Validation
    if (!customerId || !itemName || !quantity || !price || !paymentType || !takenDate) {
      return NextResponse.json({ 
        error: 'Missing required fields' 
      }, { status: 400 });
    }

    const qty = parseInt(quantity);
    const unitPrice = parseFloat(price);

    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json({ 
        error: 'Quantity must be greater than 0' 
      }, { status: 400 });
    }

    if (isNaN(unitPrice) || unitPrice < 0) {
      return NextResponse.json({ 
        error: 'Price must be 0 or greater' 
      }, { status: 400 });
    }

    if (!['CASH', 'DEEN'].includes(paymentType)) {
      return NextResponse.json({ 
        error: 'Payment type must be CASH or DEEN' 
      }, { status: 400 });
    }

    // Verify customer exists and belongs to same shop
    const [customer] = await query<any>(
      'SELECT id, phone FROM users WHERE id = ? AND user_type = ? AND shop_id = ?',
      [customerId, 'customer', shopId]
    );

    if (!customer) {
      return NextResponse.json({ 
        error: 'Customer not found or does not belong to your shop' 
      }, { status: 404 });
    }

    // Generate UUID for item
    const [uuidResult] = await query<any>('SELECT UUID() as id');
    const itemId = uuidResult.id;

    // Insert item
    await query(
      `INSERT INTO items (
        id, item_name, detail, quantity, price, payment_type,
        taken_date, staff_id, customer_phone_taken_by, shop_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        itemId,
        itemName,
        detail || null,
        qty,
        unitPrice,
        paymentType,
        takenDate,
        staffId,              // from session
        customer.phone,       // from customer record
        shopId,               // from session
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Item created successfully',
      itemId,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Create item error:', error);
    return NextResponse.json(
      { error: 'Failed to create item' },
      { status: 500 }
    );
  }
}
```

### 4. Customer Summary Report API

**File:** `app/api/reports/customers/route.ts`

```typescript
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
    const shopId = user.shopId || user.tukaanId;

    if (!shopId) {
      return NextResponse.json({ 
        error: 'You must be associated with a shop' 
      }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') || null;
    const endDate = searchParams.get('endDate') || null;
    const search = searchParams.get('search') || null;

    let whereClause = 'u.user_type = ? AND u.shop_id = ?';
    const params: any[] = ['customer', shopId];

    if (startDate) {
      whereClause += ' AND DATE(i.taken_date) >= ?';
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ' AND DATE(i.taken_date) <= ?';
      params.push(endDate);
    }
    if (search) {
      whereClause += ' AND (u.phone LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    const customers = await query<any>(
      `SELECT 
        u.id AS customer_id,
        CONCAT(
          COALESCE(u.first_name, ''),
          CASE WHEN u.middle_name IS NOT NULL AND u.middle_name != '' THEN CONCAT(' ', u.middle_name) ELSE '' END,
          CASE WHEN u.last_name IS NOT NULL AND u.last_name != '' THEN CONCAT(' ', u.last_name) ELSE '' END
        ) AS customer_name,
        u.phone AS customer_phone,
        COUNT(i.id) AS total_items,
        SUM(CASE WHEN i.payment_type = 'CASH' THEN (i.quantity * i.price) ELSE 0 END) AS total_cash,
        SUM(CASE WHEN i.payment_type = 'DEEN' THEN (i.quantity * i.price) ELSE 0 END) AS total_deen,
        SUM(CASE WHEN i.payment_type = 'DEEN' THEN (i.quantity * i.price) ELSE 0 END) - 
        SUM(CASE WHEN i.payment_type = 'CASH' THEN (i.quantity * i.price) ELSE 0 END) AS balance
      FROM users u
      INNER JOIN items i ON i.customer_phone_taken_by = u.phone 
        AND i.shop_id = u.shop_id
      WHERE ${whereClause}
      GROUP BY u.id, u.first_name, u.middle_name, u.last_name, u.phone
      ORDER BY balance DESC, customer_name ASC`,
      params
    );

    return NextResponse.json({
      success: true,
      customers: customers.map((c: any) => ({
        customerId: c.customer_id,
        customerName: c.customer_name,
        customerPhone: c.customer_phone,
        totalItems: Number(c.total_items || 0),
        totalCash: Number(c.total_cash || 0),
        totalDeen: Number(c.total_deen || 0),
        balance: Number(c.balance || 0),
      })),
    });
  } catch (error: any) {
    console.error('Customer summary report error:', error);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}
```

### 5. Single Customer Detail Report API

**File:** `app/api/reports/customers/[phone]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const shopId = user.shopId || user.tukaanId;

    if (!shopId) {
      return NextResponse.json({ 
        error: 'You must be associated with a shop' 
      }, { status: 403 });
    }

    const { phone } = await params;
    const decodedPhone = decodeURIComponent(phone);

    // Get customer and all their items
    const results = await query<any>(
      `SELECT 
        u.id AS customer_id,
        CONCAT(
          COALESCE(u.first_name, ''),
          CASE WHEN u.middle_name IS NOT NULL AND u.middle_name != '' THEN CONCAT(' ', u.middle_name) ELSE '' END,
          CASE WHEN u.last_name IS NOT NULL AND u.last_name != '' THEN CONCAT(' ', u.last_name) ELSE '' END
        ) AS customer_name,
        u.phone AS customer_phone,
        u.location AS customer_location,
        u.gender AS customer_gender,
        i.id AS item_id,
        i.item_name,
        i.detail,
        i.quantity,
        i.price,
        (i.quantity * i.price) AS item_total,
        i.payment_type,
        i.taken_date,
        i.created_at AS item_created_at,
        s.id AS recorded_by_staff_id,
        CONCAT(
          COALESCE(s.first_name, ''),
          CASE WHEN s.middle_name IS NOT NULL AND s.middle_name != '' THEN CONCAT(' ', s.middle_name) ELSE '' END,
          CASE WHEN s.last_name IS NOT NULL AND s.last_name != '' THEN CONCAT(' ', s.last_name) ELSE '' END
        ) AS recorded_by_staff_name,
        s.role AS recorded_by_staff_role,
        s.phone AS recorded_by_staff_phone
      FROM users u
      LEFT JOIN items i ON i.customer_phone_taken_by = u.phone 
        AND i.shop_id = u.shop_id
      LEFT JOIN staff_users s ON i.staff_id = s.id 
        AND s.shop_id = i.shop_id
      WHERE u.user_type = 'customer'
        AND u.phone = ?
        AND u.shop_id = ?
      ORDER BY i.taken_date DESC, i.created_at DESC`,
      [decodedPhone, shopId]
    );

    if (results.length === 0) {
      return NextResponse.json({ 
        error: 'Customer not found' 
      }, { status: 404 });
    }

    const customer = {
      id: results[0].customer_id,
      name: results[0].customer_name,
      phone: results[0].customer_phone,
      location: results[0].customer_location,
      gender: results[0].customer_gender,
    };

    const items = results
      .filter((r: any) => r.item_id) // Only items that exist
      .map((r: any) => ({
        id: r.item_id,
        itemName: r.item_name,
        detail: r.detail,
        quantity: r.quantity,
        price: Number(r.price),
        total: Number(r.item_total),
        paymentType: r.payment_type,
        takenDate: r.taken_date,
        createdAt: r.item_created_at,
        recordedByStaff: {
          id: r.recorded_by_staff_id,
          name: r.recorded_by_staff_name,
          role: r.recorded_by_staff_role,
          phone: r.recorded_by_staff_phone,
        },
      }));

    // Calculate totals
    const totals = items.reduce(
      (acc, item) => {
        if (item.paymentType === 'CASH') {
          acc.totalCash += item.total;
        } else if (item.paymentType === 'DEEN') {
          acc.totalDeen += item.total;
        }
        return acc;
      },
      { totalCash: 0, totalDeen: 0 }
    );

    totals.balance = totals.totalDeen - totals.totalCash;

    return NextResponse.json({
      success: true,
      customer,
      items,
      totals,
    });
  } catch (error: any) {
    console.error('Customer detail report error:', error);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}
```

---

## Frontend Components

### 1. Customer Dropdown Component

**File:** `components/CustomerDropdown.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';

interface Customer {
  id: string;
  phone: string;
  fullName: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
}

interface CustomerDropdownProps {
  value: string;
  onChange: (phone: string) => void;
  required?: boolean;
  disabled?: boolean;
}

export default function CustomerDropdown({
  value,
  onChange,
  required = false,
  disabled = false,
}: CustomerDropdownProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/customers/dropdown');
      const data = await res.json();

      if (data.success && data.customers) {
        setCustomers(data.customers);
      } else {
        setError(data.error || 'Failed to load customers');
      }
    } catch (err) {
      setError('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-sm flex items-center">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
        Loading customers...
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full px-3 py-2 border border-red-300 rounded-lg bg-red-50 text-red-600 text-sm">
        {error}
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled || customers.length === 0}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
    >
      <option value="">-- Select Customer --</option>
      {customers.map((customer) => (
        <option key={customer.id} value={customer.phone}>
          {customer.fullName} ({customer.phone})
        </option>
      ))}
    </select>
  );
}
```

### 2. Items List View

**File:** `app/items/page.tsx` (Key sections)

```typescript
'use client';

import { useState, useEffect } from 'react';
import CustomerDropdown from '@/components/CustomerDropdown';

interface Item {
  id: string;
  itemName: string;
  detail: string | null;
  quantity: number;
  price: number;
  total: number;
  paymentType: 'CASH' | 'DEEN';
  takenDate: string;
  createdAt: string;
  takenByCustomer: {
    id: string;
    name: string;
    phone: string;
  };
  recordedByStaff: {
    id: string;
    name: string;
    role: string;
    phone: string;
  };
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({
    totalDeen: 0,
    totalCash: 0,
    balance: 0,
  });

  // Filters
  const [paymentType, setPaymentType] = useState<'ALL' | 'CASH' | 'DEEN'>('ALL');
  const [customerPhone, setCustomerPhone] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadItems();
  }, [paymentType, customerPhone, startDate, endDate]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('paymentType', paymentType);
      if (customerPhone) params.set('customerPhone', customerPhone);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/items?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setItems(data.items);
        setTotals(data.totals);
      }
    } catch (err) {
      console.error('Error loading items:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Payment Type
            </label>
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value as 'ALL' | 'CASH' | 'DEEN')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="ALL">All</option>
              <option value="CASH">CASH</option>
              <option value="DEEN">DEEN</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Customer
            </label>
            <CustomerDropdown
              value={customerPhone}
              onChange={setCustomerPhone}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
          <div className="text-center">
            <p className="text-xs text-gray-500">Total DEEN</p>
            <p className="text-xl font-bold text-red-600">
              ${totals.totalDeen.toFixed(2)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Total CASH</p>
            <p className="text-xl font-bold text-green-600">
              ${totals.totalCash.toFixed(2)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Balance</p>
            <p className={`text-xl font-bold ${
              totals.balance > 0 ? 'text-red-600' : 'text-green-600'
            }`}>
              ${totals.balance.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Items List */}
      {loading ? (
        <div className="text-center py-8">Loading items...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-600">No items found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-semibold">{item.itemName}</h3>
                  {item.detail && (
                    <p className="text-sm text-gray-600 mt-1">{item.detail}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-green-600">
                    ${item.total.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.quantity} × ${item.price.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t">
                <div>
                  <span className="text-xs font-medium text-gray-500">Payment Type:</span>
                  <span className={`ml-2 text-sm font-medium ${
                    item.paymentType === 'DEEN' ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {item.paymentType}
                  </span>
                </div>

                <div>
                  <span className="text-xs font-medium text-gray-500">Taken Date:</span>
                  <span className="ml-2 text-sm text-gray-900">
                    {new Date(item.takenDate).toLocaleDateString()}
                  </span>
                </div>

                <div>
                  <span className="text-xs font-medium text-gray-500">Taken By:</span>
                  <span className="ml-2 text-sm text-gray-900">
                    {item.takenByCustomer.name} ({item.takenByCustomer.phone})
                  </span>
                </div>

                <div>
                  <span className="text-xs font-medium text-gray-500">Recorded By:</span>
                  <span className="ml-2 text-sm text-gray-900">
                    {item.recordedByStaff.name} ({item.recordedByStaff.role}) - {item.recordedByStaff.phone}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 3. Create Item Form

**File:** `app/items/create/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerDropdown from '@/components/CustomerDropdown';

export default function CreateItemPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    customerPhone: '',
    itemName: '',
    detail: '',
    quantity: '',
    price: '',
    paymentType: 'DEEN' as 'CASH' | 'DEEN',
    takenDate: new Date().toISOString().split('T')[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      // Get customer ID from phone
      const customerRes = await fetch(`/api/customers/dropdown`);
      const customerData = await customerRes.json();
      const customer = customerData.customers?.find(
        (c: any) => c.phone === formData.customerPhone
      );

      if (!customer) {
        setError('Customer not found');
        setSubmitting(false);
        return;
      }

      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          itemName: formData.itemName,
          detail: formData.detail || null,
          quantity: parseInt(formData.quantity),
          price: parseFloat(formData.price),
          paymentType: formData.paymentType,
          takenDate: formData.takenDate,
        }),
      });

      const data = await res.json();

      if (data.success) {
        router.push('/items');
      } else {
        setError(data.error || 'Failed to create item');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Create New Item</h1>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer <span className="text-red-500">*</span>
            </label>
            <CustomerDropdown
              value={formData.customerPhone}
              onChange={(phone) => setFormData({ ...formData, customerPhone: phone })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Item Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.itemName}
              onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Detail (Optional)
            </label>
            <textarea
              value={formData.detail}
              onChange={(e) => setFormData({ ...formData, detail: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.paymentType}
                onChange={(e) => setFormData({ ...formData, paymentType: e.target.value as 'CASH' | 'DEEN' })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="DEEN">DEEN (Credit)</option>
                <option value="CASH">CASH (Paid)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Taken Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.takenDate}
                onChange={(e) => setFormData({ ...formData, takenDate: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

## Security & Validation

### Security Checklist

1. ✅ **shop_id from session only** - Never accept from frontend
2. ✅ **staff_id from session only** - Never accept from frontend
3. ✅ **Customer validation** - Verify customer belongs to same shop
4. ✅ **Staff validation** - Verify staff is ACTIVE and belongs to same shop
5. ✅ **SQL injection prevention** - Use parameterized queries
6. ✅ **Role-based access** - Only STAFF/ADMIN can access items
7. ✅ **Data filtering** - All queries filtered by shop_id

### Validation Rules

1. **Item Creation:**
   - Customer must exist and belong to same shop
   - Staff must be ACTIVE
   - Quantity > 0
   - Price >= 0
   - Payment type must be 'CASH' or 'DEEN'
   - Taken date required

2. **Customer Dropdown:**
   - Only shows customers from same shop
   - Only accessible by STAFF/ADMIN

3. **Items List:**
   - Only shows items from same shop
   - Filters respect shop_id boundary

---

## API Response Naming Convention

All API responses use clear naming:

- `taken_by_customer_name` - Customer who took the item
- `taken_by_customer_phone` - Customer phone
- `recorded_by_staff_name` - Staff who recorded the item
- `recorded_by_staff_role` - Staff role (STAFF/ADMIN)
- `recorded_by_staff_phone` - Staff phone

This ensures clarity and prevents confusion between "taken by" and "recorded by".

