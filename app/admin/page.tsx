'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  shopId?: string;
  shopName?: string;
  shopLocation?: string;
}

interface Shop {
  id: string;
  shopName: string;
  location: string;
  status: string;
  admin: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
}

interface StaffUser {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  phone: string;
  role: string;
  status: string;
  shopId?: string;
}

interface CustomerUser {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  phone: string;
  status: string;
  shopId?: string;
}

export default function AdminPanelPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'shop' | 'staff' | 'customers'>('overview');

  // Shop edit form state
  const [editingShop, setEditingShop] = useState(false);
  const [shopName, setShopName] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [customers, setCustomers] = useState<CustomerUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) {
          router.push('/login');
          return;
        }
        const userData = data.user;
        setUser(userData);
        
        // Check if user is Admin or Owner (lowercase role from API)
        if (userData.role !== 'admin' && userData.role !== 'owner') {
          router.push('/dashboard');
          return;
        }

        // Load shop data if Admin
        if (userData.role === 'admin' && userData.shopId) {
          loadShop(userData.shopId);
        } else if (userData.role === 'owner') {
          loadShops();
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        router.push('/login');
      });
  }, [router]);

  const loadShop = async (shopId: string) => {
    try {
      const response = await fetch('/api/shops');
      const data = await response.json();
      if (data.shops && data.shops.length > 0) {
        const shopData = data.shops.find((s: Shop) => s.id === shopId);
        if (shopData) {
          setShop(shopData);
          setShopName(shopData.shopName);
          setLocation(shopData.location);
        }
      }
      setLoading(false);
    } catch (err) {
      console.error('Error loading shop:', err);
      setError('Failed to load shop information');
      setLoading(false);
    }
  };

  const loadShops = async () => {
    try {
      const response = await fetch('/api/shops');
      const data = await response.json();
      if (data.shops && data.shops.length > 0) {
        setShop(data.shops[0]); // Owner can see all shops, show first one
      }
      setLoading(false);
    } catch (err) {
      console.error('Error loading shops:', err);
      setError('Failed to load shops');
      setLoading(false);
    }
  };

  const loadStaff = async () => {
    setLoadingStaff(true);
    try {
      const res = await fetch('/api/staff', { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.staff) {
        setStaff(data.staff);
      }
    } catch (err) {
      console.error('Error loading staff:', err);
      setError('Failed to load staff');
    } finally {
      setLoadingStaff(false);
    }
  };

  const loadCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const res = await fetch('/api/customers', { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.customers) {
        setCustomers(data.customers);
      }
    } catch (err) {
      console.error('Error loading customers:', err);
      setError('Failed to load customers');
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleSuspendStaff = async (staffId: string) => {
    if (!confirm('Are you sure you want to suspend this staff member?')) return;
    
    try {
      const res = await fetch(`/api/staff/${staffId}/suspend`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setError('');
        loadStaff();
      } else {
        setError(data.error || 'Failed to suspend staff');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to suspend staff');
    }
  };

  const handleActivateStaff = async (staffId: string) => {
    try {
      const res = await fetch(`/api/staff/${staffId}/activate`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setError('');
        loadStaff();
      } else {
        setError(data.error || 'Failed to activate staff');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to activate staff');
    }
  };

  const handleSuspendCustomer = async (customerId: string) => {
    if (!confirm('Are you sure you want to suspend this customer?')) return;
    
    try {
      const res = await fetch(`/api/users/${customerId}/suspend`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setError('');
        loadCustomers();
      } else {
        setError(data.error || 'Failed to suspend customer');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to suspend customer');
    }
  };

  const handleActivateCustomer = async (customerId: string) => {
    try {
      const res = await fetch(`/api/users/${customerId}/activate`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setError('');
        loadCustomers();
      } else {
        setError(data.error || 'Failed to activate customer');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to activate customer');
    }
  };

  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop) return;

    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/shops/${shop.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName,
          location,
        }),
      });

      const data = await response.json();

      if (data.success || data.shop) {
        setShop({ ...shop, shopName, location });
        setEditingShop(false);
      } else {
        setError(data.error || 'Failed to update shop');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update shop');
    } finally {
      setSaving(false);
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

  if (!user || (user.role !== 'admin' && user.role !== 'owner')) {
    return null;
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
              <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-3 border-b-2 font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Overview
            </button>
            {user.role === 'admin' && (
              <>
                <button
                  onClick={() => setActiveTab('shop')}
                  className={`px-4 py-3 border-b-2 font-medium transition-colors ${
                    activeTab === 'shop'
                      ? 'border-green-600 text-green-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Manage Your Shop
                </button>
                <button
                  onClick={() => {
                    setActiveTab('staff');
                    loadStaff();
                  }}
                  className={`px-4 py-3 border-b-2 font-medium transition-colors ${
                    activeTab === 'staff'
                      ? 'border-green-600 text-green-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Manage Staff
                </button>
                <button
                  onClick={() => {
                    setActiveTab('customers');
                    loadCustomers();
                  }}
                  className={`px-4 py-3 border-b-2 font-medium transition-colors ${
                    activeTab === 'customers'
                      ? 'border-green-600 text-green-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Manage Customers
                </button>
              </>
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

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Admin Information</h2>
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-gray-500">Name:</span>
                  <span className="ml-2 text-gray-900">
                    {user.firstName} {user.lastName}
                  </span>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500">Phone:</span>
                  <span className="ml-2 text-gray-900">{user.phone}</span>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500">Role:</span>
                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {user.role === 'admin' ? 'Shop Owner (Admin)' : 'Super Admin (Owner)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <a
                href="/items"
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage Items</h3>
                <p className="text-sm text-gray-600">View and create items</p>
              </a>

              <a
                href="/customers"
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage Customers</h3>
                <p className="text-sm text-gray-600">View and manage customers</p>
              </a>

              <a
                href="/invoices"
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage Invoices</h3>
                <p className="text-sm text-gray-600">View and process invoices</p>
              </a>

              <a
                href="/debts"
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">View Debts</h3>
                <p className="text-sm text-gray-600">Track customer debts</p>
              </a>

              <a
                href="/reports"
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">View Reports</h3>
                <p className="text-sm text-gray-600">Shop analytics and reports</p>
              </a>

              {user.role === 'admin' && (
                <a
                  href="/api/users"
                  className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage Staff</h3>
                  <p className="text-sm text-gray-600">Add and manage staff accounts</p>
                </a>
              )}
            </div>
          </div>
        )}

        {activeTab === 'shop' && shop && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Manage Your Shop</h2>
              {!editingShop && (
                <button
                  onClick={() => setEditingShop(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Edit Shop
                </button>
              )}
            </div>

            {editingShop ? (
              <form onSubmit={handleSaveShop} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Shop Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingShop(false);
                      setShopName(shop.shopName);
                      setLocation(shop.location);
                      setError('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div>
                  <span className="text-sm font-medium text-gray-500">Shop Name:</span>
                  <p className="mt-1 text-gray-900 text-lg">{shop.shopName}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500">Location:</span>
                  <p className="mt-1 text-gray-900">{shop.location}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500">Status:</span>
                  <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    shop.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {shop.status}
                  </span>
                </div>
                {shop.admin && (
                  <div>
                    <span className="text-sm font-medium text-gray-500">Admin:</span>
                    <p className="mt-1 text-gray-900">
                      {shop.admin.firstName} {shop.admin.lastName} ({shop.admin.phone})
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Manage Staff</h2>
              {loadingStaff ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading staff...</p>
                </div>
              ) : staff.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No staff members found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Phone
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {staff.map((member) => (
                        <tr key={member.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {member.firstName} {member.middleName} {member.lastName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {member.phone}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {member.role}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                member.status === 'ACTIVE'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {member.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            {member.status === 'ACTIVE' ? (
                              <button
                                onClick={() => handleSuspendStaff(member.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Suspend
                              </button>
                            ) : (
                              <button
                                onClick={() => handleActivateStaff(member.id)}
                                className="text-green-600 hover:text-green-900"
                              >
                                Activate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Manage Customers</h2>
              {loadingCustomers ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading customers...</p>
                </div>
              ) : customers.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No customers found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Phone
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {customers.map((customer) => (
                        <tr key={customer.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {customer.firstName} {customer.middleName} {customer.lastName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {customer.phone}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                customer.status === 'ACTIVE'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {customer.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            {customer.status === 'ACTIVE' ? (
                              <button
                                onClick={() => handleSuspendCustomer(customer.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Suspend
                              </button>
                            ) : (
                              <button
                                onClick={() => handleActivateCustomer(customer.id)}
                                className="text-green-600 hover:text-green-900"
                              >
                                Activate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

