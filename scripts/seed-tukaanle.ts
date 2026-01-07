/**
 * Seed script for Tukaanle database
 * 
 * This script creates:
 * - 1 tukaan (shop)
 * - 1 SUPER_ADMIN (tukaan_id = NULL)
 * - 1 ADMIN (tukaan_id = tukaan.id)
 * - 1 STAFF (tukaan_id = tukaan.id)
 * - 2 CUSTOMERS (tukaan_id = tukaan.id)
 * 
 * Run with: npx tsx scripts/seed-tukaanle.ts
 * Or: node --loader ts-node/esm scripts/seed-tukaanle.ts
 */

import { hash } from 'bcryptjs';
import { query, execute } from '../lib/db';

async function seed() {
  try {
    console.log('🌱 Starting Tukaanle database seed...\n');

    // Hash password function
    const hashPassword = async (password: string): Promise<string> => {
      return hash(password, 12);
    };

    const defaultPassword = 'password123'; // Change this in production!
    const hashedPassword = await hashPassword(defaultPassword);

    // 1. Create Tukaan
    console.log('📦 Creating tukaan...');
    const tukaanResult = await execute(
      `INSERT INTO tukaans (tukaan_code, name, location, phone, status) 
       VALUES (?, ?, ?, ?, 'ACTIVE')`,
      ['TUK001', 'Main Shop', 'Mogadishu', '612345678']
    );

    const tukaanId = tukaanResult.insertId;
    console.log(`✅ Tukaan created with ID: ${tukaanId}\n`);

    // 2. Create SUPER_ADMIN (tukaan_id = NULL)
    console.log('👑 Creating SUPER_ADMIN...');
    const superAdminResult = await execute(
      `INSERT INTO staff_users (
        tukaan_id, first_name, middle_name, last_name, phone, password, 
        gender, role, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SUPER_ADMIN', 'ACTIVE')`,
      [
        null, // tukaan_id is NULL for SUPER_ADMIN
        'Super',
        'Admin',
        'User',
        '611111111',
        hashedPassword,
        'male',
      ]
    );
    console.log(`✅ SUPER_ADMIN created with ID: ${superAdminResult.insertId}\n`);

    // 3. Create ADMIN (tukaan_id = tukaan.id)
    console.log('🏪 Creating ADMIN...');
    const adminResult = await execute(
      `INSERT INTO staff_users (
        tukaan_id, first_name, middle_name, last_name, phone, password, 
        gender, role, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ADMIN', 'ACTIVE')`,
      [
        tukaanId,
        'Admin',
        'Shop',
        'Owner',
        '622222222',
        hashedPassword,
        'male',
      ]
    );
    console.log(`✅ ADMIN created with ID: ${adminResult.insertId}\n`);

    // 4. Create STAFF (tukaan_id = tukaan.id)
    console.log('👤 Creating STAFF...');
    const staffResult = await execute(
      `INSERT INTO staff_users (
        tukaan_id, first_name, middle_name, last_name, phone, password, 
        gender, role, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'STAFF', 'ACTIVE')`,
      [
        tukaanId,
        'Staff',
        'Worker',
        'One',
        '633333333',
        hashedPassword,
        'male',
      ]
    );
    console.log(`✅ STAFF created with ID: ${staffResult.insertId}\n`);

    // 5. Create 2 CUSTOMERS (tukaan_id = tukaan.id)
    console.log('🛒 Creating CUSTOMERS...');
    const customer1Result = await execute(
      `INSERT INTO customers (
        tukaan_id, first_name, middle_name, last_name, phone, password, 
        gender, location, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [
        tukaanId,
        'Customer',
        'One',
        'Test',
        '644444444',
        hashedPassword,
        'male',
        'Mogadishu',
      ]
    );
    console.log(`✅ Customer 1 created with ID: ${customer1Result.insertId}`);

    const customer2Result = await execute(
      `INSERT INTO customers (
        tukaan_id, first_name, middle_name, last_name, phone, password, 
        gender, location, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [
        tukaanId,
        'Customer',
        'Two',
        'Test',
        '655555555',
        hashedPassword,
        'female',
        'Hargeisa',
      ]
    );
    console.log(`✅ Customer 2 created with ID: ${customer2Result.insertId}\n`);

    // Summary
    console.log('📊 Seed Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Tukaan ID: ${tukaanId}`);
    console.log(`SUPER_ADMIN Phone: 611111111`);
    console.log(`ADMIN Phone: 622222222`);
    console.log(`STAFF Phone: 633333333`);
    console.log(`Customer 1 Phone: 644444444`);
    console.log(`Customer 2 Phone: 655555555`);
    console.log(`Default Password: ${defaultPassword}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ Seed completed successfully!');
    console.log('⚠️  Remember to change default passwords in production!\n');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Seed failed:', error);
    console.error('Error details:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    process.exit(1);
  }
}

// Run seed
seed();

