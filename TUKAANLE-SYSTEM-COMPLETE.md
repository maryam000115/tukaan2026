# Tukaanle - Complete Production System

## Overview

This document describes the complete production-ready Tukaanle shop management system with authentication, item management, and reporting features.

## Database Schema

### Tables

1. **users** (Customers Only)
   - `id` (PK)
   - `first_name`, `middle_name`, `last_name`
   - `phone` (UNIQUE, 9 digits)
   - `password` (bcrypt hash)
   - `gender` (Male/Female)
   - `user_type` = 'normal' (for customers)
   - `shop_id` (FK to shop)
   - `location`
   - `created_at`

2. **staff_users** (Staff/Admin Only)
   - `id` (PK)
   - `shop_id` (FK to shop)
   - `first_name`, `middle_name`, `last_name`
   - `phone` (UNIQUE, 9 digits)
   - `password` (bcrypt hash)
   - `gender`
   - `role` = 'STAFF' | 'ADMIN'
   - `status` = 'ACTIVE' | 'SUSPENDED'
   - `created_at`

3. **items**
   - `id` (PK)
   - `item_name`
   - `detail` (description)
   - `quantity`
   - `price`
   - `customer_phone_taken_by` (FK to users.phone) - **MANDATORY**
   - `taken_date` (DATE)
   - `staff_id` (FK to staff_users.id) - **MANDATORY** (who RECORDED)
   - `shop_id` (FK to shop)
   - `payment_type` = 'DEEN' | 'CASH'
   - `created_at`

### Business Rules

1. **Every item is ALWAYS taken by a CUSTOMER** (not staff)
2. `customer_phone_taken_by` is mandatory and must exist in `users.phone`
3. `staff_id` means "RECORDED BY" (not "taken by")
4. Staff/Admin can only access data in their own `shop_id`
5. `shop_id` must come from session/auth backend only (never trust frontend)

## Authentication & Authorization

### Registration (`POST /api/auth/register`)

- **Customer Registration:**
  - Inserts into `users` table
  - Sets `user_type = 'normal'`
  - Requires `shop_id` (tukaan_id)

- **Staff Registration:**
  - Inserts into `staff_users` table
  - Sets `role = 'STAFF'` (always)
  - Sets `status = 'ACTIVE'` (always)
  - Requires `shop_id` (tukaan_id)

- **Phone Uniqueness:**
  - Phone must be unique across BOTH `users` and `staff_users` tables
  - Normalized to 9 digits (removes non-digits)

- **Admin/SuperAdmin:**
  - Created manually in DB (not from UI)

### Login (`POST /api/auth/login`)

- **Only STAFF/ADMIN can login** to dashboard
- Customers cannot access staff dashboard
- **Status Check:**
  - Must have `status = 'ACTIVE'`
  - If `status = 'SUSPENDED'` → Returns 403: "Your account is suspended. Contact admin."

### Middleware Protection

- All protected routes check:
  - User is authenticated
  - Staff/Admin `status = 'ACTIVE'`
  - If suspended → 403 and clear session cookie

## Pages & Views

### 1. Login Page (`/login`)

- Fields: phone, password
- Error messages:
  - Invalid credentials → "Invalid credentials"
  - Suspended account → "Your account is suspended. Contact admin."
- Clean UI with black text

### 2. Registration Page (`/register`)

- Account Type dropdown: customer / staff
- Select Tukaan (shop) dropdown
- Fields: first_name, last_name, middle_name, phone (9 digits), gender, location, password, confirm password
- Form validations with black text
- On submit:
  - Customer → `users` table (`user_type='normal'`)
  - Staff → `staff_users` table (`role='STAFF'`, `status='ACTIVE'`)

### 3. Items List Page (`/items`)

**Display:**
- Shows ONLY items where `items.shop_id = logged_in_shop_id`
- Each item card shows:
  - `item_name`, `detail`
  - `quantity`, `price`, `total = quantity * price`
  - Payment type badge: CASH (green) / DEEN (red) - text stays black
  - **Taken By:** Customer name + phone
  - **Recorded By:** Staff name + role + phone
  - `taken_date`

**Filters:**
1. Payment type: All / CASH / DEEN
2. Customer dropdown: Only customers in same shop
3. Start Date and End Date (filter by `taken_date`)

**Summary:**
- Total DEEN (sum `quantity * price` where `payment_type='DEEN'`)
- Total CASH (sum `quantity * price` where `payment_type='CASH'`)
- Balance = DEEN - CASH

### 4. Create Item Page (`/items/create`)

- Customer dropdown (same shop customers only) - **REQUIRED**
- Fields: `item_name`, `detail`, `quantity`, `price`, `payment_type`, `taken_date`
- On create:
  - `staff_id` = logged_in_staff_id
  - `shop_id` = logged_in_shop_id
  - `customer_phone_taken_by` = selected customer phone
- Validations:
  - Staff status must be ACTIVE (block if suspended)
  - Customer must belong to same `shop_id`

### 5. Reports Page (`/reports`)

**Customer Summary Report:**
- Groups items by customer
- Shows:
  - Customer name + phone
  - `total_items`
  - `total_cash`
  - `total_deen`
  - `balance = total_deen - total_cash`
- Filters: date range, payment type
- Click customer → Opens detail view

**Customer Detail View:**
- Customer profile
- All items taken by that customer
- Recorded-by staff for each item
- Totals at bottom

## API Endpoints

### Authentication
- `POST /api/auth/login` - Staff/Admin login only
- `POST /api/auth/register` - Customer/Staff registration
- `GET /api/auth/me` - Get current user

