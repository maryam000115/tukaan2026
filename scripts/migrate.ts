import { pool } from '../lib/db';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration() {
  console.log('Running database migration...');
  console.log('Database: testes1');
  
  const connection = await pool.getConnection();
  
  try {
    // Read the migration SQL file
    const migrationPath = join(process.cwd(), 'lib', 'migrations', '001_create_audit_logs_and_system_config.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`Executing ${statements.length} SQL statements...`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          await connection.query(statement);
          console.log(`✓ Statement ${i + 1} executed successfully`);
        } catch (error: any) {
          // Ignore "Table already exists" errors for CREATE TABLE IF NOT EXISTS
          if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.message?.includes('already exists')) {
            console.log(`⚠ Statement ${i + 1} skipped (table already exists)`);
          } else {
            console.error(`✗ Statement ${i + 1} failed:`, error.message);
            throw error;
          }
        }
      }
    }
    
    console.log('\n✅ Migration completed successfully!');
    console.log('Created tables:');
    console.log('  - audit_logs (with indexes on user_id, action, created_at)');
    console.log('  - system_config (with at least one ACTIVE row)');
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    connection.release();
  }
}

runMigration()
  .then(() => {
    console.log('\nMigration script completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
