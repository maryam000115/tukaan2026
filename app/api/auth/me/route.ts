import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { queryOne } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    
    // Debug logging
    console.log('Auth me - Session check:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      userId: session?.user?.id,
      accountType: session?.user?.accountType,
      cookieExists: !!req.cookies.get('session')?.value,
    });
    
    if (!session?.user) {
      console.log('Auth me - No user in session, returning null');
      return NextResponse.json({ user: null, locked: false }, { status: 200 });
    }

    // Fetch full user details from database
    // Use accountType from session to determine which table to query
    const userId = session.user.id;
    const accountType = session.user.accountType; // 'staff' or 'customer'
    let user: any = null;
    let userRole: string = '';
    let tukaanId: string | null = null;
    let shopName: string | null = null;
    let shopLocation: string | null = null;

    // Based on accountType, query the appropriate table ONLY
    if (accountType === 'staff') {
      // Query staff_users table ONLY
      // ✅ FIXED: staff_users has ONLY shop_id (no tukaan_id)
      try {
        let staffUser: any = null;
        
        const userIdInt = parseInt(userId);
        if (!isNaN(userIdInt)) {
          // Try as integer first (most common case)
          staffUser = await queryOne<{
            id: string | number;
            shop_id: string | number | null;
            first_name: string;
            middle_name: string | null;
            last_name: string;
            phone: string;
            gender: string | null;
            role: string;
            status: string | null;
          }>(
            `SELECT id, shop_id, first_name, middle_name, last_name, phone, gender, role, status
             FROM staff_users WHERE id = ?`,
            [userIdInt]
          );
        }
        
        // If not found, try as string (for UUID support)
        if (!staffUser) {
          staffUser = await queryOne<{
            id: string | number;
            shop_id: string | number | null;
            first_name: string;
            middle_name: string | null;
            last_name: string;
            phone: string;
            gender: string | null;
            role: string;
            status: string | null;
          }>(
            `SELECT id, shop_id, first_name, middle_name, last_name, phone, gender, role, status
             FROM staff_users WHERE CAST(id AS CHAR) = ?`,
            [userId]
          );
        }
        
        console.log('Auth me - staff user lookup:', {
          userId,
          userIdInt: !isNaN(userIdInt) ? userIdInt : 'N/A',
          found: !!staffUser,
          staffUserId: staffUser?.id,
          staffUserRole: staffUser?.role,
          staffUserShopId: staffUser?.shop_id,
        });

        if (staffUser) {
          user = staffUser;
          userRole = staffUser.role;
          // ✅ FIXED: Use shop_id only (no tukaan_id)
          const shopIdValue = staffUser.shop_id;
          tukaanId = shopIdValue ? String(shopIdValue) : null;

          // Get shop info if user belongs to a shop
          if (shopIdValue) {
            try {
              const shop = await queryOne<{
                name: string;
                location: string | null;
              }>(
                'SELECT name, location FROM tukaans WHERE id = ?',
                [shopIdValue]
              );
              if (shop) {
                shopName = shop.name;
                shopLocation = shop.location || null;
              }
            } catch (error) {
              // Ignore error - shop info is optional
            }
          }
        }
      } catch (error: any) {
        // If table doesn't exist, log error
        if (error.code === 'ER_NO_SUCH_TABLE') {
          console.warn('staff_users table not found');
        } else {
          console.error('Staff users query error:', error);
        }
      }

    } else if (accountType === 'customer') {
      // Query users table ONLY
      try {
        // Try as string first (for UUID), then as integer if needed
        let customer = await queryOne<{
          id: string | number;
          first_name: string;
          middle_name: string | null;
          last_name: string;
          phone: string;
          gender: string | null;
          shop_id: string | number | null;
          user_type: string;
        }>(
          `SELECT id, first_name, middle_name, last_name, phone, gender, shop_id, user_type
           FROM users 
           WHERE id = ? AND (user_type = 'customer' OR user_type = 'normal')`,
          [userId]
        );

        // If not found, try with integer conversion
        if (!customer) {
          const userIdInt = parseInt(userId);
          if (!isNaN(userIdInt)) {
            customer = await queryOne<{
              id: string | number;
              first_name: string;
              middle_name: string | null;
              last_name: string;
              phone: string;
              gender: string | null;
              shop_id: string | number | null;
              user_type: string;
            }>(
              `SELECT id, first_name, middle_name, last_name, phone, gender, shop_id, user_type
               FROM users 
               WHERE id = ? AND (user_type = 'customer' OR user_type = 'normal')`,
              [userIdInt]
            );
          }
        }

        if (customer) {
          user = customer;
          userRole = 'CUSTOMER';
          tukaanId = customer.shop_id ? String(customer.shop_id) : null;

          // Get shop/tukaan info
          if (customer.shop_id) {
            try {
              const shop = await queryOne<{
                name: string;
                location: string | null;
              }>(
                'SELECT name, location FROM tukaans WHERE id = ?',
                [customer.shop_id]
              );
              if (shop) {
                shopName = shop.name;
                shopLocation = shop.location || null;
              }
            } catch (error) {
              // Ignore error
            }
          }
        }
      } catch (error: any) {
        // If table doesn't exist, log error
        if (error.code !== 'ER_NO_SUCH_TABLE') {
          console.error('Users (customers) query error:', error);
        }
      }
    } else {
      // Invalid or missing accountType
      console.warn('Invalid or missing accountType in session:', accountType);
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

    // ✅ FIXED: Get shop_id from user record (staff_users has shop_id, not tukaan_id)
    const shopId = user.shop_id ? String(user.shop_id) : (session.user.shopId || null);
    
    // Use shop info from tukaans table if available
    if (shopName) {
      user.shop_name = shopName;
    }
    if (shopLocation) {
      user.shop_location = shopLocation;
    }

    console.log('Auth me - Returning user data:', {
      id: String(user.id),
      role,
      accountType: accountType || (role === 'customer' ? 'customer' : 'staff'),
      shopId,
      status: user.status || null,
    });

    return NextResponse.json({
      user: {
        id: String(user.id),
        firstName: user.first_name,
        middleName: user.middle_name || null,
        lastName: user.last_name,
        phone: user.phone,
        gender: user.gender || null,
        role, // lowercase: 'owner', 'admin', 'staff', 'customer'
        accountType: accountType || (role === 'customer' ? 'customer' : 'staff'), // ✅ CRITICAL: Always set accountType
        shopId: shopId, // ✅ FIXED: Use shop_id from staff_users (no tukaan_id)
        userLocation: user.user_location || null,
        tukaanId: shopId, // For backward compatibility, map shopId to tukaanId
        shopName: shopName || user.shop_name || null,
        shopLocation: shopLocation || user.shop_location || null,
        status: user.status || null, // Include status for staff users
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
