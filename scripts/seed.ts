import { execute, queryOne } from '../lib/db';
import { hashPassword } from '../lib/auth';

async function main() {
  console.log('Seeding database...');

  try {
    // Create system owner (tukaan type user)
    const passwordHash = await hashPassword('admin123');
    const existingOwner = await queryOne(
      'SELECT id FROM tukaan_users WHERE phone = ?',
      ['252612345678']
    );

    if (!existingOwner) {
      // Generate tukaan_id (you can use UUID or any unique identifier)
      const tukaanId = `TUK-${Date.now()}`;
      
      const result = await execute(
        `INSERT INTO tukaan_users (
          first_name, last_name, phone, password, user_type, 
          tukaan_id, shop_name, shop_location
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'System',
          'Owner',
          '252612345678',
          passwordHash,
          'tukaan',
          tukaanId,
          'Main Shop',
          'Default Location'
        ]
      );
      console.log('System owner created with ID:', result.insertId);
    } else {
      console.log('System owner already exists');
    }

    console.log('Seeding completed!');
    console.log('Default login:');
    console.log('  Phone: 252612345678');
    console.log('  Password: admin123');
    console.log('  Type: tukaan (shop owner)');
  } catch (error: any) {
    console.error('Seeding error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

main();