### Items
- `GET /api/items` - List items (shop scoped + filters)
- `POST /api/items/transaction` - Create item transaction (ACTIVE staff only)

### Customers
- `GET /api/customers/dropdown` - Get customers for dropdown (shop scoped)

### Reports
- `GET /api/reports/customers` - Customer summary report (shop scoped)
- `GET /api/reports/customers/[phone]` - Single customer detail report

### Shops
- `GET /api/tukaans` - Get active shops for registration dropdown

## SQL Queries

### 1. Customer Dropdown (Same Shop)
```sql
SELECT phone, CONCAT_WS(' ', first_name, middle_name, last_name) AS full_name
FROM users
WHERE shop_id = ? AND user_type='normal'
ORDER BY first_name;
```

### 2. Items List with Joins
```sql
SELECT
  i.id, i.item_name, i.detail, i.quantity, i.price,
  (i.quantity * i.price) AS total_amount,
  i.payment_type, i.taken_date, i.created_at,
  CONCAT_WS(' ', u.first_name, u.middle_name, u.last_name) AS taken_by_customer_name,
  u.phone AS taken_by_customer_phone,
  CONCAT_WS(' ', su.first_name, su.middle_name, su.last_name) AS recorded_by_staff_name,
  su.phone AS recorded_by_staff_phone,
  su.role AS recorded_by_staff_role
FROM items i
INNER JOIN users u
  ON u.phone = i.customer_phone_taken_by
 AND u.shop_id = i.shop_id
INNER JOIN staff_users su
  ON su.id = i.staff_id
 AND su.shop_id = i.shop_id
WHERE i.shop_id = ?
ORDER BY i.created_at DESC;
```

### 3. Customer Summary Report
```sql
SELECT
  u.id AS customer_id,
  u.phone AS customer_phone,
  CONCAT_WS(' ', u.first_name, u.middle_name, u.last_name) AS customer_full_name,
  COUNT(i.id) AS total_items,
  SUM(CASE WHEN i.payment_type = 'CASH' THEN (i.quantity * i.price) ELSE 0 END) AS total_cash,
  SUM(CASE WHEN i.payment_type = 'DEEN' THEN (i.quantity * i.price) ELSE 0 END) AS total_deen
FROM users u
INNER JOIN items i ON u.phone = i.customer_phone_taken_by AND u.shop_id = i.shop_id
WHERE i.shop_id = ?
GROUP BY u.id, u.phone, u.first_name, u.middle_name, u.last_name
HAVING total_items > 0
ORDER BY total_deen DESC, customer_full_name ASC;
```

## Security Features

1. **Parameterized SQL Queries** - Prevents SQL injection
2. **Bcrypt Password Hashing** - 12 rounds
3. **Shop Isolation** - All queries filtered by `shop_id` from session
4. **Status Verification** - Checks `status = 'ACTIVE'` on every request
5. **Session Management** - JWT tokens with 30-day expiration
6. **HttpOnly Cookies** - Prevents XSS attacks

## UI Design

- **Color Scheme:**
  - White background
  - Text color: BLACK (#111 or #000)
  - Font: Inter or system font
  - Cards with subtle border and soft shadow
  - Buttons: primary green, text readable
  - Payment badges: DEEN (red), CASH (green) - but text stays black

- **Layout:**
  - Header with page title
  - Filters section in a card
  - Items list in cards/table
  - Empty state when no data

- **Labels:**
  - "Taken By" = Customer (who took the item)
  - "Recorded By" = Staff/Admin (who recorded the item)
  - Never display "Taken By: STAFF"

## File Structure

```
app/
  ├── login/page.tsx              # Login page
  ├── register/page.tsx           # Registration page
  ├── items/page.tsx              # Items list with filters
  ├── reports/page.tsx            # Reports page
  └── api/
      ├── auth/
      │   ├── login/route.ts      # Login endpoint
      │   └── register/route.ts   # Registration endpoint
      ├── items/
      │   ├── route.ts             # List items
      │   └── transaction/route.ts # Create item
      ├── customers/
      │   └── dropdown/route.ts    # Customer dropdown
      ├── reports/
      │   └── customers/
      │       ├── route.ts          # Customer summary
      │       └── [phone]/route.ts # Customer detail
      └── tukaans/route.ts         # Shops dropdown

lib/
  ├── auth.ts                     # Authentication functions
  ├── middleware.ts               # Session middleware
  ├── auth-guard.ts               # Route protection
  ├── items-query.ts              # SQL query builders
  └── db.ts                       # Database connection
```

## Testing

### Test Registration
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "accountType": "staff",
    "tukaan_id": "shop-id",
    "first_name": "Test",
    "last_name": "User",
    "phone": "612345678",
    "password": "password123"
  }'
```

### Test Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "612345678",
    "password": "password123"
  }'
```

### Test Suspended Account
1. Update `staff_users.status = 'SUSPENDED'` in database
2. Try to login → Should return 403 with suspension message
3. Try to access protected route → Should return 403 and clear session

## Notes

- Admin/SuperAdmin accounts must be created manually in the database
- Customers cannot login to the staff dashboard
- All staff accounts created via registration have `role = 'STAFF'`
- Phone uniqueness is enforced across both `users` and `staff_users` tables
- Status verification happens on every protected route access
- Suspended accounts are automatically logged out
- Payment type: Use 'CASH' for paid transactions (maps to 'LA_BIXSHAY' in legacy DB)

