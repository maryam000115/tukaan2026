'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Stats {
  totalInvoices: number;
  pendingInvoices: number;
  totalRevenue: number;
  totalDebt: number;
  totalPayments: number;
  totalCustomers: number;
  totalItems: number;
}

export default function ReportsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) {
          router.push('/login');
          return;
        }
        // Fetch stats
        return fetch('/api/dashboard/stats');
      })
      .then((res) => res.json())
      .then((data) => {
        if (data.totalInvoices !== undefined) {
          setStats(data);
        } else {
          setError(data.error || 'Failed to load reports');
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error:', err);
        setError('Failed to load reports');
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading reports...</p>
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
              <h1 className="text-xl font-bold text-gray-900">View Reports</h1>
            </div>
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

        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Invoices Stats */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Total Invoices</h3>
              <p className="text-3xl font-bold text-gray-900">{stats.totalInvoices}</p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Pending Invoices</h3>
              <p className="text-3xl font-bold text-yellow-600">{stats.pendingInvoices}</p>
            </div>

            {/* Revenue */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Total Revenue</h3>
              <p className="text-3xl font-bold text-green-600">${stats.totalRevenue.toFixed(2)}</p>
            </div>

            {/* Debt Stats */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Total Debt</h3>
              <p className="text-3xl font-bold text-red-600">${stats.totalDebt.toFixed(2)}</p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Total Payments</h3>
              <p className="text-3xl font-bold text-green-600">${stats.totalPayments.toFixed(2)}</p>
            </div>

            {/* Customer Stats */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Total Customers</h3>
              <p className="text-3xl font-bold text-blue-600">{stats.totalCustomers}</p>
            </div>

            {/* Item Stats */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Total Items</h3>
              <p className="text-3xl font-bold text-purple-600">{stats.totalItems}</p>
            </div>

            {/* Net Balance */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Net Balance</h3>
              <p className={`text-3xl font-bold ${
                (stats.totalDebt - stats.totalPayments) > 0 ? 'text-red-600' : 'text-green-600'
              }`}>
                ${(stats.totalDebt - stats.totalPayments).toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

