# SQL Queries for Reports

## Items List Query (Shop-Scoped)

### For Staff/Admin (filtered by shop_id):
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
  
  -- Shop fields (from tukaans)
  t.tukaan_code AS shop_tukaan_code,
  t.name AS shop_name,
  t.location AS shop_location,
  t.phone AS shop_phone,
  
  -- Staff fields (who recorded the item)
  s.id AS recorded_by_staff_id,
  s.first_name AS recorded_by_staff_first_name,
  s.middle_name AS recorded_by_staff_middle_name,
  s.last_name AS recorded_by_staff_last_name,
  s.phone AS recorded_by_staff_phone,
  s.role AS recorded_by_staff_role,
  
  -- Customer fields (who took the item)
  u.id AS taken_by_customer_id,
  u.first_name AS taken_by_customer_first_name,
  u.middle_name AS taken_by_customer_middle_name,
  u.last_name AS taken_by_customer_last_name,
  u.phone AS taken_by_customer_phone,
  u.user_type AS customer_user_type
  
FROM items i

-- Join shop (tukaans) - required
LEFT JOIN tukaans t ON i.shop_id = t.id

-- Join staff_users (who recorded the item) - INNER JOIN since staff_id is NOT NULL
INNER JOIN staff_users s ON i.staff_id = s.id 
  AND s.shop_id = i.shop_id

-- Join users (customer who took the item) - INNER JOIN since customer_phone_taken_by is NOT NULL
INNER JOIN users u ON i.customer_phone_taken_by = u.phone 
  AND (u.user_type = 'customer' OR u.user_type = 'normal')
  AND u.shop_id = i.shop_id

WHERE i.shop_id = ?  -- Filter by logged-in staff/admin shop_id

ORDER BY i.created_at DESC
```

### For Customer (filtered by phone AND shop_id):
```sql
-- Same query as above, but with additional WHERE conditions:
WHERE i.shop_id = ? 
  AND i.customer_phone_taken_by = ?  -- Customer's phone
```

### For Owner (no shop filter):
```sql
-- Same query as Staff/Admin, but without WHERE i.shop_id = ?
-- Owner sees all items across all shops
```

## Customer-Wise Summary Report (Grouped by Customer)

```sql
SELECT 
  u.id AS customer_id,
  CONCAT(
    COALESCE(u.first_name, ''),
    CASE WHEN u.middle_name IS NOT NULL AND u.middle_name != '' 
      THEN CONCAT(' ', u.middle_name) ELSE '' END,
    CASE WHEN u.last_name IS NOT NULL AND u.last_name != '' 
      THEN CONCAT(' ', u.last_name) ELSE '' END
  ) AS customer_full_name,
  u.phone AS customer_phone,
  COUNT(i.id) AS total_items,
  SUM(CASE 
    WHEN i.payment_type = 'DEEN' THEN (i.quantity * i.price)
    ELSE 0 
  END) AS total_deen,
  SUM(CASE 
    WHEN i.payment_type IN ('CASH', 'LA_BIXSHAY', 'PAID') THEN (i.quantity * i.price)
    ELSE 0 
  END) AS total_cash,
  SUM(CASE 
    WHEN i.payment_type = 'DEEN' THEN (i.quantity * i.price)
    ELSE 0 
  END) - SUM(CASE 
    WHEN i.payment_type IN ('CASH', 'LA_BIXSHAY', 'PAID') THEN (i.quantity * i.price)
    ELSE 0 
  END) AS balance

FROM users u

-- Join items taken by this customer
INNER JOIN items i ON i.customer_phone_taken_by = u.phone
  AND i.shop_id = u.shop_id  -- Ensure same shop
  AND (u.user_type = 'customer' OR u.user_type = 'normal')

WHERE u.shop_id = ?  -- Filter by logged-in staff/admin shop_id

  -- Optional filters
  -- AND DATE(i.taken_date) >= ?  -- startDate
  -- AND DATE(i.taken_date) <= ?  -- endDate
  -- AND i.payment_type = ?       -- paymentType filter

