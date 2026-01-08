import { compare, hash } from 'bcryptjs';
import { queryOne, query } from './db';
import { SignJWT, jwtVerify } from 'jose';
import { normalizePhone } from './phone-normalize';

const getSecret = () => {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET or NEXTAUTH_SECRET must be set in environment variables');
  }
  return new TextEncoder().encode(secret);
};

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

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return compare(password, hashedPassword);
}

export async function createSession(user: SessionUser): Promise<string> {
  const secret = getSecret();
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);

  return token;
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload as SessionUser;
  } catch {
    return null;
  }
}

export async function authenticateUser(
  phone: string,
  password: string,
  accountType: 'staff' | 'customer' = 'staff'
): Promise<SessionUser | null> {
  // ✅ Step 1: Normalize phone to exactly 9 digits
  const normalizedPhone = normalizePhone(phone);
  
  if (!normalizedPhone) {
    console.log('Phone normalization failed:', {
      originalPhone: phone,
      reason: 'Must be exactly 9 digits after normalization',
    });
    return null;
  }

  console.log('Authenticating user:', {
    accountType,
    originalPhone: phone,
    normalizedPhone,
  });

  // Based on account type, check ONLY the appropriate table (NO FALLBACK)
  // accountType === 'staff' means Staff OR Admin (both are in staff_users table)
  // accountType === 'customer' means Customer (in users table)
  if (accountType === 'staff') {
    // Staff/Admin: check ONLY staff_users table
    return await checkStaffUsersTable(normalizedPhone, password);
  } else if (accountType === 'customer') {
    // Customer: check ONLY users table
    return await checkUsersTable(normalizedPhone, password);
  } else {
    // Invalid account type
    console.error('Invalid account type:', accountType);
    return null;
  }
}

/**
 * Check staff_users table for login
 * @param normalizedPhone - Phone number normalized to exactly 9 digits
 * @param password - Plain text password
 * @returns SessionUser or null
 */
async function checkStaffUsersTable(
  normalizedPhone: string,
  password: string
): Promise<SessionUser | null> {
  let staffUser: any = null;
  
  try {
    // ✅ Step 2: SQL query - exact match with normalized phone
    const query = `SELECT id, shop_id, phone, password, role, status, first_name, middle_name, last_name
                   FROM staff_users 
                   WHERE phone = ? 
                   LIMIT 1`;
    
    staffUser = await queryOne<{
      id: string | number;
      shop_id: string | number | null;
      phone: string;
      password: string;
      role: string;
      status: string | null;
      first_name: string;
      middle_name: string | null;
      last_name: string;
    }>(query, [normalizedPhone]);
    
    if (staffUser) {
      console.log('✅ Staff user found:', {
        id: staffUser.id,
        phone: staffUser.phone,
        role: staffUser.role,
        status: staffUser.status,
        hasPassword: !!staffUser.password,
      });
    } else {
      console.log('❌ No staff user found for phone:', normalizedPhone);
      return null;
    }
  } catch (error: any) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.error('staff_users table does not exist');
      return null;
    }
    console.error('Staff users query error:', error);
    return null;
  }

  if (!staffUser) {
    return null;
  }

  // ✅ Step 4: Validate status - MUST be ACTIVE
  const userStatus = (staffUser.status || '').toUpperCase();
  if (userStatus !== 'ACTIVE') {
    console.log('❌ Staff user status is not ACTIVE:', {
      id: staffUser.id,
      phone: staffUser.phone,
      status: staffUser.status,
    });
    throw new Error('ACCOUNT_SUSPENDED');
  }

  // Check if password exists
  if (!staffUser.password) {
    console.error('Staff user has no password set:', staffUser.id);
    return null;
  }

  // ✅ Step 3: Verify password using bcrypt.compare
  let isValid = false;
  try {
    isValid = await verifyPassword(password, staffUser.password);
  } catch (error: any) {
    console.error('Password verification error:', {
      id: staffUser.id,
      phone: staffUser.phone,
      error: error.message,
    });
    return null;
  }
  
  if (!isValid) {
    console.log('❌ Password verification failed for staff user:', {
      id: staffUser.id,
      phone: staffUser.phone,
    });
    return null;
  }
  
  console.log('✅ Password verified successfully');

  // Map role from database to session role
  let role: 'owner' | 'admin' | 'staff' | 'customer' = 'staff';
  const dbRole = (staffUser.role || '').toUpperCase();

  if (dbRole === 'SUPER_ADMIN') {
    role = 'owner';
  } else if (dbRole === 'ADMIN') {
    role = 'admin';
  } else if (dbRole === 'STAFF') {
    role = 'staff';
  }

  // Get shop info if user belongs to a shop
  let shopName: string | null = null;
  let shopLocation: string | null = null;
  if (staffUser.shop_id) {
    try {
      const shop = await queryOne<{
        name: string;
        location: string | null;
      }>(
        'SELECT name, location FROM tukaans WHERE id = ?',
        [staffUser.shop_id]
      );
      if (shop) {
        shopName = shop.name;
        shopLocation = shop.location || null;
      }
    } catch (error) {
      // Ignore error, shop info is optional
    }
  }

  // ✅ Step 5: Create session with required fields
  const sessionId = typeof staffUser.id === 'number' 
    ? String(staffUser.id) 
    : String(staffUser.id);
  
  const shopIdString = staffUser.shop_id 
    ? (typeof staffUser.shop_id === 'number' ? String(staffUser.shop_id) : String(staffUser.shop_id))
    : null;
  
  console.log('✅ Staff login successful - creating session:', {
    userId: sessionId,
    accountType: 'staff',
    role,
    status: staffUser.status,
    shopId: shopIdString,
    phone: staffUser.phone,
  });
  
  return {
    id: sessionId,
    phone: staffUser.phone,
    role,
    accountType: 'staff', // ✅ CRITICAL
    status: staffUser.status || 'ACTIVE', // ✅ CRITICAL
    tukaanId: shopIdString,
    shopId: shopIdString,
    firstName: staffUser.first_name,
    lastName: staffUser.last_name,
    shopName,
    shopLocation,
  };
}

