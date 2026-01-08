import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';

/**
 * Test password verification for a user
 * POST /api/auth/test-password
 * Body: { phone: "618238213", password: "123456" }
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

    // Normalize phone
    const numericPhone = phone.replace(/\D/g, '');
    const finalPhone = numericPhone.slice(-9);

    // Find user
    const staffUser = await queryOne<any>(
      `SELECT id, phone, password, role, status 
       FROM staff_users 
       WHERE phone = ? OR phone = ?`,
      [finalPhone, numericPhone]
    );

    if (!staffUser) {
      return NextResponse.json({
        success: false,
        found: false,
        message: 'User not found',
        phone: phone,
        normalizedPhone: numericPhone,
        finalPhone: finalPhone,
      });
    }

    // Test password
    let passwordValid = false;
    let passwordError: string | null = null;

    try {
      passwordValid = await verifyPassword(password, staffUser.password);
    } catch (error: any) {
      passwordError = error.message;
    }

    return NextResponse.json({
      success: true,
      found: true,
      user: {
        id: staffUser.id,
        phone: staffUser.phone,
        role: staffUser.role,
        status: staffUser.status,
        passwordLength: staffUser.password?.length,
        passwordHashStart: staffUser.password?.substring(0, 20),
      },
      passwordTest: {
        valid: passwordValid,
        error: passwordError,
        enteredPasswordLength: password.length,
      },
    });
  } catch (error: any) {
    console.error('Test password error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to test password',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

