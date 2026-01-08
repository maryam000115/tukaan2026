/**
 * Optimized SQL query for fetching items with proper joins
 * Every item is TAKEN BY a CUSTOMER and RECORDED BY a STAFF
 */

export interface ItemQueryResult {
  // Item fields
  id: string;
  item_name: string;
  detail: string | null;
  quantity: number;
  price: number;
  payment_type: string | null;
  taken_date: string | null;
  staff_id: string;
  customer_phone_taken_by: string;
  shop_id: string;
  created_at: Date;
  
  // Shop fields (from tukaans)
  shop_tukaan_code: string | null;
  shop_name: string | null;
  shop_location: string | null;
  shop_phone: string | null;
  
  // Staff fields (who recorded the item)
  recorded_by_staff_id: string;
  recorded_by_staff_first_name: string | null;
  recorded_by_staff_middle_name: string | null;
  recorded_by_staff_last_name: string | null;
  recorded_by_staff_phone: string | null;
  recorded_by_staff_role: string | null;
  
  // Customer fields (who took the item)
  taken_by_customer_id: string;
  taken_by_customer_first_name: string | null;
  taken_by_customer_middle_name: string | null;
  taken_by_customer_last_name: string | null;
  taken_by_customer_phone: string;
  customer_user_type: string | null;
}

/**
 * Build optimized SQL query for items with all joins
 * @param shopId - Optional shop_id filter
 * @param additionalWhere - Additional WHERE conditions (without WHERE keyword)
 * @returns SQL query string and parameters array
 */
export function buildItemsQuery(
  shopId?: string | null,
  additionalWhere: string[] = []
): { sql: string; params: any[] } {
  const whereConditions: string[] = [];
  const params: any[] = [];

  // Filter by shop_id if provided
  if (shopId) {
    whereConditions.push('i.shop_id = ?');
    params.push(shopId);
  }

  // Add additional WHERE conditions
  whereConditions.push(...additionalWhere);

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  const sql = `
    SELECT 
      -- Item fields
      i.id,
      i.item_name,
      i.detail,
      i.quantity,
      i.price,
      i.payment_type,
      i.taken_date,
      i.staff_id,
      i.customer_phone_taken_by,
      i.shop_id,
      i.created_at,
      
      -- Shop fields (from tukaans)
      t.tukaan_code AS shop_tukaan_code,
      t.name AS shop_name,
      t.location AS shop_location,
      t.phone AS shop_phone,
      
      -- Staff fields (who recorded the item)
      s.id AS recorded_by_staff_id,
      s.first_name AS recorded_by_staff_first_name,
      s.middle_name AS recorded_by_staff_middle_name,
      s.last_name AS recorded_by_staff_last_name,
      s.phone AS recorded_by_staff_phone,
      s.role AS recorded_by_staff_role,
      
      -- Customer fields (who took the item)
      u.id AS taken_by_customer_id,
      u.first_name AS taken_by_customer_first_name,
      u.middle_name AS taken_by_customer_middle_name,
      u.last_name AS taken_by_customer_last_name,
      u.phone AS taken_by_customer_phone,
      u.user_type AS customer_user_type
      
    FROM items i
    
    -- Join shop (tukaans) - required
    LEFT JOIN tukaans t ON i.shop_id = t.id
    
    -- Join staff_users (who recorded the item) - INNER JOIN since staff_id is NOT NULL
    INNER JOIN staff_users s ON i.staff_id = s.id 
      AND s.shop_id = i.shop_id
    
    -- Join users (customer who took the item) - INNER JOIN since customer_phone_taken_by is NOT NULL
    INNER JOIN users u ON i.customer_phone_taken_by = u.phone 
      AND (u.user_type = 'customer' OR u.user_type = 'normal')
      AND u.shop_id = i.shop_id
    
    ${whereClause}
    
    ORDER BY i.created_at DESC
  `;

  return { sql, params };
}

/**
 * Helper to add filters for payment type, customer phone, and date range
 */
export function addItemFilters(
  baseWhere: string[],
  baseParams: any[],
  filters: {
    paymentType?: 'DEEN' | 'CASH' | 'LA_BIXSHAY' | 'ALL';
    customerPhone?: string;
    startDate?: string;
    endDate?: string;
  }
): { where: string[]; params: any[] } {
  const where = [...baseWhere];
  const params = [...baseParams];

  // Filter by payment type
  if (filters.paymentType && filters.paymentType !== 'ALL') {
    if (filters.paymentType === 'DEEN') {
      where.push("(i.payment_type = 'DEEN' OR i.payment_type IS NULL)");
    } else if (filters.paymentType === 'CASH') {
      // CASH includes CASH, LA_BIXSHAY, and PAID
      where.push("(i.payment_type = 'CASH' OR i.payment_type = 'LA_BIXSHAY' OR i.payment_type = 'PAID')");
    } else if (filters.paymentType === 'LA_BIXSHAY') {
      where.push("(i.payment_type = 'LA_BIXSHAY' OR i.payment_type = 'CASH' OR i.payment_type = 'PAID')");
    }
  }

  // Filter by customer phone
  if (filters.customerPhone) {
    where.push('i.customer_phone_taken_by = ?');
    params.push(filters.customerPhone);
  }

  // Filter by date range
  if (filters.startDate && filters.endDate) {
    where.push('DATE(i.taken_date) >= ?');
    where.push('DATE(i.taken_date) <= ?');
    params.push(filters.startDate, filters.endDate);
  }

  return { where, params };
}