async function checkUsersTable(
  normalizedPhone: string,
  password: string
): Promise<SessionUser | null> {
  let user: any = null;
  try {
    // Try with password_hash first (new schema)
    user = await queryOne<{
      id: string | number;
      phone: string;
      password_hash?: string;
      password?: string;
      role?: string;
      status?: string;
      shop_id?: string | null;
      tukaan_id?: string | null;
      first_name: string;
      last_name: string;
      user_type?: string;
    }>(
      `SELECT id, phone, password_hash, password, role, status, shop_id, tukaan_id, first_name, last_name, user_type
       FROM users 
       WHERE phone = ?
       LIMIT 1`,
      [normalizedPhone]
    );
    
    // If password_hash doesn't exist, use password column
    if (user && !user.password_hash && user.password) {
      // Already have password column, continue
    } else if (user && user.password_hash) {
      // Map password_hash to password for consistency
      user.password = user.password_hash;
    }
  } catch (error: any) {
    // If password_hash column doesn't exist, try with password column only
    if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('password_hash')) {
      try {
        user = await queryOne<{
          id: string | number;
          phone: string;
          password: string;
          role?: string;
          status?: string;
          shop_id?: string | null;
          tukaan_id?: string | null;
          first_name: string;
          last_name: string;
          user_type?: string;
        }>(
          `SELECT id, phone, password, role, status, shop_id, tukaan_id, first_name, last_name, user_type
           FROM users 
           WHERE phone = ?
           LIMIT 1`,
          [normalizedPhone]
        );
      } catch (err: any) {
        console.log('Users table query failed:', err.message);
        user = null;
      }
    } else if (error.code === 'ER_NO_SUCH_TABLE') {
      // Table doesn't exist, will try legacy tukaan_users below
      console.log('Users table does not exist, trying legacy tables...');
      user = null;
    } else {
      console.error('Users query error:', error);
      user = null;
    }
  }
  
  // If found in users table, authenticate
  if (user) {
    console.log('✅ User found in users table:', {
      id: user.id,
      phone: user.phone,
      user_type: user.user_type,
      hasPassword: !!(user.password || user.password_hash),
    });
    
    // Check if user has password
    const userPassword = user.password || user.password_hash;
    if (!userPassword) {
      console.log('User has no password set');
      // Continue to legacy tables below
    } else {
      // Verify password
      let isValid = false;
      try {
        isValid = await verifyPassword(password, userPassword);
      } catch (error: any) {
        console.error('Password verification error for user:', error.message);
        // Continue to legacy tables below
        isValid = false;
      }
      
      if (!isValid) {
        console.log('Password verification failed for user');
        return null;
      }
      
      // Check status (if column exists)
      if (user.status && user.status !== 'ACTIVE') {
        console.log('User status is not ACTIVE:', user.status);
        return null;
      }
      
      // Map user_type or role to session role
      let role: 'owner' | 'admin' | 'staff' | 'customer' = 'customer';
      const userType = (user.user_type || user.role || '').toUpperCase();
      
      if (userType === 'OWNER' || userType === 'SUPER_ADMIN') {
        role = 'owner';
      } else if (userType === 'ADMIN') {
        role = 'admin';
      } else if (userType === 'STAFF') {
        role = 'staff';
      } else if (userType === 'CUSTOMER' || userType === 'NORMAL') {
        role = 'customer';
      }
      
      // Get shop info
      const shopId = user.shop_id || user.tukaan_id;
      let shopName: string | null = null;
      let shopLocation: string | null = null;
      
      if (shopId) {
        try {
          // Try tukaans table first
          const shop = await queryOne<{
            name: string;
            location: string | null;
          }>(
            'SELECT name, location FROM tukaans WHERE id = ?',
            [shopId]
          );
          if (shop) {
            shopName = shop.name;
            shopLocation = shop.location || null;
          }
        } catch (error) {
          // Try shops table as fallback
          try {
            const shop = await queryOne<{
              shop_name: string;
              name: string;
              location: string | null;
            }>(
              'SELECT shop_name, name, location FROM shops WHERE id = ?',
              [shopId]
            );
            if (shop) {
              shopName = shop.shop_name || shop.name || null;
              shopLocation = shop.location || null;
            }
          } catch (err) {
            // Ignore error, shop info is optional
          }
        }
      }
      
      console.log('✅ User authenticated successfully:', {
        id: user.id,
        phone: user.phone,
        role: role,
      });
      
      return {
        id: String(user.id),
        phone: user.phone,
        role,
        accountType: 'customer', // ✅ CRITICAL: Always set accountType for customers
        tukaanId: shopId ? String(shopId) : null,
        shopId: shopId ? String(shopId) : null,
        firstName: user.first_name,
        lastName: user.last_name,
        shopName,
        shopLocation,
      };
    }
  }

  // If not found in users table, try legacy tukaan_users table
  if (!user) {
    try {
      const legacyUser = await queryOne<{
        id: number;
        phone: string;
        password: string;
        user_type: string;
        first_name: string;
        last_name: string;
        tukaan_id: string | null;
        shop_name: string | null;
        shop_location: string | null;
      }>(
        `SELECT id, phone, password, user_type, first_name, last_name, tukaan_id, shop_name, shop_location 
         FROM tukaan_users WHERE phone = ?`,
        [numericPhone]
      );

      if (!legacyUser || !legacyUser.password) {
        return null;
      }

      const isValid = await verifyPassword(password, legacyUser.password);
      if (!isValid) {
        return null;
      }

      // Map user_type to role
      let role: 'owner' | 'admin' | 'staff' | 'customer' = 'customer';
      const userType = (legacyUser.user_type || '').toLowerCase();

      if (userType === 'owner' || userType === 'normal') {
        role = 'owner';
      } else if (userType === 'admin' || userType === 'tukaan') {
        role = 'admin';
      } else if (userType === 'staff') {
        role = 'staff';
      } else if (userType === 'customer') {
        role = 'customer';
      }

      return {
        id: String(legacyUser.id),
        phone: legacyUser.phone,
        role,
        tukaanId: legacyUser.tukaan_id || null,
        shopId: legacyUser.tukaan_id || null,
        firstName: legacyUser.first_name,
        lastName: legacyUser.last_name,
        shopName: legacyUser.shop_name || null,
        shopLocation: legacyUser.shop_location || null,
      };
    } catch (error) {
      // Legacy table doesn't exist, return null
      return null;
    }
  }

  // If we reach here, user was not found in any table
  console.log('❌ User not found in any table');
  return null;
}

export async function checkSystemStatus(): Promise<boolean> {
  try {
    const { query } = await import('./db');
    const configs = await query<any>(
      'SELECT status FROM system_config ORDER BY created_at DESC LIMIT 1'
    );
    // If no config exists, system is active by default
    if (configs.length === 0) {
      return true;
    }
    return configs[0].status === 'ACTIVE';
  } catch (error: any) {
    // If system_config table doesn't exist, assume system is active
    if (
      error.code === 'ER_NO_SUCH_TABLE' ||
      error.message?.includes('system_config')
    ) {
      console.warn('system_config table not found - assuming system is active');
      return true;
    }
    console.error('System status check error:', error);
    // On error, assume system is active to prevent lockout
    return true;
  }
}
