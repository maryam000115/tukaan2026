import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';

/**
 * Debug endpoint to test login step by step
 * POST /api/auth/debug-login
 * Body: { phone: "615668866", password: "yourpassword" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, password } = body;

    if (!phone || !password) {
      return NextResponse.json(
        { error: 'Phone and password are required' },
        { status: 400 }
      );
    }

    const results: any = {
      step1_phone_normalization: {},
      step2_database_query: {},
      step3_password_check: {},
      step4_status_check: {},
      final_result: {},
    };

    // Step 1: Phone normalization
    const numericPhone = phone.replace(/\D/g, '');
    const finalPhone = numericPhone.slice(-9);
    results.step1_phone_normalization = {
      original: phone,
      numeric: numericPhone,
      final: finalPhone,
      length: numericPhone.length,
    };

    // Step 2: Query database
    let staffUser: any = null;
    try {
      staffUser = await queryOne<any>(
        `SELECT id, phone, password, role, status, shop_id, first_name, last_name 
         FROM staff_users 
         WHERE phone = ? OR phone = ? OR phone = ?`,
        [finalPhone, numericPhone, phone.replace(/\D/g, '')]
      );

      results.step2_database_query = {
        found: !!staffUser,
        user: staffUser ? {
          id: staffUser.id,
          phone: staffUser.phone,
          role: staffUser.role,
          status: staffUser.status,
          hasPassword: !!staffUser.password,
          passwordLength: staffUser.password?.length,
          passwordStart: staffUser.password?.substring(0, 30),
          phoneMatch: staffUser.phone === finalPhone || staffUser.phone === numericPhone,
        } : null,
      };
    } catch (error: any) {
      results.step2_database_query = {
        found: false,
        error: error.message,
        code: error.code,
      };
    }

    if (!staffUser) {
      return NextResponse.json({
        success: false,
        message: 'User not found in staff_users table',
        debug: results,
      });
    }

    // Step 3: Password check
    if (!staffUser.password) {
      results.step3_password_check = {
        hasPassword: false,
        error: 'No password set for user',
      };
      return NextResponse.json({
        success: false,
        message: 'User has no password',
        debug: results,
      });
    }

    let passwordValid = false;
    let passwordError: string | null = null;
    try {
      passwordValid = await verifyPassword(password, staffUser.password);
      results.step3_password_check = {
        hasPassword: true,
        valid: passwordValid,
        enteredLength: password.length,
        hashLength: staffUser.password.length,
        hashStart: staffUser.password.substring(0, 30),
      };
    } catch (error: any) {
      passwordError = error.message;
      results.step3_password_check = {
        hasPassword: true,
        valid: false,
        error: passwordError,
      };
    }

    if (!passwordValid) {
      return NextResponse.json({
        success: false,
        message: 'Password verification failed',
        debug: results,
      });
    }

    // Step 4: Status check
    const userStatus = (staffUser.status || '').toUpperCase();
    results.step4_status_check = {
      status: staffUser.status,
      normalized: userStatus,
      isActive: !userStatus || userStatus === 'ACTIVE',
      isSuspended: userStatus === 'SUSPENDED' || userStatus === 'INACTIVE',
    };

    if (userStatus && userStatus !== 'ACTIVE' && (userStatus === 'SUSPENDED' || userStatus === 'INACTIVE')) {
      return NextResponse.json({
        success: false,
        message: 'Account is suspended',
        debug: results,
      });
    }

    // Final result
    results.final_result = {
      success: true,
      user: {
        id: staffUser.id,
        phone: staffUser.phone,
        role: staffUser.role,
        status: staffUser.status,
        firstName: staffUser.first_name,
        lastName: staffUser.last_name,
        shopId: staffUser.shop_id,
      },
    };

    return NextResponse.json({
      success: true,
      message: 'Login would succeed',
      debug: results,
    });
  } catch (error: any) {
    console.error('Debug login error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to debug login',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

