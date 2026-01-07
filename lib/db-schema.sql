-- Database schema for Tukaanle
-- Run this SQL to create all tables

CREATE TABLE IF NOT EXISTS system_config (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  status ENUM('ACTIVE', 'LOCKED') DEFAULT 'ACTIVE',
  last_locked_by VARCHAR(36),
  last_locked_at DATETIME,
  last_unlocked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  first_name VARCHAR(255) NOT NULL,
  middle_name VARCHAR(255),
  last_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  gender VARCHAR(20),
  role ENUM('OWNER', 'ADMIN', 'STAFF', 'CUSTOMER') NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
  shop_id VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS shops (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  admin_user_id VARCHAR(36) UNIQUE NOT NULL,
  shop_name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS items (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  shop_id VARCHAR(36) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  tag VARCHAR(100),
  status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY unique_item_shop (item_name, shop_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  shop_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address TEXT,
  status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_customer_phone_shop (phone, shop_id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  shop_id VARCHAR(36) NOT NULL,
  customer_id VARCHAR(36) NOT NULL,
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
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (delivered_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_shop_id (shop_id),
  INDEX idx_customer_id (customer_id),
  INDEX idx_status (status)
);

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

CREATE TABLE IF NOT EXISTS debt_ledger (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  shop_id VARCHAR(36) NOT NULL,
  customer_id VARCHAR(36) NOT NULL,
  invoice_id VARCHAR(36),
  transaction_type ENUM('DEBT_ADD', 'PAYMENT', 'ADJUSTMENT') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  notes TEXT,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_shop_customer (shop_id, customer_id),
  INDEX idx_customer_id (customer_id)
);

CREATE TABLE IF NOT EXISTS monthly_statements (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  shop_id VARCHAR(36) NOT NULL,
  customer_id VARCHAR(36) NOT NULL,
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
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY unique_statement (shop_id, customer_id, month_year),
  INDEX idx_shop_customer (shop_id, customer_id)
);

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
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_created_at (created_at)
);

