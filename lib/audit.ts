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
  } catch (error: any) {
    // ✅ Don't fail the main operation if audit logging fails
    // Handle missing audit_logs table gracefully
    if (error.code === 'ER_NO_SUCH_TABLE' || error.message?.includes('audit_logs')) {
      // Table doesn't exist - audit logging is optional
      if (process.env.NODE_ENV === 'development') {
        console.warn('audit_logs table not found - audit logging skipped');
      }
      return;
    }
    // Other errors (permissions, etc.) - log but don't fail
    console.error('Audit log error:', error);
  }
}
