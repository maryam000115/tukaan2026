import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, createSession, checkSystemStatus } from '@/lib/auth';
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
  const { phone, password } = body;

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

  const user = await authenticateUser(phone, password);

  if (!user) {
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
      { success: false, message: 'Invalid phone or password' },
      { status: 401 }
    );
  }

  const token = await createSession(user);

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

  // Determine accountType based on role
  let accountType: 'customer' | 'staff' = 'customer';
  if (user.role === 'owner' || user.role === 'admin' || user.role === 'staff') {
    accountType = 'staff';
  }

  const response = NextResponse.json({
    success: true,
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role,
      accountType, // 'customer' or 'staff'
      tukaanId: user.tukaanId,
      shopId: user.shopId,
      firstName: user.firstName,
      lastName: user.lastName,
      shopName: user.shopName,
      shopLocation: user.shopLocation,
    },
  });

  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  return response;
}

export const POST = withErrorHandling(handler);

