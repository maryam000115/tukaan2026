import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query, queryOne } from '@/lib/db';
import { UserRole, TransactionType } from '@/lib/types';
import { createAuditLog } from '@/lib/audit';
import { canCreateItems } from '@/lib/permissions';

interface ItemTransactionBody {
  itemName: string;
  description?: string | null; // Optional
  quantity: number; // Required, > 0
  price: number; // Required, >= 0
  customerId: string; // Required - taken_by (macmiil)
  paymentType?: 'DEEN' | 'LA_BIXSHAY'; // Optional, defaults to DEEN for Staff
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const userRole = user.role as UserRole;

    // Only ADMIN and STAFF can record item transactions
    const permission = canCreateItems(userRole);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || 'Forbidden' },
        { status: 403 }
      );
    }

    const shopId = user.shopId || user.tukaanId;
    if (!shopId) {
      return NextResponse.json(
        { error: 'You must be associated with a shop' },
        { status: 400 }
      );
    }

    const body = (await req.json()) as ItemTransactionBody;
    const { itemName, description, quantity, price, customerId, paymentType } =
      body;

    // Required field validation
    if (!itemName || !customerId || quantity === undefined || price === undefined) {
      return NextResponse.json(
        {
          error: 'itemName, customerId, quantity, and price are required',
        },
        { status: 400 }
      );
    }

    const qty = Number(quantity);
    const unitPrice = Number(price);

    // Quantity validation: must be > 0
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json(
        { error: 'Quantity must be a positive number greater than 0' },
        { status: 400 }
      );
    }

    // Price validation: must be >= 0
    if (isNaN(unitPrice) || unitPrice < 0) {
      return NextResponse.json(
        { error: 'Price must be a number greater than or equal to 0' },
        { status: 400 }
      );
    }

    // Determine payment type: Staff defaults to DEEN, Admin can choose
    let finalPaymentType: 'DEEN' | 'LA_BIXSHAY' = paymentType || 'DEEN';
    
    // Staff can only record DEEN (credit) transactions
    if (userRole === UserRole.STAFF && finalPaymentType !== 'DEEN') {
      return NextResponse.json(
        { error: 'Staff can only record DEEN (credit) transactions' },
        { status: 403 }
      );
    }

    // Admin can use both DEEN and LA_BIXSHAY
    if (userRole === UserRole.ADMIN && finalPaymentType && !['DEEN', 'LA_BIXSHAY'].includes(finalPaymentType)) {
      return NextResponse.json(
        { error: 'paymentType must be DEEN or LA_BIXSHAY' },
        { status: 400 }
      );
    }

    // Verify customer exists in users table and belongs to the same shop
    // customerId can be either user.id or user.phone
    let customerData: { id: string; phone: string; shopId: string | null } | null = null;
    
    try {
      // Try to find customer by ID first
      const customersById = await query<{
        id: string;
        phone: string;
        shopId: string | null;
      }>(
        `SELECT id, phone, shop_id as shopId 
         FROM users 
         WHERE id = ? AND (user_type = 'customer' OR user_type = 'normal')`,
        [customerId]
      );
      
      if (customersById.length > 0) {
        customerData = customersById[0];
      } else {
        // Try to find by phone (customerId might be a phone number)
        const customersByPhone = await query<{
          id: string;
          phone: string;
          shopId: string | null;
        }>(
          `SELECT id, phone, shop_id as shopId 
           FROM users 
           WHERE phone = ? AND (user_type = 'customer' OR user_type = 'normal')`,
          [customerId]
        );
        
        if (customersByPhone.length > 0) {
          customerData = customersByPhone[0];
        }
      }
    } catch (error: any) {
      console.error('Customer verification error:', error);
      return NextResponse.json(
        { error: 'Failed to verify customer' },
        { status: 500 }
      );
    }

    if (!customerData) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Verify customer belongs to the same shop
    if (shopId && customerData.shopId && customerData.shopId !== shopId) {
      return NextResponse.json(
        { error: 'Customer does not belong to your shop' },
        { status: 403 }
      );
    }

    const totalAmount = qty * unitPrice;

    // Generate UUID for item record
    const [itemUuidRow] = await query<{ id: string }>(
      'SELECT UUID() as id',
      []
    );
    const itemId = itemUuidRow.id;

    // Use customer phone for customer_phone_taken_by
    const customerPhone = customerData.phone;

    // Insert into items table using actual schema: customer_phone_taken_by, shop_id, staff_id
    try {
      await query(
        `INSERT INTO items (
          id, item_name, detail, quantity, price,
          customer_phone_taken_by, taken_date, staff_id, shop_id, payment_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, NOW())`,
        [
          itemId,
          itemName,
          description || null,
          qty,
          unitPrice,
          customerPhone, // customer_phone_taken_by (from users.phone)
          user.id, // staff_id = staff/admin who recorded
          shopId, // shop_id
          finalPaymentType, // payment_type
        ]
      );
    } catch (error: any) {
      // If insert fails, log error and rethrow
      console.error('Item transaction insert error:', error);
      throw error;
    }

    // Record in debt_ledger based on payment type (optional - skip if table doesn't exist)
    let debtRecorded = false;
    try {
      const [debtUuidRow] = await query<{ id: string }>(
        'SELECT UUID() as id',
        []
      );
      const debtId = debtUuidRow.id;

      let transactionType: TransactionType;
      let notes: string;
      let status: string;

      if (finalPaymentType === 'DEEN') {
        transactionType = TransactionType.DEBT_ADD;
        status = 'UNPAID'; // DEEN transactions are unpaid/credit
        notes = `DEEN item transaction: ${itemName} x${qty} @ ${unitPrice}`;
      } else {
        // CASH (paid immediately)
        transactionType = TransactionType.PAYMENT;
        status = 'PAID';
        notes = `CASH item transaction: ${itemName} x${qty} @ ${unitPrice}`;
      }

      await query(
        `INSERT INTO debt_ledger (
          id, shop_id, customer_id, invoice_id, transaction_type,
          amount, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          debtId,
          shopId,
          customerData.id, // Use customerData.id from users table
          null,
          transactionType,
          totalAmount,
          notes,
          user.id,
        ]
      );
      debtRecorded = true;
    } catch (debtError: any) {
      // If debt_ledger table doesn't exist, log but don't fail the transaction
      if (
        debtError.code === 'ER_NO_SUCH_TABLE' ||
        debtError.message?.includes('debt_ledger')
      ) {
        console.warn('debt_ledger table not found - skipping debt recording. Item created successfully.');
        debtRecorded = false;
      } else {
        // Other errors should be logged but not fail the item creation
        console.error('Error recording debt ledger (non-fatal):', debtError);
        debtRecorded = false;
      }
    }

    // Audit log (optional - skip if table doesn't exist)
    try {
      await createAuditLog(
        user.id,
        'ITEM_TRANSACTION_RECORDED',
        'ITEM',
        itemId,
        {
          customerId: customerData.id,
          customerPhone: customerPhone,
          quantity: qty,
          price: unitPrice,
          totalAmount,
          paymentType: finalPaymentType,
          debtRecorded,
        },
        req.headers.get('x-forwarded-for') || undefined,
        req.headers.get('user-agent') || undefined
      );
    } catch (auditError: any) {
      // Audit log failures are non-fatal
      console.warn('Audit log failed (non-fatal):', auditError);
    }

    return NextResponse.json(
      {
        success: true,
        itemTransaction: {
          id: itemId,
          itemName,
          description: description || null,
          quantity: qty,
          price: unitPrice,
          totalAmount,
          customerId: customerData.id,
          customerPhone: customerPhone,
          takenBy: customerPhone, // customer phone (macmiil) who took the item
          recordedBy: user.id, // staff/admin who recorded it
          shopId, // staff/admin's shop
          paymentType: finalPaymentType,
          status, // UNPAID for DEEN, PAID for LA_BIXSHAY
          transactionType,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Item transaction error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to record item transaction',
        details:
          process.env.NODE_ENV === 'development'
            ? error.message || String(error)
            : undefined,
      },
      { status: 500 }
    );
  }
}


