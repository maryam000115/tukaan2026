/**
 * Reset password for a staff user
 * Usage: npx tsx scripts/reset-password.ts <phone> <newPassword>
 * Example: npx tsx scripts/reset-password.ts 618238213 newpassword123
 */

import { hashPassword } from '../lib/auth';
import { execute, queryOne } from '../lib/db';

async function resetPassword() {
  const phone = process.argv[2];
  const newPassword = process.argv[3];

  if (!phone || !newPassword) {
    console.error('Usage: npx tsx scripts/reset-password.ts <phone> <newPassword>');
    console.error('Example: npx tsx scripts/reset-password.ts 618238213 newpassword123');
    process.exit(1);
  }

  try {
    // Normalize phone
    const numericPhone = phone.replace(/\D/g, '');
    const finalPhone = numericPhone.slice(-9);

    // Find user
    const user = await queryOne<any>(
      'SELECT id, phone, role FROM staff_users WHERE phone = ? OR phone = ?',
      [finalPhone, numericPhone]
    );

    if (!user) {
      console.error('User not found with phone:', phone);
      process.exit(1);
    }

    console.log('Found user:', {
      id: user.id,
      phone: user.phone,
      role: user.role,
    });

    // Hash new password
    const passwordHash = await hashPassword(newPassword);
    console.log('Password hashed successfully');

    // Update password
    await execute(
      'UPDATE staff_users SET password = ? WHERE id = ?',
      [passwordHash, user.id]
    );

    console.log('\n✅ Password reset successfully!');
    console.log('Phone:', user.phone);
    console.log('New password:', newPassword);
    console.log('\nYou can now login with this password.');

    process.exit(0);
  } catch (error: any) {
    console.error('Error resetting password:', error);
    process.exit(1);
  }
}

resetPassword();

