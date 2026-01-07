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
    errors.tukaan_id = 'Tukaan selection is required';
  }

  // Normalize phone: remove non-digits
  const normalizedPhone = phone ? phone.replace(/\D/g, '') : '';

  // Check if phone already exists in BOTH tables
  if (normalizedPhone && normalizedPhone.length === 9) {
    try {
      // Check in customers table
      const existingCustomer = await queryOne<{ id: number }>(
        'SELECT id FROM customers WHERE phone = ?',
        [normalizedPhone]
      );

      // Check in staff_users table
      const existingStaff = await queryOne<{ id: number }>(
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

  // Verify tukaan exists and is active
  if (tukaan_id) {
    try {
      const tukaan = await queryOne<{ id: number; status: string }>(
        'SELECT id, status FROM tukaans WHERE id = ?',
        [tukaan_id]
      );

      if (!tukaan) {
        errors.tukaan_id = 'Selected tukaan does not exist';
      } else if (tukaan.status !== 'ACTIVE') {
        errors.tukaan_id = 'Selected tukaan is not active';
      }
    } catch (error: any) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        errors.tukaan_id = 'Tukaans table not found. Please run database migration.';
      } else {
        console.error('Tukaan verification error:', error);
        errors.tukaan_id = 'Failed to verify tukaan';
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
      // Insert into customers table
      const result = await execute(
        `INSERT INTO customers (
          tukaan_id, first_name, middle_name, last_name, phone, password, 
          gender, location, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        [
          tukaan_id,
          first_name.trim(),
          middle_name?.trim() || null,
          last_name.trim(),
          normalizedPhone,
          hashedPassword,
          gender || null,
          location?.trim() || null,
        ]
      );

      if (!result.insertId) {
        return NextResponse.json(
          { success: false, message: 'Failed to create customer account' },
          { status: 500 }
        );
      }

      // Fetch created customer
      const newCustomer = await queryOne<{
        id: number;
        first_name: string;
        last_name: string;
        phone: string;
        tukaan_id: number;
      }>(
        'SELECT id, first_name, last_name, phone, tukaan_id FROM customers WHERE id = ?',
        [result.insertId]
      );

      return NextResponse.json({
        success: true,
        message: 'Customer account created successfully',
        user: {
          id: String(newCustomer?.id),
          accountType: 'customer',
          firstName: newCustomer?.first_name,
          lastName: newCustomer?.last_name,
          phone: newCustomer?.phone,
          tukaanId: String(newCustomer?.tukaan_id),
        },
      });
    } else if (accountType === 'staff') {
      // Insert into staff_users table with role='STAFF'
      const result = await execute(
        `INSERT INTO staff_users (
          tukaan_id, first_name, middle_name, last_name, phone, password, 
          gender, role, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'STAFF', 'ACTIVE')`,
        [
          tukaan_id,
          first_name.trim(),
          middle_name?.trim() || null,
          last_name.trim(),
          normalizedPhone,
          hashedPassword,
          gender || null,
        ]
      );

      if (!result.insertId) {
        return NextResponse.json(
          { success: false, message: 'Failed to create staff account' },
          { status: 500 }
        );
      }

      // Fetch created staff
      const newStaff = await queryOne<{
        id: number;
        first_name: string;
        last_name: string;
        phone: string;
        role: string;
        tukaan_id: number;
      }>(
        'SELECT id, first_name, last_name, phone, role, tukaan_id FROM staff_users WHERE id = ?',
        [result.insertId]
      );

      return NextResponse.json({
        success: true,
        message: 'Staff account created successfully',
        user: {
          id: String(newStaff?.id),
          accountType: 'staff',
          role: newStaff?.role,
          firstName: newStaff?.first_name,
          lastName: newStaff?.last_name,
          phone: newStaff?.phone,
          tukaanId: String(newStaff?.tukaan_id),
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

    // Handle foreign key constraint (tukaan_id doesn't exist)
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return NextResponse.json(
        {
          success: false,
          message: 'Selected tukaan does not exist',
          errors: { tukaan_id: 'Selected tukaan does not exist' },
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
