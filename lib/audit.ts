import { execute } from './db';

export async function createAuditLog(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details?: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
) {
  try {
    await execute(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        action,
        entityType,
        entityId || null,
        details ? JSON.stringify(details) : null,
        ipAddress || null,
        userAgent || null,
      ]
    );
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    console.error('Audit log error:', error);
  }
}
