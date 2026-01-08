import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { validatePhone, validatePassword, formatValidationError } from '@/lib/validation';
import { withErrorHandling } from '@/lib/error-handler';

async function handler(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const {
    accountType, // "customer" | "staff"
    tukaan_id,
    first_name,
    middle_name,
    last_name,
    phone,
    password,
    gender,
    location,
  } = body;

  // Validation
  const errors: Record<string, string> = {};

  if (!accountType || !['customer', 'staff'].includes(accountType)) {
    errors.accountType = 'Account type must be "customer" or "staff"';
  }

  if (!first_name || first_name.trim().length === 0) {
    errors.first_name = 'First name is required';
  }

  if (!last_name || last_name.trim().length === 0) {
    errors.last_name = 'Last name is required';
  }

  const phoneError = validatePhone(phone);
  if (phoneError) {
    errors.phone = phoneError;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    errors.password = passwordError;
  }

  if (!tukaan_id) {
    errors.tukaan_id = 'Shop selection is required';
  }

  // Normalize phone: remove non-digits
  const normalizedPhone = phone ? phone.replace(/\D/g, '') : '';

  // Check if phone already exists in BOTH tables (users and staff_users)
  if (normalizedPhone && normalizedPhone.length === 9) {
    try {
      // Check in users table (customers)
      const existingCustomer = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE phone = ?',
        [normalizedPhone]
      );

      // Check in staff_users table
      const existingStaff = await queryOne<{ id: string }>(
        'SELECT id FROM staff_users WHERE phone = ?',
        [normalizedPhone]
      );

      if (existingCustomer || existingStaff) {
        errors.phone = 'Phone number already registered';
      }
    } catch (error: any) {
      // If tables don't exist, we'll handle it during insert
      if (error.code !== 'ER_NO_SUCH_TABLE') {
        console.error('Phone uniqueness check error:', error);
      }
    }
  }

  // Verify shop_id exists (for both customer and staff)
  // Use shop_id from tukaan_id parameter
  const shop_id = tukaan_id; // Use shop_id consistently
  if (shop_id) {
    try {
      // Try tukaans table first (legacy name)
      const shop = await queryOne<{ id: string | number; status?: string }>(
        'SELECT id, status FROM tukaans WHERE id = ?',
        [shop_id]
      );

      if (!shop) {
        errors.tukaan_id = 'Selected shop does not exist';
      } else if (shop.status && shop.status !== 'ACTIVE') {
        errors.tukaan_id = 'Selected shop is not active';
      }
    } catch (error: any) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        // If tukaans table doesn't exist, try shops table
        try {
          const shop = await queryOne<{ id: string | number; status?: string }>(
            'SELECT id, status FROM shops WHERE id = ?',
            [shop_id]
          );
          if (!shop) {
            errors.tukaan_id = 'Selected shop does not exist';
          }
        } catch (err: any) {
          // If both tables don't exist, foreign key constraint will catch invalid IDs
          console.warn('Shops table not found, will rely on foreign key constraint');
        }
      } else {
        console.error('Shop verification error:', error);
        errors.tukaan_id = 'Failed to verify shop';
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json(formatValidationError(errors), { status: 400 });
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  try {
    if (accountType === 'customer') {
      // Insert into users table (customers)
      // Try with UUID first, fallback to AUTO_INCREMENT if needed
      let userId: string | number;
      let result: any;

      try {
        // Try UUID approach (for UUID-based schemas)
        const [uuidResult] = await query<{ id: string }>('SELECT UUID() as id');
        userId = uuidResult[0].id;

        result =       await execute(
        `INSERT INTO users (
          id, first_name, middle_name, last_name, phone, password, 
          gender, user_type, shop_id, location, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'normal', ?, ?, NOW())`,
          [
            userId,
            first_name.trim(),
            middle_name?.trim() || null,
            last_name.trim(),
            normalizedPhone,
            hashedPassword,
            gender || null,
            shop_id, // Use shop_id consistently
            location?.trim() || null,
          ]
        );
      } catch (uuidError: any) {
        // If UUID approach fails, try AUTO_INCREMENT (omit id field)
        result = await execute(
          `INSERT INTO users (
            first_name, middle_name, last_name, phone, password, 
            gender, user_type, shop_id, location, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'normal', ?, ?, NOW())`,
          [
            first_name.trim(),
            middle_name?.trim() || null,
            last_name.trim(),
            normalizedPhone,
            hashedPassword,
            gender || null,
            shop_id, // Use shop_id consistently
            location?.trim() || null,
          ]
        );
        userId = result.insertId;
      }

      // Fetch created customer
      const newCustomer = await queryOne<{
        id: string | number;
        first_name: string;
        last_name: string;
        phone: string;
        shop_id: string;
      }>(
        'SELECT id, first_name, last_name, phone, shop_id FROM users WHERE id = ?',
        [userId]
      );

      return NextResponse.json({
        success: true,
        message: 'Customer account created successfully',
        user: {
          id: newCustomer?.id,
          accountType: 'customer',
          firstName: newCustomer?.first_name,
          lastName: newCustomer?.last_name,
          phone: newCustomer?.phone,
          shopId: newCustomer?.shop_id,
        },
      });
    } else if (accountType === 'staff') {
      // Insert into staff_users table with role='STAFF' and status='ACTIVE'
      // Try with UUID first, fallback to AUTO_INCREMENT if needed
      let staffId: string | number;
      let result: any;

      try {
        // Try UUID approach (for UUID-based schemas)
        const [uuidResult] = await query<{ id: string }>('SELECT UUID() as id');
        staffId = uuidResult[0].id;

        result = await execute(
          `INSERT INTO staff_users (
            id, shop_id, first_name, middle_name, last_name, phone, password, 
            gender, role, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'STAFF', 'ACTIVE', NOW())`,
          [
            staffId,
            shop_id, // Use shop_id consistently
            first_name.trim(),
            middle_name?.trim() || null,
            last_name.trim(),
            normalizedPhone,
            hashedPassword,
            gender || null,
          ]
        );
      } catch (uuidError: any) {
        // If UUID approach fails, try AUTO_INCREMENT (omit id field)
        result = await execute(
          `INSERT INTO staff_users (
            shop_id, first_name, middle_name, last_name, phone, password, 
            gender, role, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'STAFF', 'ACTIVE', NOW())`,
          [
            shop_id, // Use shop_id consistently
            first_name.trim(),
            middle_name?.trim() || null,
            last_name.trim(),
            normalizedPhone,
            hashedPassword,
            gender || null,
          ]
        );
        staffId = result.insertId;
      }

      // Fetch created staff
      const newStaff = await queryOne<{
        id: string | number;
        first_name: string;
        last_name: string;
        phone: string;
        role: string;
        shop_id: string;
      }>(
        'SELECT id, first_name, last_name, phone, role, shop_id FROM staff_users WHERE id = ?',
        [staffId]
      );

      return NextResponse.json({
        success: true,
        message: 'Staff account created successfully',
        user: {
          id: newStaff?.id,
          accountType: 'staff',
          role: newStaff?.role,
          firstName: newStaff?.first_name,
          lastName: newStaff?.last_name,
          phone: newStaff?.phone,
          shopId: newStaff?.shop_id,
        },
      });
    }
  } catch (error: any) {
    console.error('Registration error:', error);

    // Handle duplicate phone error
    if (error.code === 'ER_DUP_ENTRY' && error.message.includes('phone')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Phone number already registered',
          errors: { phone: 'Phone number already registered' },
        },
        { status: 400 }
      );
    }

    // Handle foreign key constraint (shop_id doesn't exist)
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return NextResponse.json(
        {
          success: false,
          message: 'Selected shop does not exist',
          errors: { tukaan_id: 'Selected shop does not exist' },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Registration failed',
        error:
          process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { success: false, message: 'Invalid account type' },
    { status: 400 }
  );
}

export const POST = withErrorHandling(handler);
