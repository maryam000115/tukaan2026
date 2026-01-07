'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  remainingDebt: number;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
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
        // Fetch invoices
        return fetch('/api/invoices');
      })
      .then((res) => res.json())
      .then((data) => {
        if (data.invoices) {
          setInvoices(data.invoices);
        } else {
          setError(data.error || 'Failed to load invoices');
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error:', err);
        setError('Failed to load invoices');
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading invoices...</p>
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
              <h1 className="text-xl font-bold text-gray-900">Manage Invoices</h1>
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

        {invoices.length === 0 && !error && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">No invoices found.</p>
          </div>
        )}

        {invoices.length > 0 && (
          <div className="space-y-4">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Invoice #{invoice.invoiceNumber}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      Customer: {invoice.customer.name} ({invoice.customer.phone})
                    </p>
                    <span className={`inline-block text-xs px-2 py-1 rounded mr-2 ${
                      invoice.status === 'DELIVERED_CONFIRMED'
                        ? 'bg-green-100 text-green-700'
                        : invoice.status === 'REJECTED'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {invoice.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">
                      ${invoice.totalAmount.toFixed(2)}
                    </p>
                    {invoice.remainingDebt > 0 && (
                      <p className="text-sm text-red-600">
                        Debt: ${invoice.remainingDebt.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-gray-200">
                  <div>
                    <span className="text-xs font-medium text-gray-500">Total:</span>
                    <span className="ml-2 text-sm text-gray-900">
                      ${invoice.totalAmount.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500">Paid:</span>
                    <span className="ml-2 text-sm text-gray-900">
                      ${invoice.paidAmount.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500">Created:</span>
                    <span className="ml-2 text-sm text-gray-900">
                      {new Date(invoice.createdAt).toLocaleDateString()}
                    </span>
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

