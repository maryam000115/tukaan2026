import { NextRequest, NextResponse } from 'next/server';
import { getSession } from './middleware';

/**
 * Route guard middleware to protect routes based on accountType and status
 * 
 * Usage:
 * - For staff routes: requireStaffAuth(request)
 * - For customer routes: requireCustomerAuth(request)
 * - For any authenticated user: requireAuth(request)
 */

export interface GuardResult {
  allowed: boolean;
  response?: NextResponse;
  user?: any;
}

/**
 * Require authentication (any account type)
 */
export async function requireAuth(
  request: NextRequest
): Promise<GuardResult> {
  const session = await getSession(request);

  if (!session?.user) {
    return {
      allowed: false,
      response: NextResponse.json(
        { error: 'Unauthorized', message: 'Please log in to access this resource' },
        { status: 401 }
      ),
    };
  }

  return {
    allowed: true,
    user: session.user,
  };
}

/**
 * Require staff/admin authentication (accountType='staff' AND status='ACTIVE')
 */
export async function requireStaffAuth(
  request: NextRequest
): Promise<GuardResult> {
  const session = await getSession(request);

  if (!session?.user) {
    return {
      allowed: false,
      response: NextResponse.json(
        { error: 'Unauthorized', message: 'Please log in to access this resource' },
        { status: 401 }
      ),
    };
  }

  const user = session.user;

  // Check accountType
  if (user.accountType !== 'staff') {
    return {
      allowed: false,
      response: NextResponse.json(
        { 
          error: 'Forbidden', 
          message: 'This resource is only accessible to staff and admin accounts' 
        },
        { status: 403 }
      ),
    };
  }

  // Check status for staff users
  const userStatus = (user.status || '').toUpperCase();
  if (userStatus && userStatus !== 'ACTIVE') {
    if (userStatus === 'SUSPENDED' || userStatus === 'INACTIVE') {
      // Force logout by clearing session cookie
      const response = NextResponse.json(
        { 
          error: 'Account Suspended', 
          message: 'Your account is suspended. Please contact administrator.' 
        },
        { status: 403 }
      );
      response.cookies.delete('session');
      
      return {
        allowed: false,
        response,
      };
    }
  }

  return {
    allowed: true,
    user,
  };
}

/**
 * Require customer authentication (accountType='customer')
 */
export async function requireCustomerAuth(
  request: NextRequest
): Promise<GuardResult> {
  const session = await getSession(request);

  if (!session?.user) {
    return {
      allowed: false,
      response: NextResponse.json(
        { error: 'Unauthorized', message: 'Please log in to access this resource' },
        { status: 401 }
      ),
    };
  }

  const user = session.user;

  // Check accountType
  if (user.accountType !== 'customer') {
    return {
      allowed: false,
      response: NextResponse.json(
        { 
          error: 'Forbidden', 
          message: 'This resource is only accessible to customer accounts' 
        },
        { status: 403 }
      ),
    };
  }

  return {
    allowed: true,
    user,
  };
}

/**
 * Helper to check if user has specific role
 */
export function hasRole(user: any, roles: string[]): boolean {
  if (!user || !user.role) return false;
  return roles.includes(user.role.toLowerCase());
}

/**
 * Helper to check if user belongs to a shop
 */
export function hasShopAccess(user: any, shopId: string | number): boolean {
  if (!user) return false;
  
  // Owner can access all shops
  if (user.role === 'owner') return true;
  
  // Check if user's shop_id matches
  const userShopId = user.shopId || user.tukaanId;
  return String(userShopId) === String(shopId);
}

