# Tukaanle Registration & Login System

Complete registration and login system for Tukaanle shop management web app using MySQL and Next.js.

## Database Schema

### Tables

1. **tukaans** - Shop/Tukaan information
2. **customers** - Customer accounts
3. **staff_users** - Staff, Admin, and Super Admin accounts
4. **items** - Items with customer and staff tracking

See `lib/tukaanle-schema.sql` for complete CREATE TABLE statements.

## Setup Instructions

### 1. Create Database Tables

Run the SQL schema file:

```bash
mysql -u your_username -p your_database < lib/tukaanle-schema.sql
```

Or execute the SQL directly in your MySQL client.

### 2. Seed Initial Data

Run the seed script to create initial data:

```bash
npx tsx scripts/seed-tukaanle.ts
```

This creates:
- 1 tukaan (shop)
- 1 SUPER_ADMIN (phone: 611111111)
- 1 ADMIN (phone: 622222222)
- 1 STAFF (phone: 633333333)
- 2 CUSTOMERS (phones: 644444444, 655555555)

**Default password for all accounts:** `password123`

⚠️ **Change default passwords in production!**

### 3. API Endpoints

#### GET `/api/tukaans`
Returns active tukaans for dropdown selection.

**Response:**
```json
{
  "success": true,
  "tukaans": [
    {
      "id": 1,
      "name": "Main Shop",
      "location": "Mogadishu"
    }
  ]
}
```

#### POST `/api/auth/register`
Register a new customer or staff account.

**Request Body:**
```json
{
  "accountType": "customer" | "staff",
  "tukaan_id": 1,
  "first_name": "John",
  "middle_name": "Middle",
  "last_name": "Doe",
  "phone": "612345678",
  "password": "password123",
  "gender": "male",
  "location": "Mogadishu"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Customer account created successfully",
  "user": {
    "id": "1",
    "accountType": "customer",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "612345678",
    "tukaanId": "1"
  }
}
```

**Validation:**
- Phone must be unique across both `customers` and `staff_users` tables
- Phone must be 9 digits (numeric)
- Password minimum 6 characters
- Tukaan must exist and be ACTIVE
- Admin and Super Admin cannot be created via UI (must be created manually in DB)

#### POST `/api/auth/login`
Login with phone and password.

**Request Body:**
```json
{
  "phone": "612345678",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "1",
    "phone": "612345678",
    "role": "customer",
    "accountType": "customer",
    "tukaanId": "1",
    "shopId": "1",
    "firstName": "John",
    "lastName": "Doe",
    "shopName": "Main Shop",
    "shopLocation": "Mogadishu"
  }
}
```

**Login Logic:**
1. First checks `staff_users` table
2. If not found, checks `customers` table
3. Falls back to legacy tables (`users`, `tukaan_users`) for backward compatibility

## Registration UI

The registration page (`/register`) includes:

- **Account Type Dropdown**: Customer or Staff (Admin/Super Admin cannot be created via UI)
- **Tukaan Selection**: Dropdown loads active tukaans from `/api/tukaans`
- **Form Fields**:
  - First Name (required)
  - Middle Name (optional)
  - Last Name (required)
  - Phone (required, 9 digits, unique)
  - Password (required, min 6 chars)
  - Confirm Password (required, must match)
  - Gender (optional)
  - Location (optional)

## Role-Based Access

### SUPER_ADMIN
- `tukaan_id` = NULL
- Can access global dashboards (all tukaans)
- Must be created manually in database

### ADMIN
- `tukaan_id` = tukaan.id
- Can access shop management for their tukaan
- Must be created manually in database (or via seed script)

### STAFF
- `tukaan_id` = tukaan.id
- Can access staff operations for their tukaan
- Can be created via registration UI

### CUSTOMER
- `tukaan_id` = tukaan.id
- Can access customer portal for their tukaan
- Can be created via registration UI

## Session/Token Model

When logged in, the session stores:
- `userId`: User ID
- `accountType`: "customer" or "staff"
- `role`: "owner" | "admin" | "staff" | "customer"
- `tukaanId`: Associated tukaan ID (if any)
- `shopId`: Same as tukaanId
- `shopName`: Tukaan name
- `shopLocation`: Tukaan location

## Phone Uniqueness

Phone numbers must be unique **across both tables**:
- If phone exists in `customers`, it cannot be used in `staff_users`
- If phone exists in `staff_users`, it cannot be used in `customers`

The registration endpoint checks both tables before allowing registration.

## Backward Compatibility

The authentication system maintains backward compatibility with legacy tables:
- `users` table (old schema)
- `tukaan_users` table (old schema)

If new tables don't exist, the system falls back to legacy tables automatically.

## Files Created/Updated

1. **lib/tukaanle-schema.sql** - Database schema
2. **app/api/tukaans/route.ts** - GET tukaans endpoint
3. **app/api/auth/register/route.ts** - Registration endpoint (updated)
4. **app/api/auth/login/route.ts** - Login endpoint (updated to return accountType)
5. **lib/auth.ts** - Authentication functions (updated to check staff_users first, then customers)
6. **app/register/page.tsx** - Registration UI (updated)
7. **scripts/seed-tukaanle.ts** - Seed script

## Testing

1. Run the seed script to create test data
2. Visit `/register` and create a customer account
3. Visit `/register` and create a staff account
4. Login with any created account at `/login`
5. Verify session contains correct `accountType` and `role`

## Production Notes

- Change default passwords from seed script
- Ensure phone validation is enforced
- Add rate limiting to registration endpoint
- Add email verification if needed
- Use HTTPS in production
- Store JWT_SECRET securely

