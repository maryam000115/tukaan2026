import { NextRequest, NextResponse } from 'next/server';
import { verifySession, checkSystemStatus } from './auth';
import { query } from './db';

export interface SessionUser {
  id: string;
  phone: string;
  role: 'owner' | 'admin' | 'staff' | 'customer';
  accountType: 'staff' | 'customer'; // Track which table the user came from
  shopId?: string | null;
  tukaanId?: string | null;
  firstName: string;
  lastName: string;
  shopName?: string | null;
  shopLocation?: string | null;
  status?: string; // For staff users, track status (ACTIVE/SUSPENDED)
}

export async function getSession(request: NextRequest): Promise<{
  user: SessionUser | null;
  error?: string;
} | null> {
  // ✅ CRITICAL: Read cookie with exact name 'session'
  const cookie = request.cookies.get('session');
  const token = cookie?.value;

  // Debug logging (always log for troubleshooting)
  console.log('getSession - Cookie check:', {
    hasCookie: !!cookie,
    hasToken: !!token,
    tokenLength: token?.length,
    cookieName: cookie?.name,
    allCookies: Array.from(request.cookies.getAll()).map(c => c.name),
  });

  if (!token) {
    console.log('getSession - No session token found in cookies');
    return null;
  }

  const user = await verifySession(token);

  if (!user) {
    console.log('getSession - Token verification failed (invalid/expired token)');
    return null;
  }

  // ✅ CRITICAL: Verify required fields exist
  if (!user.id || !user.phone || !user.accountType) {
    console.error('getSession - Session missing required fields:', {
      hasId: !!user.id,
      hasPhone: !!user.phone,
      hasAccountType: !!user.accountType,
      userKeys: Object.keys(user),
    });
    return null;
  }

  console.log('getSession - User verified:', {
    id: user.id,
    phone: user.phone,
    role: user.role,
    accountType: user.accountType,
    status: user.status,
    shopId: user.shopId,
  });

  // Check system status - if locked, block all non-owner users
  const isSystemActive = await checkSystemStatus();
  if (!isSystemActive && user.role !== 'owner') {
    return { user: null, error: 'SYSTEM_LOCKED' };
  }

  // CRITICAL: Verify staff/admin is still ACTIVE in database
  // If status is SUSPENDED, block access and force logout
  if (user.role === 'admin' || user.role === 'staff' || user.role === 'owner') {
    try {
      const dbStaff = await query<any>(
        'SELECT id, status, shop_id as shopId, role FROM staff_users WHERE id = ?',
        [user.id]
      );

      if (dbStaff.length > 0) {
        const staffStatus = dbStaff[0].status;
        
        // CRITICAL: Block SUSPENDED staff/admin
        if (staffStatus && staffStatus !== 'ACTIVE') {
          return { user: null, error: 'ACCOUNT_SUSPENDED' };
        }

        // Update session user with latest shop_id
        user.shopId = dbStaff[0].shopId || user.shopId || null;
      } else {
        // Staff user not found in database - account may have been deleted
        return { user: null, error: 'USER_NOT_FOUND' };
      }
    } catch (error: any) {
      // If staff_users table doesn't exist, log warning but allow access
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('staff_users table not found - cannot verify status');
      } else {
        console.error('Error verifying staff status:', error);
        // On error, block access for security
        return { user: null, error: 'VERIFICATION_FAILED' };
      }
    }
  }

  // For customers, verify in users table and check status
  if (user.role === 'customer') {
    try {
      const dbCustomer = await query<any>(
        'SELECT id, shop_id as shopId, status FROM users WHERE id = ? AND user_type IN (?, ?)',
        [user.id, 'customer', 'normal']
      );

      if (dbCustomer.length > 0) {
        const customerStatus = dbCustomer[0].status;
        
        // CRITICAL: Block SUSPENDED customers
        if (customerStatus && customerStatus !== 'ACTIVE') {
          return { user: null, error: 'ACCOUNT_SUSPENDED' };
        }

        user.shopId = dbCustomer[0].shopId || user.shopId || null;
      } else {
        // Customer not found in database - account may have been deleted
        return { user: null, error: 'USER_NOT_FOUND' };
      }
    } catch (error: any) {
      // If users table doesn't exist, log warning but allow access
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('users table not found - cannot verify customer status');
      } else {
        console.error('Error verifying customer status:', error);
        // On error, block access for security
        return { user: null, error: 'VERIFICATION_FAILED' };
      }
    }
  }

  return { user: user as SessionUser };
}
