// Role-based access control (RBAC) permissions for Tukaanle PWA
import { UserRole } from './types';

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Convert role string to UserRole enum
 */
function normalizeRole(role: string | UserRole): UserRole {
  if (typeof role === 'string') {
    const upperRole = role.toUpperCase();
    if (upperRole === 'OWNER') return UserRole.OWNER;
    if (upperRole === 'ADMIN') return UserRole.ADMIN;
    if (upperRole === 'STAFF') return UserRole.STAFF;
    if (upperRole === 'CUSTOMER') return UserRole.CUSTOMER;
  }
  return role as UserRole;
}

/**
 * Check if user can perform an action based on their role
 */

// ========== SYSTEM LEVEL (OWNER ONLY) ==========

export function canLockUnlockSystem(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.OWNER) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only system owner can lock/unlock system' };
}

export function canViewPlatformOverview(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.OWNER) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only system owner can view platform overview' };
}

export function canManageAdmins(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.OWNER) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only system owner can manage admins' };
}

// ========== SHOP MANAGEMENT (ADMIN ONLY) ==========

export function canManageShopProfile(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin can manage shop profile' };
}

export function canManageUsersInShop(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN || role === UserRole.OWNER) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin can manage users in shop' };
}

export function canCreateStaffOrCustomer(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN || role === UserRole.OWNER) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin can create staff or customer accounts' };
}

export function canDeactivateUsers(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN || role === UserRole.OWNER) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin can deactivate users' };
}

// ========== ITEMS MANAGEMENT ==========

export function canCreateItems(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN || role === UserRole.STAFF) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin and staff can create items' };
}

export function canEditItems(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN || role === UserRole.STAFF) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin and staff can edit items' };
}

export function canDeactivateItems(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin can deactivate items' };
}

// ========== CUSTOMERS MANAGEMENT ==========

export function canManageCustomers(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin can manage customers' };
}

export function canViewCustomerHistory(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN || role === UserRole.STAFF) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin and staff can view customer history' };
}

// ========== INVOICES WORKFLOW ==========

export function canCreateInvoiceRequest(userRole: UserRole): PermissionCheck {
  if (userRole === UserRole.CUSTOMER || userRole === UserRole.ADMIN || userRole === UserRole.STAFF) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only customer, admin, and staff can create invoice requests' };
}

export function canAcceptInvoice(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN || role === UserRole.STAFF) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin and staff can accept invoices' };
}

export function canPrepareInvoice(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN || role === UserRole.STAFF) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin and staff can prepare invoices' };
}

export function canEnterInvoiceAmount(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN || role === UserRole.STAFF) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin and staff can enter invoice amounts' };
}

export function canConfirmDelivery(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN || role === UserRole.STAFF) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin and staff can confirm delivery' };
}

export function canRejectInvoice(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN || role === UserRole.STAFF) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin and staff can reject invoices' };
}

// ========== PAYMENTS & DEBT ==========

export function canRecordPayments(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN || role === UserRole.STAFF) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin and staff can record payments' };
}

export function canAddDebtAdjustments(userRole: UserRole | string): PermissionCheck {
  const role = normalizeRole(userRole);
  if (role === UserRole.ADMIN) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin can add debt adjustments' };
}

export function canMarkDebtCleared(userRole: UserRole): PermissionCheck {
  if (userRole === UserRole.ADMIN) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin can mark debt as cleared' };
}

// ========== MONTHLY CLOSING (XISAAB XIR) ==========

export function canGenerateMonthlyStatement(userRole: UserRole): PermissionCheck {
  if (userRole === UserRole.ADMIN) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin can generate monthly statements' };
}

export function canCloseMonthlyStatement(userRole: UserRole): PermissionCheck {
  if (userRole === UserRole.ADMIN) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin can close monthly statements' };
}

// ========== REPORTS ==========

export function canViewFullShopReports(userRole: UserRole): PermissionCheck {
  if (userRole === UserRole.ADMIN || userRole === UserRole.OWNER) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin and owner can view full shop reports' };
}

export function canViewOwnReports(userRole: UserRole): PermissionCheck {
  if (userRole === UserRole.STAFF || userRole === UserRole.CUSTOMER) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only staff and customer can view their own reports' };
}

export function canExportReports(userRole: UserRole): PermissionCheck {
  if (userRole === UserRole.ADMIN || userRole === UserRole.OWNER) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only admin and owner can export reports' };
}

// ========== LEDGER HISTORY ==========

export function canEditLedgerHistory(userRole: UserRole): PermissionCheck {
  // No one can edit ledger history, only add entries
  return { allowed: false, reason: 'Ledger history cannot be edited' };
}

export function canDeleteLedgerHistory(userRole: UserRole): PermissionCheck {
  // No one can delete ledger history
  return { allowed: false, reason: 'Ledger history cannot be deleted' };
}

// ========== VIEW PERMISSIONS ==========

export function canViewAllInvoices(userRole: UserRole): PermissionCheck {
  if (userRole === UserRole.OWNER || userRole === UserRole.ADMIN || userRole === UserRole.STAFF) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only owner, admin, and staff can view all invoices' };
}

export function canViewOwnInvoices(userRole: UserRole): PermissionCheck {
  if (userRole === UserRole.CUSTOMER) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only customers can view their own invoices' };
}

export function canViewAllDebts(userRole: UserRole): PermissionCheck {
  if (userRole === UserRole.OWNER || userRole === UserRole.ADMIN || userRole === UserRole.STAFF) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only owner, admin, and staff can view all debts' };
}

export function canViewOwnDebts(userRole: UserRole): PermissionCheck {
  if (userRole === UserRole.CUSTOMER) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Only customers can view their own debts' };
}

// ========== SHOP ACCESS CHECK ==========

export function checkShopAccess(
  userRole: UserRole | string,
  userShopId: string | null | undefined,
  targetShopId: string | null | undefined
): PermissionCheck {
  const role = normalizeRole(userRole);
  
  // Owner can access all shops
  if (role === UserRole.OWNER) {
    return { allowed: true };
  }

  // Admin and Staff must belong to the shop
  if (role === UserRole.ADMIN || role === UserRole.STAFF) {
    if (!userShopId || !targetShopId) {
      return { allowed: false, reason: 'User or target shop ID missing' };
    }
    if (userShopId === targetShopId) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'User does not belong to this shop' };
  }

  return { allowed: false, reason: 'Invalid role for shop access' };
}

