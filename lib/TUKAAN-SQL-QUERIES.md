# Tukaan Shop Management System - SQL Queries

## Database Schema

### Tables

1. **users** (customers)
   - `id` - Primary key
   - `first_name`, `middle_name`, `last_name` - Customer name
   - `phone` - Customer phone (unique identifier for matching)
   - `password` - Hashed password
   - `gender` - Gender
   - `user_type` - Must be `'customer'`
   - `shop_id` - Shop ID this customer belongs to
   - `location` - Customer location
   - `created_at` - Creation timestamp

2. **staff_users**
   - `id` - Primary key
   - `shop_id` - Shop ID this staff belongs to
   - `first_name`, `middle_name`, `last_name` - Staff name
   - `phone` - Staff phone
   - `password` - Hashed password
   - `gender` - Gender
   - `role` - `'admin'` or `'staff'`
   - `status` - Status (ACTIVE/INACTIVE)
   - `created_at` - Creation timestamp

3. **items**
   - `id` - Primary key
   - `item_name` - Item name
   - `detail` - Item description
   - `quantity` - Quantity
   - `price` - Price
   - `payment_type` - Payment type (DEEN, LA_BIXSHAY, etc.)
   - `taken_date` - Date item was taken
   - `staff_id` - ID of staff who took/recorded the item (nullable)
   - `customer_phone_taken_by` - Phone number of customer who took the item (nullable)
   - `shop_id` - Shop ID the item belongs to (REQUIRED)
   - `created_at` - Creation timestamp

## Business Rules

1. **NO `taken_by` column exists** - Never use it!
2. **Item taken by logic:**
   - If `items.staff_id` IS NOT NULL → item taken by **STAFF**
   - If `items.customer_phone_taken_by` IS NOT NULL → item taken by **CUSTOMER**
3. **Shop filtering:**
   - All queries MUST filter by `shop_id` from backend session/auth
   - Staff and customers MUST belong to the same `shop_id` as items
   - `staff_users.shop_id` = `items.shop_id`
   - `users.shop_id` = `items.shop_id`
   - `users.phone` = `items.customer_phone_taken_by`

## SQL Queries

### 1. Get Customers for a Shop (Customer Dropdown)

**Purpose:** Show ONLY customers from the same shop_id as the logged-in staff/admin.

```sql
SELECT 
  u.id,
  u.shop_id as shopId,
  u.first_name,
  u.middle_name,
  u.last_name,
  u.phone,
  u.gender,
  u.user_type,
  u.location,
  u.created_at as createdAt
FROM users u
WHERE u.user_type = 'customer'
  AND u.shop_id = ?  -- shop_id from session
ORDER BY u.created_at DESC
```

**Backend Implementation:**
- Get `shop_id` from `session.user.shopId` or `session.user.tukaanId`
- Filter by `u.user_type = 'customer'` AND `u.shop_id = ?`
- Never accept `shop_id` from frontend input

### 2. Get Items for a Shop (Items List)

**Purpose:** Show ONLY items from the same shop_id, with proper joins and `taken_by_type`.

```sql
SELECT 
  -- Item fields
  i.id,
  i.item_name,
  i.detail,
  i.quantity,
  i.price,
  i.payment_type,
  i.taken_date,
  i.staff_id,
  i.customer_phone_taken_by,
  i.shop_id,
  i.created_at,
  
  -- Computed field: taken_by_type
  CASE 
    WHEN i.staff_id IS NOT NULL AND i.staff_id != '' AND i.staff_id != '0' THEN 'STAFF'
    WHEN i.customer_phone_taken_by IS NOT NULL AND i.customer_phone_taken_by != '' THEN 'CUSTOMER'
    ELSE 'UNKNOWN'
  END AS taken_by_type,
  
  -- Shop fields (from tukaans)
  t.tukaan_code AS shop_tukaan_code,
  t.name AS shop_name,
  t.location AS shop_location,
  t.phone AS shop_phone,
  
  -- Staff fields (when taken by staff)
  s.id AS staff_user_id,
  s.first_name AS staff_first_name,
  s.middle_name AS staff_middle_name,
  s.last_name AS staff_last_name,
  s.phone AS staff_phone,
  s.role AS staff_role,
  
  -- Customer fields (when taken by customer)
  u.id AS customer_id,
  u.first_name AS customer_first_name,
  u.middle_name AS customer_middle_name,
  u.last_name AS customer_last_name,
  u.phone AS customer_phone,
  u.user_type AS customer_user_type
  
FROM items i

-- Join shop (tukaans) - required
LEFT JOIN tukaans t ON i.shop_id = t.id

-- Join staff_users when item is taken by staff
-- IMPORTANT: staff must belong to the same shop_id as the item
LEFT JOIN staff_users s ON i.staff_id = s.id 
  AND s.shop_id = i.shop_id
  AND i.staff_id IS NOT NULL 
  AND i.staff_id != '' 
  AND i.staff_id != '0'

-- Join users (customers) when item is taken by customer
-- IMPORTANT: customers must belong to the same shop_id as the item
LEFT JOIN users u ON i.customer_phone_taken_by = u.phone 
  AND u.user_type = 'customer'
  AND u.shop_id = i.shop_id
  AND i.customer_phone_taken_by IS NOT NULL 
  AND i.customer_phone_taken_by != ''
  AND (i.staff_id IS NULL OR i.staff_id = '' OR i.staff_id = '0')

WHERE i.shop_id = ?  -- shop_id from session (REQUIRED)
ORDER BY i.created_at DESC
```

