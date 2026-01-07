import { query, queryOne, execute } from './db';
import { hashPassword } from './auth';
import { validateTukaanUser, prepareInsertData, validateTukaanExists, TukaanUserInput } from './user-validation';

export interface TukaanUser {
  id: number;
  user_id?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  phone: string;
  password: string;
  gender?: string;
  user_type: 'normal' | 'tukaan';
  user_location?: string;
  user_created_at: Date;
  tukaan_id?: string;
  shop_name?: string;
  shop_location?: string;
  shop_created_at?: Date;
  location?: string;
}

// Insert a new user with validation
export async function createTukaanUser(
  data: TukaanUserInput
): Promise<{ id: number; user: TukaanUser }> {
  // Validate input
  const validation = validateTukaanUser(data);
  if (!validation.valid) {
    throw {
      status: 400,
      message: 'Validation failed',
      errors: validation.errors,
    };
  }

  // Validate tukaan exists if tukaan_id is provided
  if (data.tukaan_id) {
    const tukaanExists = await validateTukaanExists(data.tukaan_id);
    if (!tukaanExists) {
      throw {
        status: 400,
        message: 'Tukaan not found',
        errors: { tukaan_id: 'The specified tukaan does not exist' },
      };
    }
  }

  // Hash password
  const hashedPassword = await hashPassword(data.password);

  // Prepare insert data
  const insertData = prepareInsertData({ ...data, password: hashedPassword });

  // Handle shop_created_at for normal users (must be NULL despite DEFAULT)
  // For MySQL, we need to explicitly set it to NULL
  let sql = `INSERT INTO tukaan_users (${insertData.fields.join(', ')}) VALUES (${insertData.placeholders})`;
  
  // For normal users, we need special handling since shop_created_at has DEFAULT CURRENT_TIMESTAMP
  // We'll use NULL explicitly in a way that overrides the default
  if (data.user_type === 'normal') {
    // Replace shop_created_at placeholder with NULL
    const shopCreatedAtIndex = insertData.fields.indexOf('shop_created_at');
    if (shopCreatedAtIndex >= 0) {
      // Remove it from fields and values, handle separately
      insertData.fields.splice(shopCreatedAtIndex, 1);
      insertData.values.splice(shopCreatedAtIndex, 1);
      insertData.placeholders = insertData.fields.map(() => '?').join(', ');
      sql = `INSERT INTO tukaan_users (${insertData.fields.join(', ')}) VALUES (${insertData.placeholders})`;
    }
  }

  // Execute insert
  const result = await execute(sql, insertData.values);

  if (!result.insertId) {
    throw { status: 500, message: 'Failed to create user' };
  }

  // Fetch created user
  const user = await queryOne<TukaanUser>(
    `SELECT id, user_id, first_name, middle_name, last_name, phone, password, gender, 
     user_type, user_location, user_created_at, tukaan_id, shop_name, shop_location, 
     shop_created_at, location 
     FROM tukaan_users WHERE id = ?`,
    [result.insertId]
  );

  if (!user) {
    throw { status: 500, message: 'User created but could not be retrieved' };
  }

  return { id: result.insertId, user };
}

// Get user by ID
export async function getTukaanUserById(id: number): Promise<TukaanUser | null> {
  return await queryOne<TukaanUser>(
    `SELECT id, user_id, first_name, middle_name, last_name, phone, password, gender, 
     user_type, user_location, user_created_at, tukaan_id, shop_name, shop_location, 
     shop_created_at, location 
     FROM tukaan_users WHERE id = ?`,
    [id]
  );
}

// Get user by phone
export async function getTukaanUserByPhone(phone: string): Promise<TukaanUser | null> {
  return await queryOne<TukaanUser>(
    `SELECT id, user_id, first_name, middle_name, last_name, phone, password, gender, 
     user_type, user_location, user_created_at, tukaan_id, shop_name, shop_location, 
     shop_created_at, location 
     FROM tukaan_users WHERE phone = ?`,
    [phone]
  );
}

// List users with optional filters
export async function listTukaanUsers(filters?: {
  user_type?: 'normal' | 'tukaan';
  tukaan_id?: string;
}): Promise<TukaanUser[]> {
  let sql = `SELECT id, user_id, first_name, middle_name, last_name, phone, password, gender, 
             user_type, user_location, user_created_at, tukaan_id, shop_name, shop_location, 
             shop_created_at, location 
             FROM tukaan_users WHERE 1=1`;
  const params: any[] = [];

  if (filters?.user_type) {
    sql += ' AND user_type = ?';
    params.push(filters.user_type);
  }

  if (filters?.tukaan_id) {
    sql += ' AND tukaan_id = ?';
    params.push(filters.tukaan_id);
  }

  sql += ' ORDER BY user_created_at DESC';

  return await query<TukaanUser>(sql, params);
}

