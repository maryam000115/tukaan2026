-- SQL to add missing columns to existing database structure
-- Run these ALTER TABLE statements to add columns needed by the application

-- Add password_hash to users table if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) AFTER phone;

-- Add email to users table if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email VARCHAR(255) AFTER phone;

-- Add status to users table if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE' AFTER user_type;

-- Normalize user_type to uppercase values (OWNER, ADMIN, STAFF, CUSTOMER)
-- You may need to update existing data:
-- UPDATE users SET user_type = UPPER(user_type);

-- Create system_config table if it doesn't exist
CREATE TABLE IF NOT EXISTS system_config (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  status ENUM('ACTIVE', 'LOCKED') DEFAULT 'ACTIVE',
  last_locked_by VARCHAR(36),
  last_locked_at DATETIME,
  last_unlocked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create customers table if it doesn't exist (assuming it doesn't based on your schema)
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  shop_name VARCHAR(255),
  user_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address TEXT,
  status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create invoices table if it doesn't exist
CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  shop_name VARCHAR(255),
  customer_id VARCHAR(36),
  requested_month VARCHAR(7),
  status ENUM('DRAFT', 'SUBMITTED', 'ACCEPTED', 'PREPARING', 'AMOUNT_ENTERED', 'DELIVERED_CONFIRMED', 'REJECTED') DEFAULT 'DRAFT',
  subtotal DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) DEFAULT 0,
  paid_amount DECIMAL(10, 2) DEFAULT 0,
  remaining_debt DECIMAL(10, 2) DEFAULT 0,
  accepted_by VARCHAR(36),
  delivered_by VARCHAR(36),
  delivered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Create invoice_items table if it doesn't exist
CREATE TABLE IF NOT EXISTS invoice_items (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  invoice_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36),
  item_name_snapshot VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  unit_price_snapshot DECIMAL(10, 2) NOT NULL,
  line_total DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
);

-- Create debt_ledger table if it doesn't exist
CREATE TABLE IF NOT EXISTS debt_ledger (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  shop_name VARCHAR(255),
  customer_id VARCHAR(36),
  invoice_id VARCHAR(36),
  transaction_type ENUM('DEBT_ADD', 'PAYMENT', 'ADJUSTMENT') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  notes TEXT,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Create monthly_statements table if it doesn't exist
CREATE TABLE IF NOT EXISTS monthly_statements (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  shop_name VARCHAR(255),
  customer_id VARCHAR(36),
  month_year VARCHAR(7) NOT NULL,
  opening_balance DECIMAL(10, 2) DEFAULT 0,
  total_debt_added DECIMAL(10, 2) DEFAULT 0,
  total_paid DECIMAL(10, 2) DEFAULT 0,
  closing_balance DECIMAL(10, 2) DEFAULT 0,
  status ENUM('OPEN', 'CLOSED') DEFAULT 'OPEN',
  closed_by VARCHAR(36),
  closed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create audit_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36),
  details TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

