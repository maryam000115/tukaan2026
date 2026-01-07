import { getPool } from './db';
import mysql from 'mysql2/promise';

// Helper for database transactions with error handling
export async function withTransaction<T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Invoice creation with items (transaction)
export async function createInvoiceWithItems(
  invoiceData: any,
  itemsData: any[]
) {
  return await withTransaction(async (connection) => {
    // Generate UUID for invoice
    const [uuidResult] = await connection.execute('SELECT UUID() as id');
    const invoiceId = (uuidResult as any[])[0].id;

    // Insert invoice
    await connection.execute(
      `INSERT INTO invoices (
        id, invoice_number, shop_id, customer_id, requested_month,
        status, subtotal, total_amount, paid_amount, remaining_debt,
        accepted_by, delivered_by, delivered_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        invoiceId,
        invoiceData.invoiceNumber,
        invoiceData.shopId,
        invoiceData.customerId,
        invoiceData.requestedMonth || null,
        invoiceData.status || 'DRAFT',
        invoiceData.subtotal || 0,
        invoiceData.totalAmount || 0,
        invoiceData.paidAmount || 0,
        invoiceData.remainingDebt || 0,
        invoiceData.acceptedBy || null,
        invoiceData.deliveredBy || null,
        invoiceData.deliveredAt || null,
      ]
    );

    // Insert invoice items
    if (itemsData && itemsData.length > 0) {
      for (const item of itemsData) {
        const [itemUuidResult] = await connection.execute('SELECT UUID() as id');
        const itemId = (itemUuidResult as any[])[0].id;

        await connection.execute(
          `INSERT INTO invoice_items (
            id, invoice_id, item_id, item_name_snapshot, quantity,
            unit_price_snapshot, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            invoiceId,
            item.itemId || null,
            item.itemNameSnapshot,
            item.quantity,
            item.unitPriceSnapshot,
            item.lineTotal,
          ]
        );
      }
    }

    // Fetch invoice with related data
    const [invoiceRows] = await connection.execute(
      `SELECT i.*, 
        c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
        u.id as user_id, u.first_name as user_first_name, u.last_name as user_last_name, u.phone as user_phone
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE i.id = ?`,
      [invoiceId]
    );

    const [itemsRows] = await connection.execute(
      'SELECT * FROM invoice_items WHERE invoice_id = ?',
      [invoiceId]
    );

    const invoice = (invoiceRows as any[])[0];

    return {
      ...invoice,
      items: itemsRows as any[],
      customer: {
        id: invoice.customer_id,
        name: invoice.customer_name,
        phone: invoice.customer_phone,
        user: {
          id: invoice.user_id,
          firstName: invoice.user_first_name,
          lastName: invoice.user_last_name,
          phone: invoice.user_phone,
        },
      },
    };
  });
}

// Delivery confirmation with debt ledger (transaction)
export async function confirmDeliveryWithDebt(
  invoiceId: string,
  invoiceUpdateData: any,
  debtData?: any
) {
  return await withTransaction(async (connection) => {
    // Update invoice
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    Object.keys(invoiceUpdateData).forEach(key => {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      updateFields.push(`${dbKey} = ?`);
      updateValues.push(invoiceUpdateData[key]);
    });

    updateFields.push('updated_at = NOW()');
    updateValues.push(invoiceId);

    await connection.execute(
      `UPDATE invoices SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Fetch updated invoice
    const [invoiceRows] = await connection.execute(
      'SELECT * FROM invoices WHERE id = ?',
      [invoiceId]
    );
    const invoice = (invoiceRows as any[])[0];

    // Create debt ledger entry if needed
    if (debtData && invoice.remaining_debt > 0) {
      const [uuidResult] = await connection.execute('SELECT UUID() as id');
      const debtId = (uuidResult as any[])[0].id;

      await connection.execute(
        `INSERT INTO debt_ledger (
          id, shop_id, customer_id, invoice_id, transaction_type,
          amount, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          debtId,
          debtData.shopId,
          debtData.customerId,
          debtData.invoiceId || null,
          debtData.transactionType,
          debtData.amount,
          debtData.notes || null,
          debtData.createdBy,
        ]
      );
    }

    return invoice;
  });
}

// Payment recording with balance update (transaction)
export async function recordPaymentWithUpdate(
  paymentData: any,
  invoiceId: string | null
) {
  return await withTransaction(async (connection) => {
    // Generate UUID for debt ledger entry
    const [uuidResult] = await connection.execute('SELECT UUID() as id');
    const debtId = (uuidResult as any[])[0].id;

    // Create debt ledger entry
    await connection.execute(
      `INSERT INTO debt_ledger (
        id, shop_id, customer_id, invoice_id, transaction_type,
        amount, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        debtId,
        paymentData.shop_id,
        paymentData.customer_id,
        paymentData.invoice_id || null,
        paymentData.transaction_type,
        paymentData.amount,
        paymentData.notes || null,
        paymentData.created_by,
      ]
    );

    // Update invoice if invoiceId provided
    if (invoiceId) {
      const [invoiceRows] = await connection.execute(
        'SELECT * FROM invoices WHERE id = ?',
        [invoiceId]
      );
      const invoice = (invoiceRows as any[])[0];

      if (invoice) {
        const newPaidAmount = (invoice.paid_amount || 0) + paymentData.amount;
        const newRemainingDebt = Math.max(0, invoice.total_amount - newPaidAmount);

        await connection.execute(
          `UPDATE invoices 
          SET paid_amount = ?, remaining_debt = ?, updated_at = NOW()
          WHERE id = ?`,
          [newPaidAmount, newRemainingDebt, invoiceId]
        );
      }
    }

    // Fetch created debt entry
    const [debtRows] = await connection.execute(
      'SELECT * FROM debt_ledger WHERE id = ?',
      [debtId]
    );

    return (debtRows as any[])[0];
  });
}

