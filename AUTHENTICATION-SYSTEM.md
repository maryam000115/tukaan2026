# Tukaanle Authentication & Authorization System

## Overview

This document describes the complete authentication and authorization system for Tukaanle, including registration, login, and middleware guards.

## Database Tables

### `staff_users` (Staff/Admin Accounts)
- `id` - Primary key (UUID or AUTO_INCREMENT)
- `shop_id` - Foreign key to shop/tukaan
- `first_name`, `middle_name`, `last_name` - Name fields
- `phone` - UNIQUE, 9 digits (normalized)
- `password` - Bcrypt hashed
- `gender` - Optional
- `role` - ENUM('STAFF', 'ADMIN', 'SUPER_ADMIN')
- `status` - ENUM('ACTIVE', 'SUSPENDED')
- `created_at` - Timestamp

### `users` (Customer Accounts)
- `id` - Primary key (UUID or AUTO_INCREMENT)
- `first_name`, `middle_name`, `last_name` - Name fields
- `phone` - UNIQUE, 9 digits (normalized)
- `password` - Bcrypt hashed
- `gender` - Optional
- `user_type` - ENUM('customer', 'normal')
- `shop_id` - Foreign key to shop/tukaan
- `location` - Optional
- `created_at` - Timestamp

## Registration System

### Endpoint: `POST /api/auth/register`

**Request Body:**
```json
{
  "accountType": "customer" | "staff",
  "tukaan_id": "shop_id",
  "first_name": "string",
  "middle_name": "string (optional)",
  "last_name": "string",
  "phone": "9-digit string",
  "password": "string (min 6 chars)",
  "gender": "string (optional)",
  "location": "string (optional, for customers)"
}
```

**Rules:**
1. **Customer Registration:**
   - Inserts into `users` table
   - Sets `user_type = 'customer'`
   - Requires `shop_id` (tukaan_id)

2. **Staff Registration:**
   - Inserts into `staff_users` table
   - Sets `role = 'STAFF'` (always)
   - Sets `status = 'ACTIVE'` (always)
   - Requires `shop_id` (tukaan_id)
   - Admin/SuperAdmin accounts are created manually in DB (not from UI)

3. **Phone Uniqueness:**
   - Phone must be unique across BOTH `users` and `staff_users` tables
   - Normalized to 9 digits (removes non-digits)
   - Validation: exactly 9 digits, cannot start with 0

4. **Password:**
   - Minimum 6 characters
   - Hashed with bcrypt (12 rounds)

5. **ID Generation:**
   - Supports both UUID and AUTO_INCREMENT
   - Tries UUID first, falls back to AUTO_INCREMENT if needed

**Response:**
```json
{
  "success": true,
  "message": "Account created successfully",
  "user": {
    "id": "user_id",
    "accountType": "customer" | "staff",
    "firstName": "string",
    "lastName": "string",
    "phone": "string",
    "shopId": "shop_id",
    "role": "STAFF" (for staff only)
  }
}
```

## Login System

### Endpoint: `POST /api/auth/login`

**Request Body:**
```json
{
  "phone": "9-digit string",
  "password": "string"
}
```

**Rules:**
1. **Only STAFF/ADMIN can login:**
   - Checks `staff_users` table only
   - Customers cannot access staff dashboard
   - Returns 403 if customer tries to login

2. **Status Check:**
   - Must have `status = 'ACTIVE'`
   - If `status = 'SUSPENDED'` → Returns 403 with message: "Your account is suspended. Contact admin."

3. **Password Verification:**
   - Uses bcrypt to verify password
   - Returns 401 if invalid

4. **Rate Limiting:**
   - Maximum 5 attempts per 15 minutes per phone
   - Returns 429 if exceeded

5. **System Status:**
   - Checks if system is locked
   - Returns 503 if system is locked (non-owner users)

**Response (Success):**
```json
{
  "success": true,
  "user": {
    "id": "user_id",
    "phone": "string",
    "role": "owner" | "admin" | "staff",
    "shopId": "shop_id",
    "tukaanId": "shop_id",
    "firstName": "string",
    "lastName": "string",
    "shopName": "string",
    "shopLocation": "string"
  }
}
```

