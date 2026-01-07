// Database column mappings for existing database structure

export const DB_TABLES = {
  users: 'users',
  shops: 'tukaan', // Existing table name
  items: 'items',
  customers: 'customers',
  invoices: 'invoices',
  invoiceItems: 'invoice_items',
  debtLedger: 'debt_ledger',
  monthlyStatements: 'monthly_statements',
  auditLogs: 'audit_logs',
  systemConfig: 'system_config',
};

// Column mappings for users table
export const USER_COLUMNS = {
  id: 'id',
  firstName: 'first_name',
  middleName: 'middle_name',
  lastName: 'last_name',
  phone: 'phone',
  gender: 'gender',
  role: 'user_type', // Maps to user_type in existing DB
  shopName: 'shop_name', // Existing column
  location: 'location', // Existing column
  createdAt: 'created_at',
};

// Column mappings for tukaan (shops) table
export const SHOP_COLUMNS = {
  id: 'id',
  userId: 'user_id',
  shopName: 'shop_name',
  location: 'location',
  createdAt: 'created_at',
};

// Column mappings for items table
export const ITEM_COLUMNS = {
  id: 'id',
  itemName: 'item_name',
  description: 'detail', // Maps to detail in existing DB
  quantity: 'quantity',
  price: 'price',
  takenBy: 'taken_by',
  takenDate: 'taken_date',
  userId: 'user_id', // Instead of shop_id and created_by
  createdAt: 'created_at',
};

