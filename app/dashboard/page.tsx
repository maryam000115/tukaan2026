'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: number;
  firstName: string;
  middleName?: string;
  lastName: string;
  phone: string;
  role: 'owner' | 'admin' | 'staff' | 'customer';
  shopName?: string;
  shopLocation?: string;
  tukaanId?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) {
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

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      owner: 'Super Admin (Owner)',
      admin: 'Shop Owner (Admin)',
      staff: 'Staff',
      customer: 'Customer',
    };
    return labels[role] || role;
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

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Tukaanle Dashboard</h1>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* User Info Card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">User Information</h2>
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium text-gray-500">Name:</span>
              <span className="ml-2 text-gray-900">
                {user.firstName} {user.middleName} {user.lastName}
              </span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Phone:</span>
              <span className="ml-2 text-gray-900">{user.phone}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Role:</span>
              <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                {getRoleLabel(user.role)}
              </span>
            </div>
            {user.shopName && (
              <div>
                <span className="text-sm font-medium text-gray-500">Shop:</span>
                <span className="ml-2 text-gray-900">{user.shopName}</span>
              </div>
            )}
            {user.shopLocation && (
              <div>
                <span className="text-sm font-medium text-gray-500">Shop Location:</span>
                <span className="ml-2 text-gray-900">{user.shopLocation}</span>
              </div>
            )}
            {user.tukaanId && (
              <div>
                <span className="text-sm font-medium text-gray-500">Tukaan ID:</span>
                <span className="ml-2 text-gray-900">{user.tukaanId}</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href="/items"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">View Items</h3>
            <p className="text-sm text-gray-600">Browse all available items</p>
          </a>

          {/* Admin Panel - ONLY visible to admin */}
          {user.role === 'admin' && (
            <a
              href="/admin"
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Admin Panel</h3>
              <p className="text-sm text-gray-600">Manage your shop</p>
            </a>
          )}
        </div>

        {/* Admin Dashboard Section - ONLY visible to admin */}
        {user.role === 'admin' && (
          <div className="mt-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Admin Dashboard</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <a
                href="/items"
                className="bg-green-50 border border-green-200 rounded-lg p-4 hover:bg-green-100 transition-colors cursor-pointer"
              >
                <h3 className="font-semibold text-gray-900 mb-1">Create Item</h3>
                <p className="text-sm text-gray-600">Add new items to your shop</p>
              </a>
              <a
                href="/items"
                className="bg-green-50 border border-green-200 rounded-lg p-4 hover:bg-green-100 transition-colors cursor-pointer"
              >
                <h3 className="font-semibold text-gray-900 mb-1">Manage Items</h3>
                <p className="text-sm text-gray-600">View and edit items</p>
              </a>
              <a
                href="/reports"
                className="bg-green-50 border border-green-200 rounded-lg p-4 hover:bg-green-100 transition-colors cursor-pointer"
              >
                <h3 className="font-semibold text-gray-900 mb-1">View Reports</h3>
                <p className="text-sm text-gray-600">Shop analytics and reports</p>
              </a>
              <a
                href="/customers"
                className="bg-green-50 border border-green-200 rounded-lg p-4 hover:bg-green-100 transition-colors cursor-pointer"
              >
                <h3 className="font-semibold text-gray-900 mb-1">Manage Customers</h3>
                <p className="text-sm text-gray-600">View and manage customers</p>
              </a>
              <a
                href="/debts"
                className="bg-green-50 border border-green-200 rounded-lg p-4 hover:bg-green-100 transition-colors cursor-pointer"
              >
                <h3 className="font-semibold text-gray-900 mb-1">View Debt (Deyn)</h3>
                <p className="text-sm text-gray-600">Track customer debts</p>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