**Response (Suspended):**
```json
{
  "success": false,
  "message": "Your account is suspended. Contact admin."
}
```

**Response (Invalid Credentials):**
```json
{
  "success": false,
  "message": "Invalid phone or password"
}
```

## Authorization Middleware

### `lib/middleware.ts` - `getSession()`

**Functionality:**
1. Verifies JWT session token from cookie
2. Checks system status (blocks non-owners if locked)
3. **CRITICAL: Verifies staff/admin status is ACTIVE**
   - Queries `staff_users` table
   - If `status != 'ACTIVE'` → Returns `{ user: null, error: 'ACCOUNT_SUSPENDED' }`
   - If user not found → Returns `{ user: null, error: 'USER_NOT_FOUND' }`

**Returns:**
```typescript
{
  user: SessionUser | null,
  error?: 'ACCOUNT_SUSPENDED' | 'USER_NOT_FOUND' | 'SYSTEM_LOCKED' | 'VERIFICATION_FAILED'
}
```

### `lib/auth-guard.ts` - `authGuard()`

**Usage:**
```typescript
export async function GET(req: NextRequest) {
  const guard = await authGuard(req, { 
    allowedRoles: ['admin', 'staff'],
    requireShop: true 
  });
  
  if (guard.error) {
    return guard.response; // Already formatted NextResponse
  }
  
  const { user } = guard;
  // Continue with route logic...
}
```

**Options:**
- `allowedRoles`: Array of roles allowed to access route
- `requireShop`: If true, requires user to be associated with a shop
- `unauthorizedMessage`: Custom error message

**Features:**
1. Checks authentication
2. Verifies staff/admin status is ACTIVE (double-check from database)
3. Blocks SUSPENDED accounts with 403 and clears session cookie
4. Enforces role restrictions
5. Enforces shop requirement

**Response (Suspended Account):**
```json
{
  "error": "Your account is suspended. Contact admin.",
  "logout": true
}
```
- Also clears `session` cookie to force logout

## Protected Route Enforcement

### All Protected Routes Must:

1. **Check Authentication:**
   - Use `getSession()` or `authGuard()`
   - Return 401 if not authenticated

2. **Check Status:**
   - Verify staff/admin `status = 'ACTIVE'`
   - Return 403 if SUSPENDED
   - Clear session cookie if suspended

3. **Check Permissions:**
   - Verify role has permission
   - Verify shop association if required

### Example Protected Route:

```typescript
// app/api/items/route.ts
import { authGuard } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const guard = await authGuard(req, { 
    allowedRoles: ['admin', 'staff'],
    requireShop: true 
  });
  
  if (guard.error) {
    return guard.response!;
  }
  
  const { user } = guard;
  const shopId = user.shopId;
  
  // Continue with route logic...
  // All queries must filter by shopId for security
}
```

## Security Features

1. **Password Hashing:**
   - Bcrypt with 12 rounds
   - Never store plain text passwords

2. **Phone Normalization:**
   - Removes all non-digits
   - Validates exactly 9 digits
   - Prevents leading zeros

3. **Rate Limiting:**
   - 5 attempts per 15 minutes per phone
   - Prevents brute force attacks

4. **Session Management:**
   - JWT tokens with 30-day expiration
   - HttpOnly cookies (prevents XSS)
   - Secure flag in production

5. **Status Verification:**
   - Double-checks status from database on every request
   - Automatically logs out suspended users
   - Prevents access even if session is valid

6. **Shop Isolation:**
   - All queries filtered by `shop_id` from session
   - Prevents cross-shop data access

## Error Messages

| Error | Status | Message |
|-------|--------|---------|
| Not authenticated | 401 | "Unauthorized. Please log in." |
| Account suspended | 403 | "Your account is suspended. Contact admin." |
| Invalid credentials | 401 | "Invalid phone or password" |
| Rate limit exceeded | 429 | "Too many login attempts. Please try again after X seconds." |
| System locked | 503 | "System is currently locked for maintenance" |
| Phone already exists | 400 | "Phone number already registered" |
| Shop not found | 400 | "Selected shop does not exist" |

## Testing

### Test Registration:
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

### Test Login:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "612345678",
    "password": "password123"
  }'
```

### Test Suspended Account:
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

