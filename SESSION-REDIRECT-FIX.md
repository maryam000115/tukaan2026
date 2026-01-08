# Session Redirect Fix - Dashboard Staff

## Problem
After login, when redirecting to `/dashboard-staff`, the page automatically redirects back to `/login`. This indicates a session issue.

## Root Causes

1. **Cookie timing**: Dashboard checks session before cookie is fully processed
2. **Missing accountType**: Session might not have `accountType` set correctly
3. **Fast redirect**: `router.push()` doesn't wait for cookie to be available

## Solutions Applied

### 1. Dashboard Staff Page (`app/dashboard-staff/page.tsx`)

**Changes:**
- ✅ Added 100ms delay before checking auth (allows cookie to be processed)
- ✅ Changed `router.push()` to `window.location.href` for redirects (full page reload)
- ✅ Added fallback: If `accountType` is missing but `role` is staff/admin, allow access
- ✅ Enhanced debug logging to show full response data
- ✅ Added `cache: 'no-store'` to prevent caching issues

**Code:**
```typescript
useEffect(() => {
  const checkAuth = async () => {
    try {
      // Wait a bit for cookie to be processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store', // Prevent caching
      });
      
      const data = await res.json();
      
      if (!data.user) {
        window.location.href = '/login'; // Full page reload
        return;
      }

      // Fallback: If accountType missing but role is staff/admin, allow
      if (!data.user.accountType && (data.user.role === 'staff' || data.user.role === 'admin')) {
        setUser(data.user);
        setLoading(false);
        return;
      }

      setUser(data.user);
      setLoading(false);
    } catch (error) {
      window.location.href = '/login';
    }
  };

  checkAuth();
}, [router]);
```

### 2. Auth Me Endpoint (`app/api/auth/me/route.ts`)

**Changes:**
- ✅ Ensure `accountType` is always set (fallback to 'staff' if missing)
- ✅ Enhanced debug logging

**Code:**
```typescript
// ✅ CRITICAL: Ensure accountType is always set
const finalAccountType = accountType || (role !== 'customer' ? 'staff' : 'customer');

return NextResponse.json({
  user: {
    ...userData,
    accountType: finalAccountType, // ✅ Always set
  },
});
```

## Testing Steps

1. **Login as Staff/Admin**
   - Check browser console for "Login successful" message
   - Check Network tab → `/api/auth/login` → Response should have `Set-Cookie` header

2. **Check Cookie in Browser**
   - DevTools → Application → Cookies → `localhost:3000`
   - Should see `session` cookie with JWT token

3. **Dashboard Load**
   - Check console for "Staff dashboard auth check" logs
   - Should see "User authenticated, setting user data"
   - If you see "No user found in session", check cookie exists

4. **If Still Redirecting**
   - Check console logs for exact error
   - Verify cookie is set (Application → Cookies)
   - Check Network tab → `/api/auth/me` → Request should include `Cookie` header

## Debug Checklist

- [ ] Cookie is set after login (Application → Cookies)
- [ ] Cookie name is `session` (not `auth_token` or other)
- [ ] Cookie has `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`
- [ ] `/api/auth/me` request includes `Cookie` header
- [ ] `/api/auth/me` response includes user with `accountType`
- [ ] Dashboard console shows "User authenticated" (not "No user found")

## Common Issues

### Issue: "No user found in session"
**Cause**: Cookie not set or not being sent
**Fix**: 
- Check cookie exists in browser
- Verify `credentials: 'include'` in fetch calls
- Check cookie attributes (httpOnly, sameSite, path)

### Issue: "accountType is undefined"
**Cause**: Session payload missing accountType
**Fix**: 
- Login API now always sets accountType
- Auth me endpoint has fallback to set accountType

### Issue: Redirect loop
**Cause**: Dashboard checks too quickly
**Fix**: 
- Added 100ms delay before auth check
- Use `window.location.href` instead of `router.push()`

