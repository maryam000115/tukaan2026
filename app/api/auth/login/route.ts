import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, createSession, checkSystemStatus, SessionUser } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { validatePhone, validatePassword, formatValidationError } from '@/lib/validation';
import { withErrorHandling } from '@/lib/error-handler';

// Simple rate limiting (in-memory, use Redis in production)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(phone: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const attempt = loginAttempts.get(phone);

  if (!attempt || now > attempt.resetAt) {
    loginAttempts.set(phone, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (attempt.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((attempt.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  attempt.count++;
  return { allowed: true };
}

async function handler(request: NextRequest) {
  // Check system status first
  const isSystemActive = await checkSystemStatus();
  if (!isSystemActive) {
    return NextResponse.json(
      { success: false, message: 'System is currently locked for maintenance' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { phone, password, accountType } = body;
  
  // Normalize accountType: 'staff' or 'admin' both map to 'staff' (both in staff_users table)
  const normalizedAccountType = accountType === 'admin' ? 'staff' : (accountType || 'staff');

  // Validation
  const phoneError = validatePhone(phone);
  const passwordError = validatePassword(password);

  if (phoneError || passwordError) {
    return NextResponse.json(
      formatValidationError({
        ...(phoneError && { phone: phoneError }),
        ...(passwordError && { password: passwordError }),
      }),
      { status: 400 }
    );
  }

  // Rate limiting
  const rateLimit = checkRateLimit(phone);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        message: `Too many login attempts. Please try again after ${rateLimit.retryAfter} seconds.`,
      },
      { status: 429 }
    );
  }

  let user: any = null;
  let suspendedAccount = false;
  let authError: any = null;

  try {
    // accountType 'staff' includes both STAFF and ADMIN roles (both in staff_users table)
    // accountType 'customer' checks users table
    user = await authenticateUser(phone, password, normalizedAccountType);
  } catch (error: any) {
    authError = error;
    // Check if account is suspended
    if (error.message === 'ACCOUNT_SUSPENDED') {
      suspendedAccount = true;
    } else {
      console.error('Login authentication error:', error);
      // Log more details in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Full error:', {
          message: error.message,
          stack: error.stack,
          phone: phone,
        });
      }
    }
  }
  
  // Debug logging (always log in development, minimal in production)
  console.log('Login attempt result:', {
    phone: phone,
    userFound: !!user,
    suspendedAccount,
    authError: authError?.message,
    timestamp: new Date().toISOString(),
  });

  // ✅ Step 4: Handle suspended account - return 403
  if (suspendedAccount) {
    try {
      await createAuditLog(
        null,
        'LOGIN_BLOCKED_SUSPENDED',
        'USER',
        null,
        { phone, reason: 'Account suspended' },
        request.headers.get('x-forwarded-for') || undefined,
        request.headers.get('user-agent') || undefined
      );
    } catch (e) {
      // Ignore audit log errors
    }
    return NextResponse.json(
      { 
        success: false, 
        message: 'Account suspended' 
      },
      { status: 403 }
    );
  }

  if (!user) {
    // Debug logging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('Login failed - no user returned:', {
        phone: phone,
        suspendedAccount,
        authError: authError?.message,
      });
    }
    
    // Audit log for failed login (optional - can skip if audit table doesn't exist)
    try {
      await createAuditLog(
        null,
        'LOGIN_FAILED',
        'USER',
        null,
        { phone },
        request.headers.get('x-forwarded-for') || undefined,
        request.headers.get('user-agent') || undefined
      );
    } catch (e) {
      // Ignore audit log errors
    }
    return NextResponse.json(
      { 
        success: false, 
        message: 'Invalid phone or password',
        debug: process.env.NODE_ENV === 'development' ? {
          phone: phone,
          error: authError?.message,
        } : undefined,
      },
      { status: 401 }
    );
  }

  // Ensure user object has all required fields for session
  const sessionUser: SessionUser = {
    id: user.id,
    phone: user.phone,
    role: user.role,
    accountType: user.accountType || (user.role === 'customer' ? 'customer' : 'staff'), // ✅ CRITICAL: Always set accountType
    status: user.status || 'ACTIVE', // ✅ CRITICAL: Always set status for staff
    shopId: user.shopId || user.tukaanId || null,
    tukaanId: user.tukaanId || user.shopId || null,
    firstName: user.firstName,
    lastName: user.lastName,
    shopName: user.shopName || null,
    shopLocation: user.shopLocation || null,
  };

  // Debug: Log session user before creating token
  console.log('Creating session with user:', {
    id: sessionUser.id,
    phone: sessionUser.phone,
    role: sessionUser.role,
    accountType: sessionUser.accountType,
    status: sessionUser.status,
    shopId: sessionUser.shopId,
  });

  const token = await createSession(sessionUser);

  await createAuditLog(
    String(user.id),
    'LOGIN_SUCCESS',
    'USER',
    String(user.id),
    { phone, role: user.role },
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined
  );

  // Clear rate limit on success
  loginAttempts.delete(phone);

  // Create response with JSON body
  const response = NextResponse.json({
    success: true,
    accountType: sessionUser.accountType,
    user: {
      id: sessionUser.id,
      phone: sessionUser.phone,
      role: sessionUser.role,
      accountType: sessionUser.accountType,
      status: sessionUser.status,
      tukaanId: sessionUser.tukaanId,
      shopId: sessionUser.shopId,
      firstName: sessionUser.firstName,
      lastName: sessionUser.lastName,
      shopName: sessionUser.shopName,
      shopLocation: sessionUser.shopLocation,
    },
  });

  // ✅ CRITICAL: Set cookie using NextResponse (NOT Response.json)
  // Cookie must be set with proper attributes for persistence
  response.cookies.set('session', token, {
    httpOnly: true, // ✅ Prevents XSS attacks
    secure: process.env.NODE_ENV === 'production', // ✅ HTTPS only in production
    sameSite: 'lax', // ✅ CSRF protection
    maxAge: 60 * 60 * 24 * 30, // ✅ 30 days
    path: '/', // ✅ Available on all paths
    // ✅ DO NOT set domain for localhost (browser handles it)
  });

  // Debug: Log cookie setting
  console.log('Session cookie set:', {
    hasToken: !!token,
    tokenLength: token.length,
    cookieName: 'session',
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

export const POST = withErrorHandling(handler);

