'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Customer {
  id: string;
  phone: string;
  fullName: string;
}

interface ReportItem {
  id: string;
  item_name: string;
  detail: string | null;
  quantity: number;
  price: number;
  total: number;
  payment_type: string;
  taken_date: string | null;
  customerInfo: {
    fullName: string;
    phone: string;
  };
  staffInfo: {
    fullName: string;
    phone: string;
    role: string;
  };
}

export default function ReportsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [paymentType, setPaymentType] = useState<'ALL' | 'DEEN' | 'CASH'>('ALL');
  
  // Totals
  const [totalDeen, setTotalDeen] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    // Check auth
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (!data.user || data.user.accountType !== 'staff') {
          router.push('/login');
          return;
        }
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        router.push('/login');
      });
  }, [router]);

  useEffect(() => {
    if (user) {
      loadCustomers();
      loadItems();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadItems();
    }
  }, [startDate, endDate, selectedCustomer, paymentType]);

  const loadCustomers = async () => {
    try {
      const res = await fetch('/api/customers/dropdown', {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success && data.customers) {
        setCustomers(data.customers);
      }
    } catch (error) {
      console.error('Failed to load customers:', error);
    }
  };

  const loadItems = async () => {
    setLoadingItems(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (selectedCustomer) params.append('customerId', selectedCustomer);
      if (paymentType !== 'ALL') {
        params.append('takenType', paymentType);
      }

      const res = await fetch(`/api/items?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await res.json();
      
      if (data.items) {
        setItems(data.items);
        setTotalDeen(data.totalDeen || 0);
        setTotalPaid(data.totalPaid || 0);
        setBalance(data.balance || 0);
      }
    } catch (error) {
      console.error('Failed to load items:', error);
    } finally {
      setLoadingItems(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Reports</h1>
            <a
              href="/dashboard-staff"
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Filters Card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
              />
            </div>
            
            {/* Customer Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer
              </label>
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
              >
                <option value="">All Customers</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.phone}>
                    {customer.fullName} ({customer.phone})
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Type
              </label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as 'ALL' | 'DEEN' | 'CASH')}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
              >
                <option value="ALL">All</option>
                <option value="DEEN">DEEN (Credit)</option>
                <option value="CASH">CASH (Paid)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Total DEEN</h3>
            <p className="text-2xl font-bold text-gray-900">{totalDeen.toLocaleString()} SOS</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Total PAID</h3>
            <p className="text-2xl font-bold text-green-600">{totalPaid.toLocaleString()} SOS</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Balance</h3>
            <p className="text-2xl font-bold text-red-600">{balance.toLocaleString()} SOS</p>
          </div>
        </div>

        {/* Items Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Items Report</h2>
          </div>
          {loadingItems ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading items...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No items found for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Item Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Taken By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Recorded By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{item.item_name}</div>
                        {item.detail && (
                          <div className="text-sm text-gray-500">{item.detail}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.price.toLocaleString()} SOS
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.total.toLocaleString()} SOS
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            item.payment_type === 'DEEN'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {item.payment_type === 'DEEN' ? 'DEEN' : 'CASH'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.customerInfo.fullName} ({item.customerInfo.phone})
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.staffInfo.fullName} ({item.staffInfo.role}) - {item.staffInfo.phone}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.taken_date
                          ? (() => {
                              // Ensure date is in ISO format (YYYY-MM-DD)
                              const date = new Date(item.taken_date);
                              if (isNaN(date.getTime())) {
                                // If invalid, try parsing as string
                                const dateStr = String(item.taken_date).split('T')[0];
                                return dateStr || 'N/A';
                              }
                              return date.toISOString().split('T')[0];
                            })()
                          : (() => {
                              const date = new Date(item.created_at);
                              if (isNaN(date.getTime())) {
                                const dateStr = String(item.created_at).split('T')[0];
                                return dateStr || 'N/A';
                              }
                              return date.toISOString().split('T')[0];
                            })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
