# Using Existing Database

Your existing database has a different structure. Here's how to adapt the application:

## Existing Table Structure

Based on your queries:

1. **users** table: `id`, `first_name`, `middle_name`, `last_name`, `phone`, `gender`, `user_type`, `shop_name`, `location`, `created_at`
2. **tukaan** table: `id`, `user_id`, `shop_name`, `location`, `created_at`
3. **items** table: `id`, `item_name`, `detail`, `quantity`, `price`, `taken_by`, `taken_date`, `user_id`, `created_at`

## Required Changes

### 1. Add Missing Columns

Run the SQL statements in `lib/db-schema-existing.sql` to add:
- `password_hash` column to `users` table
- `email` column to `users` table (optional)
- `status` column to `users` table

### 2. Update user_type Values

Make sure `user_type` values are: `OWNER`, `ADMIN`, `STAFF`, or `CUSTOMER` (uppercase)

```sql
UPDATE users SET user_type = UPPER(user_type);
```

### 3. Create Missing Tables

The script will create:
- `system_config` - System status
- `customers` - Customer records
- `invoices` - Invoice records
- `invoice_items` - Invoice line items
- `debt_ledger` - Debt and payment records
- `monthly_statements` - Monthly account closing
- `audit_logs` - System audit trail

## Database Connection

The application will use your existing tables:
- `users` table as-is (mapping `user_type` to `role`)
- `tukaan` table for shops
- `items` table as-is (using `detail` for description, `user_id` for creator)

## Next Steps

1. Run the ALTER TABLE statements from `lib/db-schema-existing.sql`
2. Run the CREATE TABLE statements for missing tables
3. Run `npm run db:seed` to create system owner
4. Update API routes to use your existing column names

## Column Mapping

- `user_type` → `role` (normalized to OWNER/ADMIN/STAFF/CUSTOMER)
- `detail` → `description` (for items)
- `shop_name` → used as shop identifier
- `user_id` → used for item creator and shop admin

