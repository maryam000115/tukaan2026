import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { queryOne } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    
    if (!session?.user) {
      return NextResponse.json({ user: null, locked: false }, { status: 200 });
    }

    // Fetch full user details from database
    // NEW SCHEMA: Check staff_users first, then customers, then legacy tables
    const userId = parseInt(session.user.id);
    let user: any = null;
    let userRole: string = '';
    let tukaanId: string | null = null;
    let shopName: string | null = null;
    let shopLocation: string | null = null;

    // Try staff_users table first
    try {
      const staffUser = await queryOne<{
        id: number;
        first_name: string;
        middle_name: string | null;
        last_name: string;
        phone: string;
        gender: string | null;
        role: string;
        tukaan_id: number | null;
      }>(
        `SELECT id, first_name, middle_name, last_name, phone, gender, role, tukaan_id 
         FROM staff_users WHERE id = ?`,
        [userId]
      );

      if (staffUser) {
        user = staffUser;
        userRole = staffUser.role;
        tukaanId = staffUser.tukaan_id ? String(staffUser.tukaan_id) : null;

        // Get tukaan info if user belongs to a tukaan
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
            // Ignore error
          }
        }
      }
    } catch (error: any) {
      // If table doesn't exist, continue to customers check
      if (error.code !== 'ER_NO_SUCH_TABLE') {
        console.error('Staff users query error:', error);
      }
    }

    // If not found in staff_users, try customers table
    if (!user) {
      try {
        const customer = await queryOne<{
          id: number;
          first_name: string;
          middle_name: string | null;
          last_name: string;
          phone: string;
          gender: string | null;
          tukaan_id: number;
        }>(
          `SELECT id, first_name, middle_name, last_name, phone, gender, tukaan_id 
           FROM customers WHERE id = ?`,
          [userId]
        );

        if (customer) {
          user = customer;
          userRole = 'CUSTOMER';
          tukaanId = String(customer.tukaan_id);

          // Get tukaan info
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
            // Ignore error
          }
        }
      } catch (error: any) {
        // If table doesn't exist, try legacy tables
        if (error.code !== 'ER_NO_SUCH_TABLE') {
          console.error('Customers query error:', error);
        }
      }
    }

    // FALLBACK: Try legacy tables (users, tukaan_users)
    if (!user) {
      try {
        user = await queryOne<{
          id: string;
          first_name: string;
          middle_name: string | null;
          last_name: string;
          phone: string;
          gender: string | null;
          role: string;
          shop_id: string | null;
          user_type?: string;
          user_location?: string | null;
          tukaan_id?: string | null;
          shop_name?: string | null;
          shop_location?: string | null;
        }>(
          `SELECT id, first_name, middle_name, last_name, phone, gender, role, shop_id,
           user_type, user_location, tukaan_id, shop_name, shop_location 
           FROM users WHERE id = ?`,
          [session.user.id]
        );
      } catch (error: any) {
        // If users table doesn't exist or column doesn't exist, try legacy table
        if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('users')) {
          try {
            user = await queryOne<{
              id: number;
              first_name: string;
              middle_name: string | null;
              last_name: string;
              phone: string;
              gender: string | null;
              user_type: string;
              user_location: string | null;
              tukaan_id: string | null;
              shop_name: string | null;
              shop_location: string | null;
            }>(
              `SELECT id, first_name, middle_name, last_name, phone, gender, user_type, 
               user_location, tukaan_id, shop_name, shop_location 
               FROM tukaan_users WHERE id = ?`,
              [session.user.id]
            );
          } catch (legacyError) {
            // Legacy table also doesn't exist
            console.error('Legacy table query error:', legacyError);
          }
        }
      }
    }

    if (!user) {
      return NextResponse.json({ user: null, locked: false }, { status: 200 });
    }

    // Map user_type/role to normalized role
    const userType = ((userRole || user.role || user.user_type || '') as string).toUpperCase();
    let role: 'owner' | 'admin' | 'staff' | 'customer' = 'customer';
    
    if (userType === 'SUPER_ADMIN' || userType === 'OWNER' || userType === 'NORMAL') {
      role = 'owner';
    } else if (userType === 'ADMIN' || userType === 'TUKAAN') {
      role = 'admin';
    } else if (userType === 'STAFF') {
      role = 'staff';
    } else if (userType === 'CUSTOMER') {
      role = 'customer';
    }

    // Get shop_id from session or user record
    const shopId = session.user.shopId || tukaanId || user.shop_id || user.tukaan_id || null;
    
    // Use shop info from tukaan if available
    if (shopName) {
      user.shop_name = shopName;
    }
    if (shopLocation) {
      user.shop_location = shopLocation;
    }

    return NextResponse.json({
      user: {
        id: String(user.id),
        firstName: user.first_name,
        middleName: user.middle_name || null,
        lastName: user.last_name,
        phone: user.phone,
        gender: user.gender || null,
        role, // lowercase: 'owner', 'admin', 'staff', 'customer'
        shopId: shopId ? String(shopId) : null,
        userLocation: user.user_location || null,
        tukaanId: tukaanId || (user.tukaan_id ? String(user.tukaan_id) : null),
        shopName: shopName || user.shop_name || null,
        shopLocation: shopLocation || user.shop_location || null,
      },
      locked: false,
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { user: null, locked: false, error: 'Failed to get user' },
      { status: 500 }
    );
  }
}
