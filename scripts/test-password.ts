/**
 * Test script to verify password hashing and verification
 * Run: npx tsx scripts/test-password.ts
 */

import { hashPassword, verifyPassword } from '../lib/auth';

async function testPassword() {
  const testPassword = '123456'; // Change this to match your password
  
  console.log('Testing password hashing and verification...');
  console.log('Test password:', testPassword);
  
  // Hash a password
  const hash = await hashPassword(testPassword);
  console.log('\nGenerated hash:', hash);
  console.log('Hash length:', hash.length);
  console.log('Hash starts with:', hash.substring(0, 10));
  
  // Verify the password
  const isValid = await verifyPassword(testPassword, hash);
  console.log('\nPassword verification result:', isValid);
  
  // Test with wrong password
  const isInvalid = await verifyPassword('wrongpassword', hash);
  console.log('Wrong password verification result:', isInvalid);
  
  // Test with hash from database (replace with actual hash from your database)
  const dbHash = '$2b$12$3xvY8NErp08yS4CGCLoqZuwi6ZihsLEqXCW.vZfSDmV...'; // Replace with actual hash
  console.log('\nTesting with database hash...');
  console.log('Database hash:', dbHash.substring(0, 30) + '...');
  
  const dbTest = await verifyPassword(testPassword, dbHash);
  console.log('Database hash verification result:', dbTest);
}

testPassword().catch(console.error);

