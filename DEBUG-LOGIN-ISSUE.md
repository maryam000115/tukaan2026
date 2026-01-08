# Debug Login Issue - Step by Step

## Problem
Login ka mashaqeynaayo (login is not working) - Dashboard redirects back to login.

## Debug Steps Added

I've added console logging to help identify where the issue is:

### 1. Check Browser Console After Login

After clicking "Sign in", check the console for:

**Expected logs:**
```
Login API response: {status: 200, success: true, ...}
Login successful, redirecting to dashboard...
Dashboard auth check - Response status: 200
Dashboard auth check - Response data: {hasUser: true, userId: ..., accountType: 'staff', ...}
User authenticated, setting user data
```

**If you see:**
```
Dashboard auth check - Response data: {hasUser: false, ...}
No user found in session, redirecting to login
```

**This means:** Cookie is not being read or session verification is failing.

### 2. Check Server Terminal Logs

Look for these logs in your Next.js server terminal:

**When login happens:**
```
Login attempt result: {phone: ..., userFound: true, ...}
```

**When dashboard loads:**
```
getSession - Cookie check: {hasToken: true, tokenLength: ...}
getSession - User verified: {id: ..., accountType: 'staff', ...}
Auth me - Session check: {hasSession: true, hasUser: true, ...}
```

**If you see:**
```
getSession - No token found in cookies
```
**Problem:** Cookie is not being set or saved.

**If you see:**
```
getSession - Token verification failed
```
**Problem:** JWT secret mismatch or token is invalid.

### 3. Check Network Tab

1. Open DevTools → Network tab
2. Login
3. Check `/api/auth/login` request:
   - **Response Headers** → Should see `Set-Cookie: session=...`
   - **Response Body** → Should have `success: true` and `accountType: 'staff'`

4. Check `/api/auth/me` request (when dashboard loads):
   - **Request Headers** → Should see `Cookie: session=...`
   - **Response Body** → Should have `user: {...}` with `accountType` and `status`

### 4. Check Application → Cookies

1. DevTools → Application → Cookies → `http://localhost:3000`
2. Should see `session` cookie with:
   - **Name:** `session`
   - **Value:** Long JWT token string
   - **HttpOnly:** ✓ (checked)
   - **SameSite:** `Lax`
   - **Path:** `/`

**If cookie is missing:** Cookie is not being set.

**If cookie exists but dashboard still redirects:** Session verification is failing.

## Common Issues & Fixes

### Issue 1: Cookie Not Being Set

**Symptoms:**
- No `session` cookie in Application → Cookies
- `getSession - No token found in cookies` in server logs

**Possible Causes:**
1. Cookie domain mismatch
2. `secure: true` in development (should be `false` for localhost)
3. Browser blocking cookies

**Fix:**
Check `app/api/auth/login/route.ts`:
```typescript
response.cookies.set('session', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // ✅ Should be false in dev
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 30,
  path: '/',
});
```

### Issue 2: Session Verification Failing

**Symptoms:**
- Cookie exists but `getSession - Token verification failed`
- `verifySession` returns `null`

**Possible Causes:**
1. JWT_SECRET mismatch
2. Token expired (unlikely with 30d expiry)
3. Token format is invalid

**Fix:**
Check `.env` file has:
```
JWT_SECRET=your-secret-key-here
NEXTAUTH_SECRET=your-secret-key-here
```

### Issue 3: accountType Missing in Session

**Symptoms:**
- Session exists but `accountType` is `undefined`
- Dashboard redirects because it can't determine account type

**Fix:**
Verify `createSession` includes `accountType`:
```typescript
// In lib/auth.ts - checkStaffUsersTable returns:
return {
  id: String(staffUser.id),
  phone: staffUser.phone,
  role,
  accountType: 'staff', // ✅ Must be included
  status: staffUser.status || 'ACTIVE',
  // ... other fields
};
```

## Quick Test

Run this in browser console after login:

```javascript
// Check if cookie exists
document.cookie

// Should see: "session=eyJhbGc..."

// Test /api/auth/me directly
fetch('/api/auth/me', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)

// Should return: {user: {id: ..., accountType: 'staff', ...}}
```

## Next Steps

1. **Check console logs** after login attempt
2. **Check server terminal** for debug messages
3. **Check Network tab** for cookie headers
4. **Share the logs** you see so we can identify the exact issue

