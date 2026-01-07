# Tukaan Users Single Table System

The system now uses a **single table `tukaan_users`** with strict role-based rules.

## Table Structure

**Table:** `tukaan_users`

**Key Columns:**
- `id` - AUTO_INCREMENT (never insert manually)
- `user_type` - ENUM('normal', 'tukaan')
- `password` - Must be hashed (bcrypt)
- `phone` - UNIQUE constraint
- `shop_created_at` - DATETIME DEFAULT CURRENT_TIMESTAMP (NULL for normal users)

## User Type Rules

### Normal Users (`user_type = 'normal'`)

**Allowed:**
- ✅ Can select a tukaan: `tukaan_id`

**Restricted:**
- ❌ `shop_name` MUST be NULL
- ❌ `shop_location` MUST be NULL  
- ❌ `shop_created_at` MUST be NULL (explicitly set in INSERT)

### Tukaan Users (`user_type = 'tukaan'`)

**Required:**
- ✅ `tukaan_id` - REQUIRED
- ✅ `shop_name` - REQUIRED
- ✅ `shop_location` - REQUIRED
- ✅ `shop_created_at` - Auto-set by database (DEFAULT CURRENT_TIMESTAMP)

**Important:** The application must NOT send `shop_created_at` for tukaan users. The database automatically sets it.

## Database Schema

Run `lib/tukaan-users-schema.sql` to create the table:

```sql
CREATE TABLE IF NOT EXISTS tukaan_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) UNIQUE,
  first_name VARCHAR(255) NOT NULL,
  middle_name VARCHAR(255),
  last_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  gender VARCHAR(20),
  user_type ENUM('normal', 'tukaan') NOT NULL,
  user_location VARCHAR(255),
  user_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  tukaan_id VARCHAR(36),
  shop_name VARCHAR(255),
  shop_location VARCHAR(255),
  shop_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  location VARCHAR(255),
  ...
);
```

## Insert Rules

1. **Never include `id` in INSERT** - it's AUTO_INCREMENT
2. **Never manually set `shop_created_at`** for tukaan users - DB sets it automatically (omit from INSERT)
3. **For normal users:** `shop_created_at` must be explicitly NULL in INSERT
4. **No ON DUPLICATE KEY UPDATE** - use separate UPDATE queries
5. **`phone` must be unique**

## Validation

The system validates:

- **Normal users:** Rejects if `shop_name`, `shop_location`, or `shop_created_at` is NOT NULL
- **Tukaan users:** Rejects if `shop_name` or `shop_location` is NULL
- **Tukaan ID:** Validates that tukaan exists if `tukaan_id` is provided

## Usage

### Create Normal User

```typescript
import { createTukaanUser } from '@/lib/user-helpers';

const user = await createTukaanUser({
  first_name: 'John',
  last_name: 'Doe',
  phone: '1234567890',
  password: 'plaintext', // Will be hashed automatically
  user_type: 'normal',
  tukaan_id: 'TUK-123', // Optional - can select a tukaan
  // shop_name, shop_location, shop_created_at will be set to NULL
});
```

### Create Tukaan User

```typescript
const tukaan = await createTukaanUser({
  first_name: 'Shop',
  last_name: 'Owner',
  phone: '9876543210',
  password: 'plaintext', // Will be hashed automatically
  user_type: 'tukaan',
  tukaan_id: 'TUK-456', // Required
  shop_name: 'My Shop', // Required
  shop_location: 'City, Country', // Required
  // shop_created_at is NOT included - DB sets it automatically
});
```

## Verification Query

Run this query to verify the data:

```sql
SELECT
  id,
  user_type,
  first_name,
  phone,
  tukaan_id,
  shop_name,
  shop_location,
  shop_created_at
FROM tukaan_users;
```

See `lib/tukaan-users-verification.sql` for the exact query.

## Implementation Files

- `lib/tukaan-users-schema.sql` - Database schema
- `lib/user-validation.ts` - Validation logic
- `lib/user-helpers.ts` - Helper functions for CRUD operations
- `lib/auth.ts` - Authentication using tukaan_users table
- `scripts/seed.ts` - Seed script for initial data
