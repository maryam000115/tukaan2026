'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Item {
  id: string;
  shopId: string;
  itemName: string;
  description: string | null;
  price: number;
  tag: string | null;
  status: string;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  quantity?: number | null;
  takenBy?: string | null;
  takenDate?: string | null;
  userId?: string | null;
  paymentType?: string | null;
  total?: number | null;
}

interface User {
  id: string;
  role: string;
  shopId?: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
}

export default function ItemsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // Filters
  const [takenType, setTakenType] = useState<'ALL' | 'DEEN' | 'LA_BIXSHAY'>('ALL');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Totals summary
  const [totalDeen, setTotalDeen] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const balance = totalDeen - totalPaid;
  
  // Form state for item transaction
  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [paymentType, setPaymentType] = useState<'DEEN' | 'LA_BIXSHAY'>('DEEN');

  // Role check: Admin and Staff can create items
  const canCreateItems = user?.role === 'admin' || user?.role === 'staff';
  
  // Staff can only use DEEN
  const canUsePaymentType = user?.role === 'admin';

  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.set('takenType', takenType);
    if (filterCustomerId) params.set('customerId', filterCustomerId);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return params.toString();
  };

  const loadItems = () => {
    const qs = buildQueryString();
    const url = qs ? `/api/items?${qs}` : '/api/items';

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.items) {
          setItems(data.items);
          if (data.totals) {
            setTotalDeen(data.totals.totalDeen || 0);
            setTotalPaid(data.totals.totalPaid || 0);
          } else {
            setTotalDeen(0);
            setTotalPaid(0);
          }
        } else {
          setError(data.error || 'Failed to load items');
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error:', err);
        setError('Failed to load items');
        setLoading(false);
      });
  };

  const loadCustomers = async () => {
    // Don't load if already loading
    if (loadingCustomers) {
      return;
    }
    
    // Check if user can create items
    if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
      return;
    }
    
    setLoadingCustomers(true);
    setCreateError(''); // Clear any previous errors
    
    try {
      const res = await fetch('/api/customers?status=ACTIVE');
      const data = await res.json();
      
      console.log('Customers API response:', data); // Debug log
      
      if (data.error) {
        console.error('Error loading customers:', data.error);
        setCreateError(`Failed to load customers: ${data.error}`);
        setCustomers([]);
      } else if (data.customers && Array.isArray(data.customers)) {
        setCustomers(data.customers);
        if (data.customers.length === 0) {
          // Don't show error in filter dropdown, only in create form
          console.warn('No active customers found for this shop');
        }
      } else {
        setCustomers([]);
        console.warn('Unexpected response format from customers API:', data);
      }
    } catch (err: any) {
      console.error('Error loading customers:', err);
      setCreateError('Failed to load customers. Please check your connection and try again.');
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    // Check authentication first
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) {
          router.push('/login');
          return;
        }
        setUser(data.user);
        // Fetch items
        loadItems();
        // Load customers if admin/staff (for both filter dropdown and create form)
        if (data.user.role === 'admin' || data.user.role === 'staff') {
          // Load customers in background
          loadCustomers();
        }
      })
      .catch((err) => {
        console.error('Error:', err);
        router.push('/login');
      });
  }, [router]);

  // Reload items when filters change
  useEffect(() => {
    if (!user) return;
    loadItems();
  }, [takenType, filterCustomerId, startDate, endDate]);

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');

    // Validation
    if (!itemName || !quantity || !price || !customerId) {
      setCreateError('All required fields must be filled');
      setCreating(false);
      return;
    }

    const qty = parseInt(quantity);
    const unitPrice = parseFloat(price);

    if (isNaN(qty) || qty <= 0) {
      setCreateError('Quantity must be greater than 0');
      setCreating(false);
      return;
    }

    if (isNaN(unitPrice) || unitPrice < 0) {
      setCreateError('Price must be 0 or greater');
      setCreating(false);
      return;
    }

    try {
      // Use item transaction endpoint
      const response = await fetch('/api/items/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName,
          description: description || null,
          quantity: qty,
          price: unitPrice,
          customerId,
          paymentType: user?.role === 'staff' ? 'DEEN' : paymentType, // Staff can only use DEEN
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Reset form
        setItemName('');
        setDescription('');
        setQuantity('');
        setPrice('');
        setCustomerId('');
        setPaymentType('DEEN');
        setShowCreateForm(false);
        // Reload items
        loadItems();
      } else {
        setCreateError(data.error || 'Failed to create item transaction');
      }
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create item transaction');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading items...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/dashboard" className="text-gray-600 hover:text-gray-900">
                ← Back
              </a>
              <h1 className="text-xl font-bold text-gray-900">Items</h1>
            </div>
            {canCreateItems && (
              <button
                onClick={() => {
                  setShowCreateForm(true);
                  // Load customers when opening the form
                  if (customers.length === 0 && !loadingCustomers) {
                    loadCustomers();
                  }
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                + Create Item
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Filters & Summary */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Taken Type
              </label>
              <select
                value={takenType}
                onChange={(e) => setTakenType(e.target.value as 'ALL' | 'DEEN' | 'LA_BIXSHAY')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              >
                <option value="ALL">All</option>
                <option value="DEEN">DEEN (Credit)</option>
                <option value="LA_BIXSHAY">LA BIXSHAY (Paid)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Customer
              </label>
              {customers.length > 0 ? (
                <select
                  value={filterCustomerId}
                  onChange={(e) => setFilterCustomerId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                >
                  <option value="">All customers</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-sm">
                  {loadingCustomers ? 'Loading customers...' : 'No customers available'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              />
            </div>
          </div>

          {/* Totals Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-gray-100 pt-4 mt-2 text-sm">
            <div>
              <p className="text-xs font-medium text-gray-500">Total DEEN</p>
              <p className="text-base font-semibold text-red-600">
                ${totalDeen.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Total PAID</p>
              <p className="text-base font-semibold text-green-600">
                ${totalPaid.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Balance</p>
              <p
                className={`text-base font-semibold ${
                  balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-gray-700'
                }`}
              >
                ${balance.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Create Item Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Create New Item</h2>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateError('');
                    setItemName('');
                    setDescription('');
                    setQuantity('');
                    setPrice('');
                    setCustomerId('');
                    setPaymentType('DEEN');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {createError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-red-800">{createError}</p>
                </div>
              )}

              {/* Show message if no customers and not loading */}
              {showCreateForm && customers.length === 0 && !loadingCustomers && canCreateItems && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800 mb-2">No customers loaded.</p>
                  <button
                    type="button"
                    onClick={() => loadCustomers()}
                    className="text-sm text-green-600 hover:text-green-700 underline font-medium"
                  >
                    Click to Load Customers
                  </button>
                </div>
              )}

              <form onSubmit={handleCreateItem} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Item Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="e.g., Cement 50kg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Customer (Macmiil) <span className="text-red-500">*</span>
                  </label>
                  {loadingCustomers ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                      Loading customers...
                    </div>
                  ) : customers.length > 0 ? (
                    <select
                      value={customerId}
                      onChange={(e) => {
                        setCustomerId(e.target.value);
                        setCreateError(''); // Clear error when customer is selected
                      }}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">-- Select Customer --</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name} ({customer.phone})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full">
                      <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 mb-2">
                        {createError ? createError : 'No customers available'}
                      </div>
                      {createError && !createError.includes('No active customers') && (
                        <button
                          type="button"
                          onClick={() => loadCustomers()}
                          className="text-sm text-green-600 hover:text-green-700 underline font-medium"
                        >
                          👉 Retry
                        </button>
                      )}
                      {!createError && (
                        <button
                          type="button"
                          onClick={() => loadCustomers()}
                          className="text-sm text-green-600 hover:text-green-700 underline font-medium"
                        >
                          Click to Load Customers
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Price <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as 'DEEN' | 'LA_BIXSHAY')}
                    required
                    disabled={!canUsePaymentType}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="DEEN">DEEN (Credit)</option>
                    {canUsePaymentType && <option value="LA_BIXSHAY">LA BIXSHAY (Paid)</option>}
                  </select>
                  {!canUsePaymentType && (
                    <p className="mt-1 text-xs text-gray-500">Staff can only record DEEN transactions</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Optional description"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setCreateError('');
                      setItemName('');
                      setDescription('');
                      setQuantity('');
                      setPrice('');
                      setCustomerId('');
                      setPaymentType('DEEN');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !customerId}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creating ? 'Creating...' : 'Create Item'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {items.length === 0 && !error && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">
              {takenType === 'DEEN'
                ? 'No DEEN items found.'
                : takenType === 'LA_BIXSHAY'
                ? 'No paid items found.'
                : 'No items found.'}
            </p>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {item.itemName}
                    </h3>
                    {item.description && (
                      <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                    )}
                    {item.tag && (
                      <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded mr-2">
                        {item.tag}
                      </span>
                    )}
                    <span className={`inline-block text-xs px-2 py-1 rounded ${
                      item.status === 'ACTIVE' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">
                      ${item.price.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-200">
                  <div>
                    <span className="text-xs font-medium text-gray-500">Price:</span>
                    <span className="ml-2 text-sm text-gray-900">
                      ${typeof item.price === 'number' ? item.price.toFixed(2) : item.price}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500">Status:</span>
                    <span className="ml-2 text-sm text-gray-900">{item.status}</span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500">Created:</span>
                    <span className="ml-2 text-sm text-gray-900">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {item.updatedAt && (
                    <div>
                      <span className="text-xs font-medium text-gray-500">Updated:</span>
                      <span className="ml-2 text-sm text-gray-900">
                        {new Date(item.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

