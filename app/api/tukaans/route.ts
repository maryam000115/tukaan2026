import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withErrorHandling } from '@/lib/error-handler';

async function handler(req: NextRequest) {
  try {
    // Get active tukaans for dropdown
    const tukaans = await query<{
      id: number;
      name: string;
      location: string | null;
    }>(
      `SELECT id, name, location 
       FROM tukaans 
       WHERE status = 'ACTIVE' 
       ORDER BY name ASC`
    );

    return NextResponse.json({
      success: true,
      tukaans: tukaans.map((t) => ({
        id: t.id,
        name: t.name,
        location: t.location || '',
      })),
    });
  } catch (error: any) {
    console.error('Tukaans fetch error:', error);
    
    // If table doesn't exist, return empty array
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return NextResponse.json({
        success: true,
        tukaans: [],
        message: 'Tukaans table not found. Please run the database schema migration.',
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch tukaans',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandling(handler);

