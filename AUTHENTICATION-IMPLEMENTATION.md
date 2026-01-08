# Tukaanle Authentication & Authorization Implementation

## Overview

Complete registration and login system with strict account type separation for Staff/Admin and Customer accounts.

## Database Tables

### A) `staff_users` (for Staff/Admin)
```sql
CREATE TABLE staff_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  middle_name VARCHAR(255),
  last_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,  -- bcrypt hash
  gender VARCHAR(20),
  role ENUM('STAFF', 'ADMIN') NOT NULL,
  status ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### B) `users` (for Customers only)
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(255) NOT NULL,
  middle_name VARCHAR(255),
  last_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,  -- bcrypt hash
  gender VARCHAR(20),
  user_type VARCHAR(50) NOT NULL DEFAULT 'normal',
  shop_id INT,
  location VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Registration Implementation

### Endpoint: `POST /api/auth/register`

**Request Body:**
```json
{
  "accountType": "staff" | "customer",
  "tukaan_id": 1,  // shop_id
  "first_name": "John",
  "middle_name": "Middle",
  "last_name": "Doe",
  "phone": "612345678",  // Exactly 9 digits
  "password": "password123",  // Min 6 characters
  "gender": "male" | "female",
  "location": "Optional location"  // For customers only
}
```

**Validation Rules:**
- Phone: Exactly 9 digits, numeric only, cannot start with 0
- Password: Minimum 6 characters
- First name: Required
- Last name: Required
- Shop ID: Required (must exist in `tukaans` or `shops` table)
- Phone uniqueness: Checked across BOTH `staff_users` and `users` tables

**SQL Queries:**

1. **Check Phone Uniqueness:**
```sql
-- Check in users table
SELECT id FROM users WHERE phone = ?;

-- Check in staff_users table
SELECT id FROM staff_users WHERE phone = ?;
```

2. **Register Staff:**
```sql
INSERT INTO staff_users (
  shop_id, first_name, middle_name, last_name, phone, password,
  gender, role, status, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, 'STAFF', 'ACTIVE', NOW());
```

3. **Register Customer:**
```sql
INSERT INTO users (
  first_name, middle_name, last_name, phone, password,
  gender, user_type, shop_id, location, created_at
) VALUES (?, ?, ?, ?, ?, ?, 'normal', ?, ?, NOW());
```

**Password Hashing:**
- Uses `bcryptjs` with 12 rounds
- Hash is generated before insert: `await hashPassword(password)`

**Response:**
```json
{
  "success": true,
  "message": "Staff account created successfully" | "Customer account created successfully",
  "user": {
    "id": 1,
    "accountType": "staff" | "customer",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "612345678",
    "shopId": 1
  }
}
```

## Login Implementation

### Endpoint: `POST /api/auth/login`

**Request Body:**
```json
{
  "accountType": "staff" | "customer",
  "phone": "612345678",
  "password": "password123"
}
```

**Login Rules:**
- **Staff/Admin Login:**
  - Checks ONLY `staff_users` table (NO fallback)
  - User must have `status = 'ACTIVE'`
  - If `status = 'SUSPENDED'` → Deny with message: "Account suspended"
  
- **Customer Login:**
  - Checks ONLY `users` table (NO fallback)
  - No status check (unless `users` table has status column)

**SQL Queries:**

1. **Staff Login:**
```sql
SELECT id, phone, password, role, status, shop_id, first_name, last_name
FROM staff_users
WHERE phone = ? OR phone = ? OR phone = ?
-- Parameters: [finalPhone (last 9 digits), numericPhone, original phone]
```

2. **Customer Login:**
```sql
SELECT id, phone, password, role, status, shop_id, tukaan_id, first_name, last_name, user_type
FROM users
WHERE phone = ? OR phone = ?
-- Parameters: [finalPhone (last 9 digits), numericPhone]
```

**Password Verification:**
- Uses `bcryptjs.compare(password, hashedPassword)`
- Returns `true` if password matches, `false` otherwise

**Session Creation:**
- Creates JWT token with user data
- Sets HTTP-only cookie: `session`
- Cookie expires in 30 days

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "1",
    "phone": "612345678",
    "role": "staff" | "admin" | "customer",
    "accountType": "staff" | "customer",
    "shopId": "1",
    "firstName": "John",
    "lastName": "Doe",
    "status": "ACTIVE"  // For staff only
  }
}
```

**Error Responses:**
- `401`: Invalid phone or password
- `403`: Account suspended (staff only)
- `400`: Validation errors
- `429`: Too many login attempts

## Authorization & Route Guards

### Middleware: `lib/route-guard.ts`