**Backend Implementation:**
- Get `shop_id` from `session.user.shopId` or `session.user.tukaanId`
- Filter by `i.shop_id = ?` in WHERE clause
- Never accept `shop_id` from frontend input

### 3. Get Single Item by ID

**Purpose:** Get item details with proper joins, ensuring shop_id matches.

```sql
SELECT 
  i.id,
  i.shop_id as shopId,
  i.item_name as itemName,
  i.detail as description,
  i.quantity,
  i.price,
  i.customer_phone_taken_by as takenBy,
  i.taken_date as takenDate,
  i.staff_id as userId,
  i.payment_type,
  i.created_at as createdAt,
  CASE 
    WHEN i.staff_id IS NOT NULL AND i.staff_id != '' AND i.staff_id != '0' THEN 'STAFF'
    WHEN i.customer_phone_taken_by IS NOT NULL AND i.customer_phone_taken_by != '' THEN 'CUSTOMER'
    ELSE 'UNKNOWN'
  END AS taken_by_type,
  s.id as creator_id,
  s.first_name as creator_firstName,
  s.last_name as creator_lastName,
  u.id as customer_id,
  u.first_name as customer_firstName,
  u.last_name as customer_lastName,
  u.phone as customer_phone
FROM items i
LEFT JOIN staff_users s ON i.staff_id = s.id 
  AND s.shop_id = i.shop_id
  AND i.staff_id IS NOT NULL 
  AND i.staff_id != '' 
  AND i.staff_id != '0'
LEFT JOIN users u ON i.customer_phone_taken_by = u.phone 
  AND u.user_type = 'customer'
  AND u.shop_id = i.shop_id
  AND i.customer_phone_taken_by IS NOT NULL 
  AND i.customer_phone_taken_by != ''
  AND (i.staff_id IS NULL OR i.staff_id = '' OR i.staff_id = '0')
WHERE i.id = ?
  AND i.shop_id = ?  -- Verify shop_id matches session
```

**Backend Implementation:**
- Get `shop_id` from `session.user.shopId` or `session.user.tukaanId`
- Verify `i.shop_id = ?` matches session shop_id
- Return 403 Forbidden if shop_id doesn't match

### 4. Create Item Transaction

**Purpose:** Record an item transaction (DEEN/LA_BIXSHAY) with proper shop_id.

```sql
INSERT INTO items (
  id, 
  item_name, 
  detail, 
  quantity, 
  price,
  customer_phone_taken_by,  -- Customer phone (NOT taken_by!)
  taken_date, 
  staff_id,                  -- Staff who recorded
  shop_id,                   -- From session (REQUIRED)
  payment_type, 
  created_at
) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, NOW())
```

**Backend Implementation:**
- Get `shop_id` from `session.user.shopId` or `session.user.tukaanId` (REQUIRED)
- Get `customer_phone` from `customers` table WHERE `shop_id = ?` AND `id = ?`
- Set `staff_id` = `session.user.id` (staff/admin who recorded)
- Set `customer_phone_taken_by` = customer phone
- Never accept `shop_id` from frontend input

## Security Checklist

- ✅ All queries filter by `shop_id` from backend session
- ✅ Never accept `shop_id` from frontend input
- ✅ Staff joins verify `s.shop_id = i.shop_id`
- ✅ Customer joins verify `u.shop_id = i.shop_id` AND `u.user_type = 'customer'`
- ✅ Never use `taken_by` column (doesn't exist)
- ✅ Use `customer_phone_taken_by` for customer references
- ✅ Use `staff_id` for staff references
- ✅ Check NULL and empty string for `staff_id` and `customer_phone_taken_by`

## Example Usage in Backend

```typescript
// Get shop_id from session
const session = await getSession(req);
const shopId = session.user.shopId || session.user.tukaanId;

if (!shopId) {
  return NextResponse.json(
    { error: 'You must be associated with a shop' },
    { status: 403 }
  );
}

// Query customers for this shop
const customers = await query(
  `SELECT * FROM users 
   WHERE user_type = 'customer' AND shop_id = ?`,
  [shopId]
);

// Query items for this shop
const items = await query(
  `SELECT * FROM items WHERE shop_id = ?`,
  [shopId]
);
```

