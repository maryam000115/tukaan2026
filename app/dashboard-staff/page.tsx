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
  accountType?: 'staff' | 'customer';
  status?: string;
  shopName?: string;
  shopLocation?: string;
  shopId?: string;
}

export default function StaffDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Add a small delay to ensure cookie is available after redirect
    const checkAuth = async () => {
      try {
        // Wait a bit for cookie to be processed
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
          cache: 'no-store', // Prevent caching
        });
        
        console.log('Staff dashboard auth check - Response status:', res.status);
        const data = await res.json();
        
        console.log('Staff dashboard auth check - Full response:', {
          hasUser: !!data.user,
          userId: data.user?.id,
          accountType: data.user?.accountType,
          role: data.user?.role,
          status: data.user?.status,
          fullData: data,
        });

        // Check if user exists
        if (!data.user) {
          console.warn('❌ No user found in session, redirecting to login');
          console.warn('Response data:', data);
          window.location.href = '/login';
          return;
        }

        // Check if user is customer (should not access staff dashboard)
        if (data.user.accountType === 'customer') {
          console.warn('Customer trying to access staff dashboard, redirecting');
          window.location.href = '/dashboard-customer';
          return;
        }

        // Check if staff user is suspended
        // Note: accountType can be 'staff' for both STAFF and ADMIN roles
        if ((data.user.accountType === 'staff' || !data.user.accountType) && data.user.status && data.user.status !== 'ACTIVE') {
          console.warn('Staff user is suspended, redirecting to login');
          window.location.href = '/login?error=suspended';
          return;
        }

        // ✅ If accountType is missing but role is staff/admin, allow access
        // This handles cases where accountType might not be set in older sessions
        if (!data.user.accountType && (data.user.role === 'staff' || data.user.role === 'admin' || data.user.role === 'owner')) {
          console.log('AccountType missing but role is staff/admin, allowing access');
          setUser(data.user);
          setLoading(false);
          return;
        }

        // Set user data
        console.log('✅ User authenticated, setting user data');
        setUser(data.user);
        setLoading(false);
      } catch (error) {
        console.error('Staff dashboard auth error:', error);
        window.location.href = '/login';
      }
    };

    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
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
            <h1 className="text-xl font-bold text-gray-900">Staff Dashboard</h1>
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
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <a
            href="/items"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">View Items</h3>
            <p className="text-sm text-gray-600">Browse all items in your shop</p>
          </a>

          <a
            href="/items/create"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Create Item</h3>
            <p className="text-sm text-gray-600">Add new items to your shop</p>
          </a>

          <a
            href="/reports"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">View Reports</h3>
            <p className="text-sm text-gray-600">Shop analytics and reports</p>
          </a>

          <a
            href="/customers"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage Customers</h3>
            <p className="text-sm text-gray-600">View and manage customers</p>
          </a>

          <a
            href="/debts"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">View Debt (Deyn)</h3>
            <p className="text-sm text-gray-600">Track customer debts</p>
          </a>

          {/* Admin Panel - ONLY visible to admin/owner */}
          {(user.role === 'admin' || user.role === 'owner') && (
            <a
              href="/admin"
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Admin Panel</h3>
              <p className="text-sm text-gray-600">Manage your shop settings</p>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

