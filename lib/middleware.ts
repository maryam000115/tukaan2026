import { NextRequest, NextResponse } from 'next/server';
import { verifySession, checkSystemStatus } from './auth';
import { query } from './db';

export interface SessionUser {
  id: string;
  phone: string;
  role: 'owner' | 'admin' | 'staff' | 'customer';
  shopId?: string | null;
  tukaanId?: string | null;
  firstName: string;
  lastName: string;
  shopName?: string | null;
  shopLocation?: string | null;
  status?: string;
}

export async function getSession(request: NextRequest): Promise<{
  user: SessionUser | null;
  error?: string;
} | null> {
  const token = request.cookies.get('session')?.value;

  if (!token) {
    return null;
  }

  const user = await verifySession(token);

  if (!user) {
    return null;
  }

  // Check system status - if locked, block all non-owner users
  const isSystemActive = await checkSystemStatus();
  if (!isSystemActive && user.role !== 'owner') {
    return { user: null, error: 'SYSTEM_LOCKED' };
  }

  // Verify user is still active in database (optional - skip if table/columns don't exist)
  try {
    let dbUser: any[] = [];
    try {
      dbUser = await query<any>(
        'SELECT id, status, shop_id as shopId, role FROM users WHERE id = ?',
        [user.id]
      );
    } catch (error: any) {
      // If users table doesn't exist or status column missing, try legacy table
      if (
        error.code === 'ER_NO_SUCH_TABLE' ||
        error.code === 'ER_BAD_FIELD_ERROR' ||
        error.message?.includes('users') ||
        error.message?.includes('status')
      ) {
        try {
          dbUser = await query<any>(
            'SELECT id, tukaan_id as shopId, user_type as role FROM tukaan_users WHERE id = ?',
            [user.id]
          );
        } catch (legacyError) {
          // Both failed, continue with session data
          console.warn(`User ${user.id} not found in users/tukaan_users tables, using session data`);
        }
      } else {
        throw error;
      }
    }

    if (dbUser.length > 0) {
      // Check if user is active (if status column exists)
      if (dbUser[0].status && dbUser[0].status !== 'ACTIVE') {
        return { user: null, error: 'USER_INACTIVE' };
      }

      // Update session user with latest shop_id/tukaan_id
      user.shopId = dbUser[0].shopId || dbUser[0].tukaan_id || user.shopId || null;
    }
  } catch (error) {
    console.error('Error verifying user status (non-fatal):', error);
    // Continue with session data if verification fails
  }

  return { user: user as SessionUser };
}
