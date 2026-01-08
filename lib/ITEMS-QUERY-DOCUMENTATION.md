# Items Query Documentation

## Overview
This document describes the optimized SQL query system for fetching items with proper joins, handling items taken by STAFF or CUSTOMER.

## Database Schema

### Tables Used

1. **items**
   - `id` - Primary key
   - `item_name` - Item name
   - `detail` - Item description
   - `quantity` - Quantity
   - `price` - Price
   - `payment_type` - Payment type (DEEN, LA_BIXSHAY, etc.)
   - `taken_date` - Date item was taken
   - `staff_id` - ID of staff who took/recorded the item (nullable)
   - `customer_phone_taken_by` - Phone number of customer who took the item (nullable)
   - `shop_id` - ID of shop/tukaan the item belongs to
   - `created_at` - Creation timestamp

2. **tukaans** (shops)
   - `id` - Primary key
   - `tukaan_code` - Shop code
   - `name` - Shop name
   - `location` - Shop location
   - `phone` - Shop phone

3. **staff_users**
   - `id` - Primary key
   - `tukaan_id` - Shop ID this staff belongs to
   - `first_name`, `middle_name`, `last_name` - Staff name
   - `phone` - Staff phone
   - `role` - Staff role

4. **users** (customers)
   - `id` - Primary key
   - `first_name`, `middle_name`, `last_name` - Customer name
   - `phone` - Customer phone (used to match with `customer_phone_taken_by`)
   - `user_type` - User type

## Business Rules

1. **Item Taken By Logic:**
   - If `items.staff_id` IS NOT NULL (and not empty/zero), the item is taken by **STAFF**
   - If `items.customer_phone_taken_by` IS NOT NULL (and not empty), the item is taken by **CUSTOMER**
   - There is **NO** `taken_by` column - do not use it

2. **Joins:**
   - Items always belong to a shop: `items.shop_id = tukaans.id`
   - Staff are linked to shops: `staff_users.tukaan_id = tukaans.id`
   - Customers are linked via phone: `users.phone = items.customer_phone_taken_by`

## Optimized Query

The query uses:
- **LEFT JOIN** for shop (tukaans) - always joined
- **LEFT JOIN** for staff_users - only when `staff_id` is not null
- **LEFT JOIN** for users (customers) - only when `customer_phone_taken_by` is not null AND `staff_id` is null
- **CASE WHEN** to compute `taken_by_type`: 'STAFF', 'CUSTOMER', or 'UNKNOWN'

### Example Query

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
  
  -- Shop fields
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
LEFT JOIN staff_users s ON i.staff_id = s.id 
  AND i.staff_id IS NOT NULL 
  AND i.staff_id != '' 
  AND i.staff_id != '0'

-- Join users (customers) when item is taken by customer
LEFT JOIN users u ON i.customer_phone_taken_by = u.phone 
  AND i.customer_phone_taken_by IS NOT NULL 
  AND i.customer_phone_taken_by != ''
  AND (i.staff_id IS NULL OR i.staff_id = '' OR i.staff_id = '0')

WHERE i.shop_id = ?  -- Optional shop filter
ORDER BY i.created_at DESC
```

## Usage

### In Code

```typescript
import { buildItemsQuery, addItemFilters } from '@/lib/items-query';

// Build query with shop filter
const { sql, params } = buildItemsQuery(shopId, []);

// Add filters
const { where, params: filterParams } = addItemFilters([], [], {
  paymentType: 'DEEN',
  customerPhone: '1234567890',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
});

// Execute query
const items = await query<ItemQueryResult>(sql, [...params, ...filterParams]);
```

## API Response Format

The API returns items with:
- Basic item information
- `takenByType`: 'STAFF' | 'CUSTOMER' | 'UNKNOWN'
- `takenByInfo`: Object with details about who took the item (staff or customer)
- Shop information
- Payment totals (DEEN, PAID, Balance)

## Important Notes

1. **Never use `taken_by` column** - it doesn't exist in the database
2. **Always use `customer_phone_taken_by`** for customer references
3. **Always use `staff_id`** for staff references
4. **Check both NULL and empty string** when determining taken_by_type
5. **Use LEFT JOIN** to avoid excluding items when staff/customer data is missing

