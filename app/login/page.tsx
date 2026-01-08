'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { validatePhone, validatePassword } from '@/lib/validation';

export default function LoginPage() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<'staff' | 'admin' | 'customer'>('staff');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    // Check if already logged in
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user && !data.locked) {
          router.push('/dashboard');
        }
      })
      .catch(() => {});
  }, [router]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    const phoneError = validatePhone(phone);
    const passwordError = validatePassword(password);

    if (phoneError) newErrors.phone = phoneError;
    if (passwordError) newErrors.password = passwordError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');
    setErrors({});

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password, accountType }),
        credentials: 'include', // ✅ IMPORTANT: Include cookies in request/response
      });

      const data = await res.json();

      // Debug logging
      console.log('Login API response:', {
        status: res.status,
        ok: res.ok,
        success: data.success,
        hasUser: !!data.user,
        message: data.message,
        error: data.error,
      });

      if (!res.ok) {
        if (res.status === 503) {
          router.push('/locked');
          return;
        }
        // Check for suspended account (403 status)
        if (res.status === 403 && data.message?.includes('suspended')) {
          setApiError('Your account is suspended. Contact admin.');
        } else {
          setApiError(data.message || data.error || 'Invalid credentials');
        }
        setLoading(false);
        return;
      }

      if (data.success && data.user) {
        console.log('Login successful, redirecting to dashboard...', {
          accountType: data.user.accountType || data.accountType,
          userId: data.user.id,
          status: data.user.status,
        });
        
        // ✅ Small delay to ensure cookie is set before redirect
        // This prevents race condition where dashboard loads before cookie is available
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // ✅ Redirect based on accountType using full page reload
        const accountType = data.user.accountType || data.accountType;
        if (accountType === 'customer') {
          window.location.href = '/dashboard-customer';
        } else {
          window.location.href = '/dashboard-staff';
        }
      } else {
        console.error('Login failed - no user in response:', data);
        setApiError(data.message || data.error || 'Login failed. Please try again.');
        setLoading(false);
      }
    } catch (err) {
      setApiError('Network error. Please check your connection and try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-lg p-6 sm:p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Tuke</h2>
            <p className="text-gray-600">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {apiError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <p className="text-sm text-red-800">{apiError}</p>
              </div>
            )}

            <div>
              <label
                htmlFor="accountType"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Account Type
              </label>
              <select
                id="accountType"
                name="accountType"
                value={accountType}
                onChange={(e) => {
                  setAccountType(e.target.value as 'staff' | 'admin' | 'customer');
                  setApiError('');
                }}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
              >
                <option value="customer">Customer</option>
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Phone Number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (errors.phone) {
                    setErrors({ ...errors, phone: '' });
                  }
                }}
                className={`w-full px-4 py-3 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.phone ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="612345678 (9 digits)"
              />
              {errors.phone && (
                <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) {
                    setErrors({ ...errors, password: '' });
                  }
                }}
                className={`w-full px-4 py-3 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.password ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter your password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium text-base hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

            <p className="text-center text-sm text-gray-600 mt-4">
              Don't have an account?{' '}
              <a href="/register" className="text-green-600 hover:text-green-700 font-medium">
                Register
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
