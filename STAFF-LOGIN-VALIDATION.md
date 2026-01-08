# Staff/Admin Login Validation Conditions

## Problem
Registration works but login fails when selecting "Staff/Admin" account type.

## Root Causes Identified

### 1. Phone Number Matching
**Issue**: Phone numbers in database are stored as 9-digit strings (e.g., `618717273`), but user input might be:
- `618717273` (9 digits) ✅
- `0618717273` (10 digits with leading zero)
- `252618717273` (12 digits with country code)
- `+252 618 717 273` (formatted with spaces/plus)

**Solution**: Try multiple phone format variants in SQL query:
```typescript
const phoneVariants = [
  finalPhone,                    // Last 9 digits: "618717273"
  numericPhone,                  // All digits: "0618717273" or "252618717273"
  phone.replace(/\D/g, ''),      // Original cleaned: "618717273"
];

// If numericPhone starts with 0, also try without leading zero
if (numericPhone.startsWith('0') && numericPhone.length > 9) {
  phoneVariants.push(numericPhone.substring(1)); // Remove leading zero
}
```

### 2. ID Type Handling
**Issue**: Database stores IDs as integers (1, 3, 4), but session expects strings.

**Solution**: Convert ID to string consistently:
```typescript
const sessionId = typeof staffUser.id === 'number' 
  ? String(staffUser.id) 
  : String(staffUser.id);
```

### 3. Shop ID Type Handling
**Issue**: `shop_id` might be integer or string.

**Solution**: Normalize to string:
```typescript
const shopIdString = staffUser.shop_id 
  ? (typeof staffUser.shop_id === 'number' ? String(staffUser.shop_id) : String(staffUser.shop_id))
  : null;
```

## Validation Conditions Checklist

### ✅ Phone Validation
- [x] Remove all non-digit characters
- [x] Must be at least 9 digits
- [x] Try last 9 digits (handles country codes)
- [x] Try full numeric (handles leading zeros)
- [x] Try without leading zero if starts with 0
- [x] Match against database phone column (VARCHAR)

### ✅ Password Validation
- [x] Check if password exists in database
- [x] Verify password with bcrypt
- [x] Handle bcrypt verification errors gracefully

### ✅ Status Validation
- [x] Check if status is 'ACTIVE'
- [x] Block 'SUSPENDED' users
- [x] Block 'INACTIVE' users
- [x] Treat NULL status as 'ACTIVE' (backward compatibility)

### ✅ Role Mapping
- [x] Map `STAFF` → `'staff'`
- [x] Map `ADMIN` → `'admin'`
- [x] Map `SUPER_ADMIN` → `'owner'`
- [x] Case-insensitive role matching

### ✅ Account Type
- [x] Always set `accountType: 'staff'` for staff_users table
- [x] Include `accountType` in session payload
- [x] Include `status` in session payload

### ✅ Shop ID
- [x] Get shop_id from staff_users table
- [x] Convert to string for session
- [x] Handle NULL shop_id (for owners)

## Database Schema (from screenshot)

**staff_users table:**
- `id`: INTEGER (1, 3, 4)
- `shop_id`: INTEGER (1)
- `phone`: VARCHAR (618717273, 618717271, 615668866)
- `role`: VARCHAR (STAFF, ADMIN)
- `status`: VARCHAR (ACTIVE)
- `password`: VARCHAR (bcrypt hash)

## SQL Query Used

```sql
SELECT id, phone, password, role, status, shop_id, first_name, last_name 
FROM staff_users 
WHERE phone = ? OR phone = ? OR phone = ? OR phone = ?
```

**Parameters**: [finalPhone, numericPhone, cleanedPhone, numericPhoneWithoutLeadingZero]

## Debug Logging

The code now logs:
1. **Login attempt**: Original phone, normalized phone, final phone
2. **Phone variants**: All phone formats being tried
3. **Staff user found**: ID, phone, role, status, hasPassword
4. **Password verification**: Success/failure with details
5. **Login successful**: ID, role, status, shopId

## Testing Steps

1. **Test with exact phone** (9 digits):
   - Input: `618717273`
   - Expected: Should match database phone `618717273`

2. **Test with leading zero**:
   - Input: `0618717273`
   - Expected: Should match database phone `618717273` (after normalization)

3. **Test with country code**:
   - Input: `252618717273`
   - Expected: Should match database phone `618717273` (last 9 digits)

4. **Test with formatted phone**:
   - Input: `+252 618 717 273`
   - Expected: Should normalize to `252618717273` then extract `618717273`

5. **Test with wrong password**:
   - Expected: Should return `null` with error log

6. **Test with suspended account**:
   - Expected: Should throw `ACCOUNT_SUSPENDED` error

## Common Issues and Fixes

### Issue: "No staff user found"
**Cause**: Phone format mismatch
**Fix**: Improved phone normalization with multiple variants

### Issue: "Password verification failed"
**Cause**: Wrong password or bcrypt hash mismatch
**Fix**: Enhanced error logging to show password hash details

### Issue: "Session missing required fields"
**Cause**: accountType or status not set in session
**Fix**: Explicitly set all required fields in SessionUser object

### Issue: "ID type mismatch"
**Cause**: Database returns integer, session expects string
**Fix**: Convert ID to string consistently

