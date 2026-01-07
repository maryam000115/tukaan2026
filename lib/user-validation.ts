// Validation for tukaan_users table inserts/updates

export interface TukaanUserInput {
  user_id?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  phone: string;
  password: string;
  gender?: string;
  user_type: 'normal' | 'tukaan';
  user_location?: string;
  tukaan_id?: string;
  shop_name?: string;
  shop_location?: string;
  location?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateTukaanUser(data: TukaanUserInput): ValidationResult {
  const errors: Record<string, string> = {};

  // Required fields
  if (!data.first_name || data.first_name.trim().length === 0) {
    errors.first_name = 'First name is required';
  }

  if (!data.last_name || data.last_name.trim().length === 0) {
    errors.last_name = 'Last name is required';
  }

  if (!data.phone || data.phone.trim().length === 0) {
    errors.phone = 'Phone is required';
  } else {
    const phoneNumeric = data.phone.replace(/\D/g, '');
    if (phoneNumeric.length < 9 || phoneNumeric.length > 15) {
      errors.phone = 'Phone must be between 9 and 15 digits';
    }
  }

  if (!data.password || data.password.length < 6) {
    errors.password = 'Password must be at least 6 characters';
  }

  if (!data.user_type || !['normal', 'tukaan'].includes(data.user_type)) {
    errors.user_type = 'User type must be "normal" or "tukaan"';
  }

  // Type-specific validations
  if (data.user_type === 'normal') {
    // Normal users: shop fields MUST be NULL
    if (data.shop_name !== undefined && data.shop_name !== null) {
      errors.shop_name = 'Shop name must be NULL for normal users';
    }
    if (data.shop_location !== undefined && data.shop_location !== null) {
      errors.shop_location = 'Shop location must be NULL for normal users';
    }
    // shop_created_at is handled by DB default, but we ensure it's not set
  } else if (data.user_type === 'tukaan') {
    // Tukaan users: shop fields REQUIRED (except shop_created_at which is auto-set)
    if (!data.shop_name || data.shop_name.trim().length === 0) {
      errors.shop_name = 'Shop name is required for tukaan users';
    }
    if (!data.shop_location || data.shop_location.trim().length === 0) {
      errors.shop_location = 'Shop location is required for tukaan users';
    }
    if (!data.tukaan_id || data.tukaan_id.trim().length === 0) {
      errors.tukaan_id = 'Tukaan ID is required for tukaan users';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// Prepare insert data based on user type
export function prepareInsertData(data: TukaanUserInput): {
  fields: string[];
  values: any[];
  placeholders: string;
} {
  const fields: string[] = [];
  const values: any[] = [];

  // Required fields
  if (data.user_id) {
    fields.push('user_id');
    values.push(data.user_id);
  }

  fields.push('first_name');
  values.push(data.first_name);

  if (data.middle_name) {
    fields.push('middle_name');
    values.push(data.middle_name);
  }

  fields.push('last_name');
  values.push(data.last_name);
  fields.push('phone');
  values.push(data.phone);
  fields.push('password');
  values.push(data.password); // Should be hashed before this

  if (data.gender) {
    fields.push('gender');
    values.push(data.gender);
  }

  fields.push('user_type');
  values.push(data.user_type);

  if (data.user_location) {
    fields.push('user_location');
    values.push(data.user_location);
  }

  if (data.location) {
    fields.push('location');
    values.push(data.location);
  }

  // Type-specific fields
  if (data.user_type === 'normal') {
    // Normal users: can have tukaan_id, but shop fields must be NULL
    if (data.tukaan_id) {
      fields.push('tukaan_id');
      values.push(data.tukaan_id);
    }
    // Explicitly set shop fields to NULL for normal users
    fields.push('shop_name');
    values.push(null);
    fields.push('shop_location');
    values.push(null);
    // shop_created_at must be explicitly NULL for normal users
    fields.push('shop_created_at');
    values.push(null);
  } else if (data.user_type === 'tukaan') {
    // Tukaan users: required shop fields, shop_created_at auto-set by DB
    if (data.tukaan_id) {
      fields.push('tukaan_id');
      values.push(data.tukaan_id);
    }
    fields.push('shop_name');
    values.push(data.shop_name);
    fields.push('shop_location');
    values.push(data.shop_location);
    // Do NOT include shop_created_at - let DB set it with DEFAULT CURRENT_TIMESTAMP
  }

  const placeholders = fields.map(() => '?').join(', ');

  return { fields, values, placeholders };
}

// Validate that tukaan exists (if tukaan_id is provided)
export async function validateTukaanExists(
  tukaanId: string
): Promise<boolean> {
  const { queryOne } = await import('./db');
  const tukaan = await queryOne(
    'SELECT id FROM tukaan_users WHERE user_type = ? AND tukaan_id = ?',
    ['tukaan', tukaanId]
  );
  return tukaan !== null;
}

