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

export default function AdminPanelPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'shop'>('overview');

  // Shop edit form state
  const [editingShop, setEditingShop] = useState(false);
  const [shopName, setShopName] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

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
      </div>
    </div>
  );
}

