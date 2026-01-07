import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query } from '@/lib/db';
import { UserRole, TransactionType, InvoiceStatus } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const searchParams = req.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const takenType = (searchParams.get('takenType') || 'ALL').toUpperCase(); // ALL | DEEN | LA_BIXSHAY

    let invoiceWhereConditions: string[] = [];
    let invoiceParams: any[] = [];
    let debtWhereConditions: string[] = [];
    let debtParams: any[] = [];
    let customerWhereConditions: string[] = [];
    let customerParams: any[] = [];
    let itemWhereConditions: string[] = ['status = ?'];
    let itemParams: any[] = ['ACTIVE'];

    if (user.role === UserRole.ADMIN || user.role === UserRole.STAFF) {
      if (user.shopId) {
        invoiceWhereConditions.push('shop_id = ?');
        invoiceParams.push(user.shopId);
        debtWhereConditions.push('shop_id = ?');
        debtParams.push(user.shopId);
        customerWhereConditions.push('shop_id = ?');
        customerParams.push(user.shopId);
        itemWhereConditions.push('shop_id = ?');
        itemParams.push(user.shopId);
      }
    }

    if (startDate && endDate) {
      invoiceWhereConditions.push('created_at >= ?', 'created_at <= ?');
      invoiceParams.push(startDate, endDate);
      debtWhereConditions.push('created_at >= ?', 'created_at <= ?');
      debtParams.push(startDate, endDate);
    }

    // Invoice stats
    if (user.role === UserRole.CUSTOMER) {
      const customers = await query<any>(
        'SELECT id FROM customers WHERE user_id = ?',
        [user.id]
      );
      if (customers.length > 0) {
        invoiceWhereConditions.push('customer_id = ?');
        invoiceParams.push(customers[0].id);
        debtWhereConditions.push('customer_id = ?');
        debtParams.push(customers[0].id);
        customerWhereConditions.push('user_id = ?');
        customerParams.push(user.id);
      }
    }

    const invoiceWhereClause = invoiceWhereConditions.length > 0 
      ? `WHERE ${invoiceWhereConditions.join(' AND ')}` 
      : '';
    const debtWhereClause = debtWhereConditions.length > 0 
      ? `WHERE ${debtWhereConditions.join(' AND ')}` 
      : '';
    const customerWhereClause = customerWhereConditions.length > 0 
      ? `WHERE ${customerWhereConditions.join(' AND ')}` 
      : '';
    const itemWhereClause = itemWhereConditions.length > 0 
      ? `WHERE ${itemWhereConditions.join(' AND ')}` 
      : '';

    const [totalInvoicesResult] = await query<any>(
      `SELECT COUNT(*) as count FROM invoices ${invoiceWhereClause}`,
      invoiceParams
    );
    const totalInvoices = totalInvoicesResult.count;

    const pendingInvoiceParams = [...invoiceParams, InvoiceStatus.SUBMITTED];
    const [pendingInvoicesResult] = await query<any>(
      `SELECT COUNT(*) as count FROM invoices ${invoiceWhereClause} AND status = ?`,
      pendingInvoiceParams
    );
    const pendingInvoices = pendingInvoicesResult.count;

    const revenueParams = [...invoiceParams, InvoiceStatus.DELIVERED_CONFIRMED];
    const [totalRevenueResult] = await query<any>(
      `SELECT COALESCE(SUM(total_amount), 0) as sum FROM invoices ${invoiceWhereClause} AND status = ?`,
      revenueParams
    );
    const totalRevenue = totalRevenueResult.sum || 0;

    // Debt stats (DEEN vs LA_BIXSHAY)
    let totalDebt = 0;
    let totalPayments = 0;

    if (takenType === 'ALL' || takenType === 'DEEN') {
      const debtAddParams = [...debtParams, TransactionType.DEBT_ADD];
      const [totalDebtResult] = await query<any>(
        `SELECT COALESCE(SUM(amount), 0) as sum FROM debt_ledger ${debtWhereClause} AND transaction_type = ?`,
        debtAddParams
      );
      totalDebt = totalDebtResult.sum || 0;
    }

    if (takenType === 'ALL' || takenType === 'LA_BIXSHAY') {
      const paymentParams = [...debtParams, TransactionType.PAYMENT];
      const [totalPaymentsResult] = await query<any>(
        `SELECT COALESCE(SUM(amount), 0) as sum FROM debt_ledger ${debtWhereClause} AND transaction_type = ?`,
        paymentParams
      );
      totalPayments = totalPaymentsResult.sum || 0;
    }

    // Customer stats
    const [totalCustomersResult] = await query<any>(
      `SELECT COUNT(*) as count FROM customers ${customerWhereClause}`,
      customerParams
    );
    const totalCustomers = totalCustomersResult.count;

    // Item stats
    const [totalItemsResult] = await query<any>(
      `SELECT COUNT(*) as count FROM items ${itemWhereClause}`,
      itemParams
    );
    const totalItems = totalItemsResult.count;

    return NextResponse.json({
      totalInvoices,
      pendingInvoices,
      totalRevenue,
      totalDebt,
      totalPayments,
      outstandingDebt: totalDebt - totalPayments,
      totalCustomers,
      totalItems,
      takenType,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

