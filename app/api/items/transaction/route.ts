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

    // Verify customer exists and belongs to the same shop
    // Verify customer exists and belongs to the same shop
    let customers: { id: string; shopId: string | null }[] = [];
    try {
      customers = await query<{
        id: string;
        shopId: string | null;
      }>(
        'SELECT id, shop_id as shopId FROM customers WHERE id = ?',
        [customerId]
      );
    } catch (error: any) {
      // If customers table or shop_id column doesn't exist, fall back to tukaan_users
      if (
        error.code === 'ER_NO_SUCH_TABLE' ||
        error.code === 'ER_BAD_FIELD_ERROR' ||
        error.message?.includes('customers') ||
        error.message?.includes('shop_id')
      ) {
        const legacyCustomers = await query<{
          id: string;
          shopId: string | null;
        }>(
          'SELECT id, tukaan_id as shopId FROM tukaan_users WHERE id = ?',
          [customerId]
        );
        customers = legacyCustomers;
      } else {
        console.error('Customer verification error:', error);
        throw error;
      }
    }

    if (
      customers.length === 0 ||
      (shopId && customers[0].shopId && customers[0].shopId !== shopId)
    ) {
      return NextResponse.json(
        { error: 'Customer not found or does not belong to your shop' },
        { status: 404 }
      );
    }

    const totalAmount = qty * unitPrice;

    // Generate UUID for item record
    const [itemUuidRow] = await query<{ id: string }>(
      'SELECT UUID() as id',
      []
    );
    const itemId = itemUuidRow.id;

    // Get customer phone for customer_phone_taken_by
    let customerPhone: string | null = null;
    try {
      const customerData = await queryOne<{ phone: string }>(
        'SELECT phone FROM customers WHERE id = ?',
        [customerId]
      );
      if (customerData) {
        customerPhone = customerData.phone;
      }
    } catch (error: any) {
      // If customers table doesn't exist or query fails, try to use customerId as phone
      console.warn('Could not fetch customer phone, using customerId:', error);
      customerPhone = customerId;
    }

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
          customerPhone || customerId, // customer_phone_taken_by
          user.id, // staff_id = staff/admin who recorded
          shopId, // shop_id
          finalPaymentType, // payment_type
        ]
      );
    } catch (error: any) {
      // If customer_phone_taken_by doesn't exist, try with taken_by
      if (
        error.code === 'ER_BAD_FIELD_ERROR' ||
        error.message?.includes('customer_phone_taken_by') ||
        error.message?.includes('staff_id')
      ) {
        try {
          // Fallback to legacy schema with taken_by and user_id
          await query(
            `INSERT INTO items (
              id, item_name, detail, quantity, price,
              taken_by, taken_date, user_id, shop_id, payment_type, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, NOW())`,
            [
              itemId,
              itemName,
              description || null,
              qty,
              unitPrice,
              customerId, // taken_by = customer ID
              user.id, // user_id = staff/admin who recorded
              shopId, // shop_id
              finalPaymentType, // payment_type
            ]
          );
        } catch (legacyError: any) {
          // If that also fails, try minimal schema
          await query(
            `INSERT INTO items (
              id, item_name, detail, quantity, price, created_at
            ) VALUES (?, ?, ?, ?, ?, NOW())`,
            [
              itemId,
              itemName,
              description || null,
              qty,
              unitPrice,
            ]
          );
        }
      } else {
        console.error('Item transaction insert error:', error);
        throw error;
      }
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
        // LA_BIXSHAY (paid immediately)
        transactionType = TransactionType.PAYMENT;
        status = 'PAID';
        notes = `LA BIXSHAY item transaction: ${itemName} x${qty} @ ${unitPrice}`;
      }

      await query(
        `INSERT INTO debt_ledger (
          id, shop_id, customer_id, invoice_id, transaction_type,
          amount, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          debtId,
          shopId,
          customerId,
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
          customerId,
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
          customerId,
          takenBy: customerId, // customer (macmiil) who took the item
          recordedBy: user.id, // staff/admin who recorded it
          shopId, // staff/admin's tukaan
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


