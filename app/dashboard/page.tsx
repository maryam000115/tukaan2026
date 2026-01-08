'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy dashboard - redirects to appropriate dashboard based on accountType
 */
export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    // Check user session and redirect to appropriate dashboard
    fetch('/api/auth/me', {
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) {
          router.push('/login');
          return;
        }

        // Redirect based on accountType
        const accountType = data.user.accountType;
        if (accountType === 'customer') {
          router.push('/dashboard-customer');
        } else {
          router.push('/dashboard-staff');
        }
      })
      .catch(() => {
        router.push('/login');
      });
  }, [router]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Redirecting...</p>
      </div>
    </div>
  );
}
