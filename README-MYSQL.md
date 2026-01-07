# MySQL Setup Instructions

This application now uses **raw MySQL queries** with `mysql2` instead of Prisma ORM.

## Database Setup

### 1. Create the Database

```sql
CREATE DATABASE tukaanle;
```

### 2. Run the Schema

Run the SQL schema file to create all tables:

```bash
mysql -u root -p tukaanle < lib/db-schema.sql
```

Or copy the contents of `lib/db-schema.sql` and run it in your MySQL client.

### 3. Configure Environment Variables

Make sure your `.env` file has:

```env
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=tukaanle
DB_USERNAME=root
DB_PASSWORD=your_password
```

### 4. Seed Initial Data

```bash
npm run db:seed
```

This will create:
- System configuration (status: ACTIVE)
- System owner user (phone: 252612345678, password: admin123)

## Migration from Prisma

All Prisma queries have been replaced with raw SQL queries using `mysql2`. The application now:

- Uses connection pooling for efficient database connections
- Uses prepared statements (parameterized queries) for security
- Has proper error handling for MySQL errors
- Maintains the same functionality as before

## Database Connection

The connection is managed in `lib/db.ts`:
- Uses connection pooling
- Automatically handles connection retries
- Graceful shutdown on process termination
- Health check endpoint at `/api/health`

## Query Helpers

Use these helpers from `lib/db.ts`:

- `query<T>(sql, params)` - Execute SELECT queries, returns array
- `queryOne<T>(sql, params)` - Execute SELECT query, returns single row or null
- `execute(sql, params)` - Execute INSERT/UPDATE/DELETE, returns { affectedRows, insertId }

All queries use prepared statements to prevent SQL injection.

