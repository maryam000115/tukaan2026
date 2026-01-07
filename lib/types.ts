// Type definitions to replace @prisma/client imports

export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
  CUSTOMER = 'CUSTOMER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum SystemStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  ACCEPTED = 'ACCEPTED',
  PREPARING = 'PREPARING',
  AMOUNT_ENTERED = 'AMOUNT_ENTERED',
  DELIVERED_CONFIRMED = 'DELIVERED_CONFIRMED',
  REJECTED = 'REJECTED',
}

export enum TransactionType {
  DEBT_ADD = 'DEBT_ADD',
  PAYMENT = 'PAYMENT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum StatementStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

// Database row types (snake_case from DB)
export interface UserRow {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  phone: string;
  email: string | null;
  password_hash: string;
  gender: string | null;
  role: UserRole;
  status: UserStatus;
  shop_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ShopRow {
  id: string;
  admin_user_id: string;
  creator_id: string | null;
  shop_name: string;
  location: string | null;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
}

export interface ItemRow {
  id: string;
  shop_id: string;
  item_name: string;
  description: string | null;
  price: number;
  tag: string | null;
  status: UserStatus;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface CustomerRow {
  id: string;
  shop_id: string;
  user_id: string;
  name: string;
  phone: string;
  address: string | null;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  shop_id: string;
  customer_id: string;
  requested_month: string | null;
  status: InvoiceStatus;
  subtotal: number;
  total_amount: number;
  paid_amount: number;
  remaining_debt: number;
  accepted_by: string | null;
  delivered_by: string | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  item_id: string | null;
  item_name_snapshot: string;
  quantity: number;
  unit_price_snapshot: number;
  line_total: number;
}

export interface DebtLedgerRow {
  id: string;
  shop_id: string;
  customer_id: string;
  invoice_id: string | null;
  transaction_type: TransactionType;
  amount: number;
  notes: string | null;
  created_by: string;
  created_at: Date;
}

export interface MonthlyStatementRow {
  id: string;
  shop_id: string;
  customer_id: string;
  month_year: string;
  opening_balance: number;
  total_debt_added: number;
  total_paid: number;
  closing_balance: number;
  status: StatementStatus;
  closed_by: string | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SystemConfigRow {
  id: string;
  status: SystemStatus;
  last_locked_by: string | null;
  last_locked_at: Date | null;
  last_unlocked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

