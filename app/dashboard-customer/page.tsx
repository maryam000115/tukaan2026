'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: number;
  firstName: string;
  middleName?: string;
  lastName: string;
  phone: string;
  role: 'customer';
  accountType?: 'customer';
  shopName?: string;
  shopLocation?: string;
  shopId?: string;
}

export default function CustomerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me', {
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        // Check if user exists
        if (!data.user) {
          router.push('/login');
          return;
        }

        // Check if user is staff (should not access customer dashboard)
        if (data.user.accountType === 'staff') {
          router.push('/dashboard-staff');
          return;
        }

        // Set user data
        setUser(data.user);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Customer dashboard auth error:', error);
        router.push('/login');
      });
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    router.push('/login');
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
            <h1 className="text-xl font-bold text-gray-900">My Dashboard</h1>
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">My Information</h2>
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
            {user.shopName && (
              <div>
                <span className="text-sm font-medium text-gray-500">Shop:</span>
                <span className="ml-2 text-gray-900">{user.shopName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Customer Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <a
            href="/items?customer=true"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">My Debt</h3>
            <p className="text-sm text-gray-600">View my outstanding debts (DEEN)</p>
          </a>

          <a
            href="/items?customer=true&paymentType=CASH"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Purchase History</h3>
            <p className="text-sm text-gray-600">View items I have purchased</p>
          </a>

          <a
            href="/debts?customer=true"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Payments</h3>
            <p className="text-sm text-gray-600">View my payment history</p>
          </a>
        </div>
      </div>
    </div>
  );
}

