import { NextResponse } from 'next/server';
import { checkDatabaseConnection } from '@/lib/db';

export async function GET() {
  try {
    const dbStatus = await checkDatabaseConnection();

    if (!dbStatus.connected) {
      return NextResponse.json(
        {
          status: 'error',
          api: 'ok',
          database: 'disconnected',
          error: dbStatus.error,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      api: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        api: 'error',
        database: 'unknown',
        error: process.env.APP_ENV === 'production'
          ? 'Health check failed'
          : error.message,
      },
      { status: 503 }
    );
  }
}

