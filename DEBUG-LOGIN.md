# Debug Login Issues

## Steps to Debug:

1. **Check Browser Console:**
   - Open browser DevTools (F12)
   - Go to Console tab
   - Try to login
   - Look for error messages or debug logs

2. **Check Network Tab:**
   - Open browser DevTools (F12)
   - Go to Network tab
   - Try to login
   - Check the `/api/auth/login` request:
     - Status code (should be 200 for success)
     - Response body (should have `success: true` and `user` object)
   - Check the `/api/auth/me` request after login:
     - Should return user data

3. **Check Server Logs:**
   - Look at the terminal/console where Next.js is running
   - Check for error messages or debug logs

## Common Issues:

### Issue 1: Phone Number Not Found
- **Symptom:** "Invalid phone or password"
- **Check:** 
  - Phone number in database: `618238213` or `618717273`
  - Phone number entered: Should be exactly 9 digits
  - Check server logs for "No staff user found for phone"

### Issue 2: Password Mismatch
- **Symptom:** "Invalid phone or password"
- **Check:**
  - Password hash in database starts with `$2b$12$`
  - Password entered matches the one used during registration
  - Check server logs for "Password verification failed"

### Issue 3: Account Suspended
- **Symptom:** "Your account is suspended. Contact admin."
- **Check:**
  - `status` column in `staff_users` table should be `ACTIVE`
  - If `NULL`, it should be treated as ACTIVE

### Issue 4: Redirect Not Working
- **Symptom:** Login succeeds but stays on login page
- **Check:**
  - Browser console for JavaScript errors
  - Network tab to see if `/api/auth/me` is called
  - Check if session cookie is set

## Test Credentials (from database):

**Admin:**
- Phone: `618238213`
- Password: (check what was set during registration)
- Role: `ADMIN`
- Status: `ACTIVE`

**Staff:**
- Phone: `618717273`
- Password: (check what was set during registration)
- Role: `STAFF`
- Status: `ACTIVE`

## Quick Test:

Run this SQL to check user data:
```sql
SELECT id, phone, role, status, 
       LENGTH(password) as password_length,
       LEFT(password, 10) as password_preview
FROM staff_users;
```

The password should be a bcrypt hash (starts with `$2b$12$` and is about 60 characters long).

