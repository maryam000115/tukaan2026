'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Debt {
  id: string;
  customerId: string;
  transactionType: string;
  amount: number;
  notes: string | null;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
}

export default function DebtsPage() {
  const router = useRouter();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
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
        // Fetch debts
        return fetch('/api/debts');
      })
      .then((res) => res.json())
      .then((data) => {
        if (data.debts) {
          setDebts(data.debts);
          setBalances(data.balances || {});
        } else {
          setError(data.error || 'Failed to load debts');
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error:', err);
        setError('Failed to load debts');
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading debts...</p>
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
              <h1 className="text-xl font-bold text-gray-900">View Debt (Deyn)</h1>
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

        {/* Customer Balances Summary */}
        {Object.keys(balances).length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Balances</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(balances).map(([customerId, balance]) => {
                const customer = debts.find(d => d.customerId === customerId)?.customer;
                return (
                  <div key={customerId} className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      {customer?.name || 'Unknown'}
                    </p>
                    <p className={`text-lg font-bold ${
                      balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-gray-600'
                    }`}>
                      ${Math.abs(balance).toFixed(2)} {balance > 0 ? 'owed' : balance < 0 ? 'credit' : 'paid'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {debts.length === 0 && !error && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">No debt records found.</p>
          </div>
        )}

        {debts.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Transaction History</h2>
            {debts.map((debt) => (
              <div
                key={debt.id}
                className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {debt.customer.name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">Phone: {debt.customer.phone}</p>
                    {debt.notes && (
                      <p className="text-sm text-gray-600 mb-2">Notes: {debt.notes}</p>
                    )}
                    <span className={`inline-block text-xs px-2 py-1 rounded ${
                      debt.transactionType === 'DEBT_ADD'
                        ? 'bg-red-100 text-red-700'
                        : debt.transactionType === 'PAYMENT'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {debt.transactionType}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${
                      debt.transactionType === 'DEBT_ADD' ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {debt.transactionType === 'DEBT_ADD' ? '+' : '-'}${debt.amount.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(debt.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

