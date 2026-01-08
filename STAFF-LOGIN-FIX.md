# Staff/Admin Login Fix - Complete Implementation

## Problem
Registration works but Staff/Admin login fails with "Invalid phone or password" or session not created.

## Solution Implemented

### 1. Phone Normalization Helper (`lib/phone-normalize.ts`)

**Rules:**
1. Remove spaces and non-digits
2. If starts with +252 or 252, remove country code
3. If starts with 0 and length=10, remove leading 0
4. Final phone must be exactly 9 digits

**Code:**
```typescript
export function normalizePhone(phone: string): string | null {
  // Step 1: Remove all non-digits
  let numericPhone = phone.replace(/\D/g, '');

  // Step 2: Remove country code if starts with +252 or 252
  if (numericPhone.startsWith('252') && numericPhone.length >= 12) {
    numericPhone = numericPhone.substring(3);
  }

  // Step 3: If starts with 0 and length=10, remove leading 0
  if (numericPhone.startsWith('0') && numericPhone.length === 10) {
    numericPhone = numericPhone.substring(1);
  }

  // Step 4: Final phone must be exactly 9 digits
  if (numericPhone.length !== 9 || !/^\d{9}$/.test(numericPhone)) {
    return null;
  }

  return numericPhone;
}
```

### 2. Staff Login SQL Query (`lib/auth.ts`)

**Exact Query:**
```sql
SELECT id, shop_id, phone, password, role, status, first_name, middle_name, last_name
FROM staff_users 
WHERE phone = ? 
LIMIT 1
```

**Parameters:** `[normalizedPhone]` (exactly 9 digits)

### 3. Password Verification

**Uses bcrypt.compare:**
```typescript
import { compare } from 'bcryptjs';

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return compare(password, hashedPassword);
}
```

### 4. Status Validation

**Rules:**
- Status MUST be `'ACTIVE'` (case-insensitive)
- If status != `'ACTIVE'` → throw `ACCOUNT_SUSPENDED` error
- Login API returns 403 with message "Account suspended"

**Code:**
```typescript
const userStatus = (staffUser.status || '').toUpperCase();
if (userStatus !== 'ACTIVE') {
  throw new Error('ACCOUNT_SUSPENDED');
}
```

### 5. Session Creation

**Required Fields:**
```typescript
{
  id: string,              // User ID (converted to string)
  phone: string,            // User phone (9 digits)
  role: 'staff' | 'admin' | 'owner',
  accountType: 'staff',     // ✅ CRITICAL
  status: 'ACTIVE',         // ✅ CRITICAL
  shopId: string | null,    // Shop ID (converted to string)
  firstName: string,
  lastName: string,
  shopName: string | null,
  shopLocation: string | null,
}
```

### 6. Redirect to Dashboard

**Login API Response:**
```typescript
{
  success: true,
  accountType: 'staff',
  user: { ... }
}
```

**Frontend Redirect:**
```typescript
if (data.success && data.user) {
  const accountType = data.user.accountType || data.accountType;
  if (accountType === 'customer') {
    window.location.href = '/dashboard-customer';
  } else {
    window.location.href = '/dashboard-staff'; // ✅ Staff/Admin redirect
  }
}
```

## Validation Conditions Checklist

### ✅ Phone Normalization
- [x] Remove spaces and non-digits
- [x] Remove country code (+252 or 252)
- [x] Remove leading 0 if length=10
- [x] Final phone must be exactly 9 digits
- [x] Return null if normalization fails

### ✅ SQL Query
- [x] Simple SELECT with `WHERE phone = ?`
- [x] Use `LIMIT 1` for performance
- [x] Select all required fields
- [x] Use normalized phone as parameter

### ✅ Password Verification
- [x] Use `bcrypt.compare()` (not plain compare)
- [x] Handle bcrypt errors gracefully
- [x] Return null if password invalid

### ✅ Status Validation
- [x] Check status is `'ACTIVE'` (case-insensitive)
- [x] Throw `ACCOUNT_SUSPENDED` error if not ACTIVE
- [x] Login API returns 403 for suspended accounts

### ✅ Session Creation
- [x] Include `userId` (as string)
- [x] Include `accountType: 'staff'`
- [x] Include `role` (staff/admin/owner)
- [x] Include `status: 'ACTIVE'`
- [x] Include `shopId` (as string or null)
- [x] Include `phone` (9 digits)

### ✅ Redirect
- [x] Staff/Admin → `/dashboard-staff`
- [x] Customer → `/dashboard-customer`

## Testing Examples

### Test Case 1: Exact 9 digits
- **Input:** `618717273`
- **Normalized:** `618717273` ✅
- **Expected:** Match database phone `618717273`

### Test Case 2: With country code
- **Input:** `252618717273`
- **Normalized:** `618717273` ✅
- **Expected:** Match database phone `618717273`

### Test Case 3: With leading zero
- **Input:** `0618717273`
- **Normalized:** `618717273` ✅
- **Expected:** Match database phone `618717273`

### Test Case 4: Formatted phone
- **Input:** `+252 618 717 273`
- **Normalized:** `618717273` ✅
- **Expected:** Match database phone `618717273`

### Test Case 5: Suspended account
- **Status:** `SUSPENDED`
- **Expected:** 403 "Account suspended"

### Test Case 6: Wrong password
- **Expected:** 401 "Invalid phone or password"

## Files Modified

1. **`lib/phone-normalize.ts`** - New file with phone normalization helper
2. **`lib/auth.ts`** - Updated `authenticateUser()` and `checkStaffUsersTable()`
3. **`app/api/auth/login/route.ts`** - Already handles 403 for suspended accounts

## Debug Logging

The code logs:
1. **Phone normalization:** Original → Normalized
2. **SQL query:** Phone being searched
3. **User found:** ID, phone, role, status
4. **Password verification:** Success/failure
5. **Status check:** ACTIVE or SUSPENDED
6. **Session creation:** All fields being set

Check browser console and server logs for these messages.

