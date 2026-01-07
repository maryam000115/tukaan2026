-- Single table schema for tukaan_users
-- Run this SQL to create/update the table

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
  INDEX idx_phone (phone),
  INDEX idx_user_type (user_type),
  INDEX idx_tukaan_id (tukaan_id),
  INDEX idx_user_id (user_id)
);

-- Add constraints to enforce business rules
-- Note: MySQL doesn't support CHECK constraints in older versions, so we enforce in application layer

