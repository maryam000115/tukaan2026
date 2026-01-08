/**
 * Authentication and Authorization Guard Middleware
 * 
 * This middleware enforces:
 * 1. User must be authenticated
 * 2. Staff/Admin must have ACTIVE status
 * 3. Suspended accounts are blocked with 403 Forbidden
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from './middleware';
import { query } from './db';

export interface AuthGuardOptions {
  /**
   * Roles allowed to access this route
   * If not specified, any authenticated user can access
   */
  allowedRoles?: ('owner' | 'admin' | 'staff' | 'customer')[];
  
  /**
   * If true, requires user to be associated with a shop
   */
  requireShop?: boolean;
  
  /**
   * Custom error message for unauthorized access
   */
  unauthorizedMessage?: string;
}

/**
 * Authentication and Authorization Guard
 * 
 * Usage in API routes:
 * 
 * ```typescript
 * export async function GET(req: NextRequest) {
 *   const guard = await authGuard(req, { allowedRoles: ['admin', 'staff'] });
 *   if (guard.error) {
 *     return guard.response;
 *   }
 *   const { user } = guard;
 *   // Continue with route logic...
 * }
 * ```
 */
export async function authGuard(
  req: NextRequest,
  options: AuthGuardOptions = {}
): Promise<{
  user?: any;
  error?: string;
  response?: NextResponse;
}> {
  // Get session
  const session = await getSession(req);
  
  if (!session || !session.user) {
    return {
      error: 'UNAUTHORIZED',
      response: NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      ),
    };
  }

  const user = session.user;

  // Check for suspended account
  if (session.error === 'ACCOUNT_SUSPENDED') {
    // Clear session cookie to force logout
    const response = NextResponse.json(
      { 
        error: 'Your account is suspended. Contact admin.',
        logout: true 
      },
      { status: 403 }
    );
    response.cookies.delete('session');
    return { error: 'ACCOUNT_SUSPENDED', response };
  }

  // Verify staff/admin status is still ACTIVE (double-check from database)
  if (user.role === 'admin' || user.role === 'staff' || user.role === 'owner') {
    try {
      const dbStaff = await query<any>(
        'SELECT id, status FROM staff_users WHERE id = ?',
        [user.id]
      );

      if (dbStaff.length === 0) {
        // Staff account not found - may have been deleted
        const response = NextResponse.json(
          { error: 'Account not found', logout: true },
          { status: 403 }
        );
        response.cookies.delete('session');
        return { error: 'USER_NOT_FOUND', response };
      }

      const staffStatus = dbStaff[0].status;
      
      // CRITICAL: Block SUSPENDED staff/admin
      if (staffStatus && staffStatus !== 'ACTIVE') {
        const response = NextResponse.json(
          { 
            error: 'Your account is suspended. Contact admin.',
            logout: true 
          },
          { status: 403 }
        );
        response.cookies.delete('session');
        return { error: 'ACCOUNT_SUSPENDED', response };
      }
    } catch (error: any) {
      // If staff_users table doesn't exist, allow access but log warning
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('staff_users table not found - cannot verify status');
      } else {
        console.error('Error verifying staff status:', error);
        // On error, block access for security
        return {
          error: 'VERIFICATION_FAILED',
          response: NextResponse.json(
            { error: 'Failed to verify account status' },
            { status: 500 }
          ),
        };
      }
    }
  }

  // Check role restrictions
  if (options.allowedRoles && !options.allowedRoles.includes(user.role)) {
    return {
      error: 'FORBIDDEN',
      response: NextResponse.json(
        { error: options.unauthorizedMessage || 'You do not have permission to access this resource' },
        { status: 403 }
      ),
    };
  }

  // Check shop requirement
  if (options.requireShop && !user.shopId && !user.tukaanId) {
    return {
      error: 'SHOP_REQUIRED',
      response: NextResponse.json(
        { error: 'You must be associated with a shop' },
        { status: 403 }
      ),
    };
  }

  return { user };
}

/**
 * Higher-order function to wrap API route handlers with auth guard
 * 
 * Usage:
 * ```typescript
 * export const GET = withAuthGuard(
 *   async (req: NextRequest, { user }) => {
 *     // Your route logic here
 *     return NextResponse.json({ data: '...' });
 *   },
 *   { allowedRoles: ['admin', 'staff'] }
 * );
 * ```
 */
export function withAuthGuard(
  handler: (req: NextRequest, context: { user: any }) => Promise<NextResponse>,
  options: AuthGuardOptions = {}
) {
  return async (req: NextRequest) => {
    const guard = await authGuard(req, options);
    
    if (guard.error) {
      return guard.response!;
    }

    return handler(req, { user: guard.user! });
  };
}

