-- Migration: Create audit_logs and system_config tables
-- Database: testes1
-- Safe to run multiple times (uses CREATE TABLE IF NOT EXISTS)

-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id BIGINT NULL,
  details JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Create system_config table
CREATE TABLE IF NOT EXISTS system_config (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  status ENUM('ACTIVE', 'MAINTENANCE') DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Ensure at least one row exists in system_config with status = 'ACTIVE'
-- If table is empty, insert a row with status = 'ACTIVE'
-- Using a subquery workaround for MySQL compatibility
INSERT INTO system_config (status)
SELECT 'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT 1 FROM system_config LIMIT 1) AS tmp
);
