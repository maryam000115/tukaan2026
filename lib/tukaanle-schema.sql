-- Tukaanle Database Schema
-- Run this SQL to create all tables for the new system

-- Table: tukaans
CREATE TABLE IF NOT EXISTS tukaans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tukaan_code VARCHAR(50) UNIQUE,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  phone VARCHAR(20),
  status ENUM('ACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_tukaan_code (tukaan_code)
);

-- Table: customers
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tukaan_id INT NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  middle_name VARCHAR(255),
  last_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  gender VARCHAR(20),
  location VARCHAR(255),
  status ENUM('ACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tukaan_id) REFERENCES tukaans(id) ON DELETE RESTRICT,
  INDEX idx_phone (phone),
  INDEX idx_tukaan_id (tukaan_id),
  INDEX idx_status (status)
);

-- Table: staff_users
CREATE TABLE IF NOT EXISTS staff_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tukaan_id INT NULL, -- NULL only for SUPER_ADMIN
  first_name VARCHAR(255) NOT NULL,
  middle_name VARCHAR(255),
  last_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  gender VARCHAR(20),
  role ENUM('STAFF', 'ADMIN', 'SUPER_ADMIN') NOT NULL,
  status ENUM('ACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tukaan_id) REFERENCES tukaans(id) ON DELETE RESTRICT,
  INDEX idx_phone (phone),
  INDEX idx_tukaan_id (tukaan_id),
  INDEX idx_role (role),
  INDEX idx_status (status)
);

-- Table: items (updated schema)
CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tukaan_id INT NOT NULL,
  customer_id INT,
  staff_id INT,
  item_name VARCHAR(255) NOT NULL,
  detail TEXT,
  quantity DECIMAL(10, 2) DEFAULT 1,
  price DECIMAL(10, 2) NOT NULL,
  payment_type ENUM('DEEN', 'PAID') DEFAULT 'DEEN',
  taken_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tukaan_id) REFERENCES tukaans(id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE SET NULL,
  INDEX idx_tukaan_id (tukaan_id),
  INDEX idx_customer_id (customer_id),
  INDEX idx_staff_id (staff_id),
  INDEX idx_payment_type (payment_type),
  INDEX idx_taken_date (taken_date)
);