GROUP BY u.id, u.first_name, u.middle_name, u.last_name, u.phone

ORDER BY customer_full_name ASC
```

## Single Customer Detail Report

```sql
-- Customer Profile
SELECT 
  u.id,
  u.first_name,
  u.middle_name,
  u.last_name,
  u.phone,
  u.shop_id,
  t.name AS shop_name,
  t.location AS shop_location
FROM users u
LEFT JOIN tukaans t ON u.shop_id = t.id
WHERE u.phone = ?
  AND u.shop_id = ?  -- Ensure same shop
  AND (u.user_type = 'customer' OR u.user_type = 'normal')
LIMIT 1;

-- All Items for this Customer
SELECT 
  i.id,
  i.item_name,
  i.detail,
  i.quantity,
  i.price,
  (i.quantity * i.price) AS total,
  i.payment_type,
  i.taken_date,
  i.created_at,
  
  -- Staff who recorded
  s.first_name AS recorded_by_first_name,
  s.middle_name AS recorded_by_middle_name,
  s.last_name AS recorded_by_last_name,
  s.phone AS recorded_by_phone,
  s.role AS recorded_by_role,
  CONCAT(
    COALESCE(s.first_name, ''),
    CASE WHEN s.middle_name IS NOT NULL AND s.middle_name != '' 
      THEN CONCAT(' ', s.middle_name) ELSE '' END,
    CASE WHEN s.last_name IS NOT NULL AND s.last_name != '' 
      THEN CONCAT(' ', s.last_name) ELSE '' END
  ) AS recorded_by_full_name

FROM items i

INNER JOIN staff_users s ON i.staff_id = s.id 
  AND s.shop_id = i.shop_id

WHERE i.customer_phone_taken_by = ?
  AND i.shop_id = ?  -- Ensure same shop
  
  -- Optional filters
  -- AND DATE(i.taken_date) >= ?  -- startDate
  -- AND DATE(i.taken_date) <= ?  -- endDate
  -- AND i.payment_type = ?       -- paymentType filter

ORDER BY i.created_at DESC;
```

## Report Totals Calculation

```sql
-- Total DEEN, Total PAID, Balance for filtered items
SELECT 
  SUM(CASE 
    WHEN i.payment_type = 'DEEN' THEN (i.quantity * i.price)
    ELSE 0 
  END) AS total_deen,
  SUM(CASE 
    WHEN i.payment_type IN ('CASH', 'LA_BIXSHAY', 'PAID') THEN (i.quantity * i.price)
    ELSE 0 
  END) AS total_paid,
  SUM(CASE 
    WHEN i.payment_type = 'DEEN' THEN (i.quantity * i.price)
    ELSE 0 
  END) - SUM(CASE 
    WHEN i.payment_type IN ('CASH', 'LA_BIXSHAY', 'PAID') THEN (i.quantity * i.price)
    ELSE 0 
  END) AS balance

FROM items i

INNER JOIN users u ON i.customer_phone_taken_by = u.phone
  AND u.shop_id = i.shop_id
  AND (u.user_type = 'customer' OR u.user_type = 'normal')

WHERE i.shop_id = ?  -- Filter by shop_id

  -- Optional filters
  -- AND i.customer_phone_taken_by = ?  -- customer filter
  -- AND DATE(i.taken_date) >= ?         -- startDate
  -- AND DATE(i.taken_date) <= ?         -- endDate
  -- AND i.payment_type = ?              -- paymentType filter
```

## Notes

1. **Shop Scoping**: All queries filter by `shop_id` from session (except Owner who sees all)
2. **Customer Filtering**: Customers can only see items where `customer_phone_taken_by = their_phone` AND `shop_id = their_shop_id`
3. **Payment Types**: 
   - `DEEN` = Credit (debt)
   - `CASH`, `LA_BIXSHAY`, `PAID` = Paid
4. **Balance Calculation**: `total_deen - total_paid = balance`

