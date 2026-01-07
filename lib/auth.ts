import { compare, hash } from 'bcryptjs';
import { queryOne, query } from './db';
import { SignJWT, jwtVerify } from 'jose';

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
  shopId?: string | null;
  tukaanId?: string | null;
  firstName: string;
  lastName: string;
  shopName?: string | null;
  shopLocation?: string | null;
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
  password: string
): Promise<SessionUser | null> {
  // Normalize phone: remove non-digits and ensure exactly 9 digits
  const numericPhone = phone.replace(/\D/g, '');
  if (numericPhone.length !== 9 || numericPhone.startsWith('0')) {
    return null;
  }

  // NEW SCHEMA: Check staff_users first, then customers
  // Try staff_users table first
  let staffUser: any = null;
  try {
    staffUser = await queryOne<{
      id: number;
      phone: string;
      password: string;
      role: string;
      status: string;
      tukaan_id: number | null;
      first_name: string;
      last_name: string;
    }>(
      `SELECT id, phone, password, role, status, tukaan_id, first_name, last_name 
       FROM staff_users WHERE phone = ?`,
      [numericPhone]
    );
  } catch (error: any) {
    // If table doesn't exist, continue to customers check
    if (error.code !== 'ER_NO_SUCH_TABLE') {
      console.error('Staff users query error:', error);
    }
  }

  if (staffUser) {
    // Check if staff user is active
    if (staffUser.status !== 'ACTIVE') {
      return null;
    }

    const isValid = await verifyPassword(password, staffUser.password);
    if (!isValid) {
      return null;
    }

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

    // Get tukaan info if user belongs to a tukaan
    let shopName: string | null = null;
    let shopLocation: string | null = null;
    if (staffUser.tukaan_id) {
      try {
        const tukaan = await queryOne<{
          name: string;
          location: string | null;
        }>(
          'SELECT name, location FROM tukaans WHERE id = ?',
          [staffUser.tukaan_id]
        );
        if (tukaan) {
          shopName = tukaan.name;
          shopLocation = tukaan.location || null;
        }
      } catch (error) {
        // Ignore error, shop info is optional
      }
    }

    return {
      id: String(staffUser.id),
      phone: staffUser.phone,
      role,
      tukaanId: staffUser.tukaan_id ? String(staffUser.tukaan_id) : null,
      shopId: staffUser.tukaan_id ? String(staffUser.tukaan_id) : null,
      firstName: staffUser.first_name,
      lastName: staffUser.last_name,
      shopName,
      shopLocation,
    };
  }

  // If not found in staff_users, try customers table
  let customer: any = null;
  try {
    customer = await queryOne<{
      id: number;
      phone: string;
      password: string;
      status: string;
      tukaan_id: number;
      first_name: string;
      last_name: string;
    }>(
      `SELECT id, phone, password, status, tukaan_id, first_name, last_name 
       FROM customers WHERE phone = ?`,
      [numericPhone]
    );
  } catch (error: any) {
    // If table doesn't exist, try legacy tables
    if (error.code !== 'ER_NO_SUCH_TABLE') {
      console.error('Customers query error:', error);
    }
  }

  if (customer) {
    // Check if customer is active
    if (customer.status !== 'ACTIVE') {
      return null;
    }

    const isValid = await verifyPassword(password, customer.password);
    if (!isValid) {
      return null;
    }

    // Get tukaan info
    let shopName: string | null = null;
    let shopLocation: string | null = null;
    try {
      const tukaan = await queryOne<{
        name: string;
        location: string | null;
      }>(
        'SELECT name, location FROM tukaans WHERE id = ?',
        [customer.tukaan_id]
      );
      if (tukaan) {
        shopName = tukaan.name;
        shopLocation = tukaan.location || null;
      }
    } catch (error) {
      // Ignore error, shop info is optional
    }

    return {
      id: String(customer.id),
      phone: customer.phone,
      role: 'customer',
      tukaanId: String(customer.tukaan_id),
      shopId: String(customer.tukaan_id),
      firstName: customer.first_name,
      lastName: customer.last_name,
      shopName,
      shopLocation,
    };
  }

  // FALLBACK: Try legacy tables (users, tukaan_users) for backward compatibility
  let user: any = null;
  try {
    user = await queryOne<{
      id: string;
      phone: string;
      password_hash: string;
      role: string;
      status: string;
      shop_id: string | null;
      first_name: string;
      last_name: string;
    }>(
      `SELECT id, phone, password_hash, role, status, shop_id, first_name, last_name 
       FROM users WHERE phone = ?`,
      [numericPhone]
    );
  } catch (error: any) {
    // If password_hash column doesn't exist, try with password column
    if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('password_hash')) {
      try {
        user = await queryOne<{
          id: string;
          phone: string;
          password: string;
          role: string;
          status: string;
          shop_id: string | null;
          first_name: string;
          last_name: string;
        }>(
          `SELECT id, phone, password, role, status, shop_id, first_name, last_name 
           FROM users WHERE phone = ?`,
          [numericPhone]
        );
      } catch (err) {
        // User not found, will try legacy table below
        user = null;
      }
    } else if (error.code === 'ER_NO_SUCH_TABLE') {
      // Table doesn't exist, try legacy tukaan_users
      user = null;
    } else {
      // Other error, return null
      return null;
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

  // Legacy users table handling
  // Check if user is active
  if (!user || user.status !== 'ACTIVE') {
    return null;
  }

  // Handle both password_hash and password column names
  const userPassword = user.password_hash || (user as any).password;
  if (!userPassword) {
    return null;
  }

  const isValid = await verifyPassword(password, userPassword);
  if (!isValid) {
    return null;
  }

  // Map role from database to session role
  let role: 'owner' | 'admin' | 'staff' | 'customer' = 'customer';
  const dbRole = (user.role || '').toUpperCase();

  if (dbRole === 'OWNER') {
    role = 'owner';
  } else if (dbRole === 'ADMIN') {
    role = 'admin';
  } else if (dbRole === 'STAFF') {
    role = 'staff';
  } else if (dbRole === 'CUSTOMER') {
    role = 'customer';
  }

  // Get shop info if user belongs to a shop
  let shopName: string | null = null;
  let shopLocation: string | null = null;
  if (user.shop_id) {
    try {
      const shop = await queryOne<{
        shop_name: string;
        location: string | null;
      }>(
        'SELECT shop_name, location FROM shops WHERE id = ?',
        [user.shop_id]
      );
      if (shop) {
        shopName = shop.shop_name;
        shopLocation = shop.location || null;
      }
    } catch (error) {
      // Ignore error, shop info is optional
    }
  }

  return {
    id: String(user.id),
    phone: user.phone,
    role,
    tukaanId: user.shop_id || null,
    shopId: user.shop_id || null,
    firstName: user.first_name,
    lastName: user.last_name,
    shopName,
    shopLocation,
  };
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