**Functions:**

1. **`requireAuth(request)`** - Require any authenticated user
2. **`requireStaffAuth(request)`** - Require staff/admin with `accountType='staff'` AND `status='ACTIVE'`
3. **`requireCustomerAuth(request)`** - Require customer with `accountType='customer'`

**Usage Example:**
```typescript
import { requireStaffAuth } from '@/lib/route-guard';

export async function GET(request: NextRequest) {
  const guard = await requireStaffAuth(request);
  
  if (!guard.allowed) {
    return guard.response; // Returns 401 or 403
  }
  
  // User is authenticated and authorized
  const user = guard.user;
  // ... your logic
}
```

**Route Protection Rules:**
- Staff dashboard routes: Use `requireStaffAuth()`
  - Checks: `accountType === 'staff'` AND `status === 'ACTIVE'`
  - If suspended: Clears session cookie and returns 403
  
- Customer routes: Use `requireCustomerAuth()`
  - Checks: `accountType === 'customer'`
  
- Shared routes: Use `requireAuth()`
  - Checks: User is authenticated (any account type)

## Session Interface

```typescript
interface SessionUser {
  id: string;
  phone: string;
  role: 'owner' | 'admin' | 'staff' | 'customer';
  accountType: 'staff' | 'customer';  // NEW: Tracks source table
  shopId?: string | null;
  tukaanId?: string | null;
  firstName: string;
  lastName: string;
  shopName?: string | null;
  shopLocation?: string | null;
  status?: string;  // For staff: 'ACTIVE' | 'SUSPENDED'
}
```

## Key Implementation Details

### Phone Normalization
- Removes all non-digit characters
- Takes last 9 digits (handles country codes like `252612345678` → `612345678`)
- Validates: Must be exactly 9 digits, cannot start with 0

### Password Security
- Hashing: `bcryptjs` with 12 rounds
- Storage: Hashed password stored in database
- Verification: `bcryptjs.compare()` for login

### Account Type Separation
- **NO FALLBACK**: Login checks ONLY the selected table
- Staff login → Only `staff_users`
- Customer login → Only `users`
- This ensures strict separation and prevents cross-table authentication

### Status Management
- Staff users have `status` field: `ACTIVE` or `SUSPENDED`
- Suspended staff cannot login (403 error)
- Status is checked during login AND in middleware
- Customers don't have status field (unless added to `users` table)

### Phone Uniqueness
- Enforced across BOTH tables
- Registration checks both `staff_users.phone` and `users.phone`
- Prevents duplicate phone numbers across account types

## Error Messages

### Registration Errors
- `"Phone number already registered"` - Phone exists in either table
- `"Phone number must be exactly 9 digits"` - Validation error
- `"Password must be at least 6 characters"` - Validation error
- `"Selected shop does not exist"` - Invalid shop_id
- `"Selected shop is not active"` - Shop status is not ACTIVE

### Login Errors
- `"Invalid phone or password"` - Wrong credentials
- `"Account suspended"` - Staff account is SUSPENDED
- `"Too many login attempts"` - Rate limiting (5 attempts per 15 minutes)

## Files Modified/Created

1. **`app/api/auth/register/route.ts`** - Registration endpoint
2. **`app/api/auth/login/route.ts`** - Login endpoint
3. **`lib/auth.ts`** - Authentication logic with accountType support
4. **`lib/middleware.ts`** - Session management with accountType
5. **`lib/route-guard.ts`** - Route protection middleware (NEW)
6. **`app/login/page.tsx`** - Login UI with account type dropdown
7. **`app/register/page.tsx`** - Registration UI

## Testing

### Test Registration
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "accountType": "staff",
    "tukaan_id": 1,
    "first_name": "Test",
    "last_name": "User",
    "phone": "612345678",
    "password": "password123",
    "gender": "male"
  }'
```

### Test Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "accountType": "staff",
    "phone": "612345678",
    "password": "password123"
  }'
```

## Security Features

1. **Password Hashing**: bcrypt with 12 rounds
2. **Rate Limiting**: 5 login attempts per 15 minutes per phone
3. **HTTP-only Cookies**: Session tokens stored in HTTP-only cookies
4. **Status Verification**: Staff status checked on every request
5. **Account Type Separation**: No cross-table authentication
6. **Phone Uniqueness**: Enforced across both tables
7. **Parameterized Queries**: All SQL uses parameterized queries to prevent injection

## Next Steps

1. Add email verification (optional)
2. Add password reset functionality
3. Add 2FA for admin accounts (optional)
4. Add audit logging for login/registration events
5. Add session timeout/refresh logic

