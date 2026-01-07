// Validation utilities for frontend and backend

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

// Auth/User validations
// Phone validation: EXACTLY 9 digits, no leading 0, numbers only
export function validatePhone(phone: string): string | null {
  if (!phone) {
    return 'Phone number is required';
  }
  
  // Remove all non-digit characters
  const numericPhone = phone.replace(/\D/g, '');
  
  // Must be exactly 9 digits
  if (numericPhone.length !== 9) {
    return 'Phone number must be exactly 9 digits';
  }
  
  // Must contain only digits (already checked by replace, but double-check)
  if (!/^\d+$/.test(numericPhone)) {
    return 'Phone number must contain only digits (0-9)';
  }
  
  // Cannot start with 0
  if (numericPhone.startsWith('0')) {
    return 'Phone number cannot start with 0';
  }
  
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) {
    return 'Password is required';
  }
  if (password.length < 6) {
    return 'Password must be at least 6 characters';
  }
  return null;
}

export function validateRole(role: string): string | null {
  // Support lowercase roles: owner, admin, staff, customer
  const validRoles = ['owner', 'admin', 'staff', 'customer', 'OWNER', 'ADMIN', 'STAFF', 'CUSTOMER'];
  if (!role) {
    return 'Role is required';
  }
  const normalizedRole = role.toLowerCase();
  if (!['owner', 'admin', 'staff', 'customer'].includes(normalizedRole)) {
    return 'Role must be one of: owner, admin, staff, customer';
  }
  return null;
}

export function validateEmail(email: string | null | undefined): string | null {
  if (!email) return null; // Email is optional
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Invalid email format';
  }
  return null;
}

// Item validations
export function validateItemName(itemName: string): string | null {
  if (!itemName || itemName.trim().length === 0) {
    return 'Item name is required';
  }
  if (itemName.trim().length < 2) {
    return 'Item name must be at least 2 characters';
  }
  return null;
}

export function validatePrice(price: number | string): string | null {
  if (price === undefined || price === null || price === '') {
    return 'Price is required';
  }
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numPrice)) {
    return 'Price must be a number';
  }
  if (numPrice < 0) {
    return 'Price must be greater than or equal to 0';
  }
  return null;
}

export function validateQuantity(quantity: number | string): string | null {
  if (quantity === undefined || quantity === null || quantity === '') {
    return 'Quantity is required';
  }
  const numQty = typeof quantity === 'string' ? parseInt(quantity, 10) : quantity;
  if (isNaN(numQty)) {
    return 'Quantity must be a number';
  }
  if (numQty < 1) {
    return 'Quantity must be at least 1';
  }
  return null;
}

// Customer validations
export function validateCustomerName(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return 'Customer name is required';
  }
  if (name.trim().length < 2) {
    return 'Customer name must be at least 2 characters';
  }
  return null;
}

// Invoice validations
export function validateInvoiceItems(items: any[]): string | null {
  if (!items || !Array.isArray(items)) {
    return 'Invoice items are required';
  }
  if (items.length === 0) {
    return 'Invoice must contain at least one item';
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.itemId) {
      return `Item ${i + 1}: Item ID is required`;
    }
    const qtyError = validateQuantity(item.quantity);
    if (qtyError) {
      return `Item ${i + 1}: ${qtyError}`;
    }
  }
  return null;
}

// Debt/Payment validations
export function validatePaymentAmount(amount: number | string): string | null {
  if (amount === undefined || amount === null || amount === '') {
    return 'Payment amount is required';
  }
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numAmount)) {
    return 'Payment amount must be a number';
  }
  if (numAmount <= 0) {
    return 'Payment amount must be greater than 0';
  }
  return null;
}

// Generic validation helper
export function validateFields(
  data: Record<string, any>,
  rules: Record<string, (value: any) => string | null>
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const [field, validator] of Object.entries(rules)) {
    const error = validator(data[field]);
    if (error) {
      errors[field] = error;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// Format validation error response
export function formatValidationError(errors: Record<string, string>) {
  return {
    success: false,
    message: 'Validation failed',
    errors,
  };
}

