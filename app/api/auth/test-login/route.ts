import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Test endpoint to check if a phone number exists in staff_users
 * GET /api/auth/test-login?phone=618238213
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone parameter is required' },
        { status: 400 }
      );
    }

    // Normalize phone
    const numericPhone = phone.replace(/\D/g, '');
    const finalPhone = numericPhone.slice(-9);

    // Query staff_users with exact phone match
    const staffUsers = await query<any>(
      `SELECT id, phone, role, status, 
       LENGTH(password) as password_length,
       LEFT(password, 30) as password_preview,
       password as full_password
       FROM staff_users 
       WHERE phone = ? OR phone = ? OR phone LIKE ?`,
      [finalPhone, numericPhone, `%${finalPhone}`]
    );
    
    // Also try exact match
    const exactMatch = await query<any>(
      `SELECT id, phone, role, status, 
       LENGTH(password) as password_length,
       LEFT(password, 30) as password_preview
       FROM staff_users 
       WHERE phone = ?`,
      [phone] // Try original phone as-is
    );

    return NextResponse.json({
      success: true,
      phone: phone,
      normalizedPhone: numericPhone,
      finalPhone: finalPhone,
      found: staffUsers.length > 0 || exactMatch.length > 0,
      queryResults: {
        withNormalized: staffUsers.length,
        withExact: exactMatch.length,
      },
      users: staffUsers.map((u: any) => ({
        id: u.id,
        phone: u.phone,
        role: u.role,
        status: u.status,
        hasPassword: u.password_length > 0,
        passwordPreview: u.password_preview,
        phoneMatch: u.phone === finalPhone || u.phone === numericPhone || u.phone === phone,
      })),
      exactMatch: exactMatch.map((u: any) => ({
        id: u.id,
        phone: u.phone,
        role: u.role,
        status: u.status,
        hasPassword: u.password_length > 0,
        passwordPreview: u.password_preview,
      })),
    });
  } catch (error: any) {
    console.error('Test login error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to test login',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

