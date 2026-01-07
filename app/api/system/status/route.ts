import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { query, execute } from '@/lib/db';
import { UserRole, SystemStatus } from '@/lib/types';
import { createAuditLog } from '@/lib/audit';
import { canLockUnlockSystem } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permission = canLockUnlockSystem(session.user.role as UserRole);
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason || 'Forbidden' }, { status: 403 });
    }

    const configs = await query<any>(
      'SELECT status FROM system_config ORDER BY created_at DESC LIMIT 1'
    );
    return NextResponse.json({
      status: configs.length > 0 ? configs[0].status : SystemStatus.ACTIVE,
    });
  } catch (error) {
    console.error('System status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permission = canLockUnlockSystem(session.user.role as UserRole);
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason || 'Forbidden' }, { status: 403 });
    }

    const user = session.user;
    try {
      const body = await req.json();
      const { status } = body;

      if (!status || !['ACTIVE', 'LOCKED'].includes(status)) {
        return NextResponse.json(
          { error: 'Invalid status. Must be ACTIVE or LOCKED' },
          { status: 400 }
        );
      }

      const configs = await query<any>(
        'SELECT id, status FROM system_config ORDER BY created_at DESC LIMIT 1'
      );

      let config;
      if (configs.length === 0) {
        // Create new config
        const [uuidResult] = await query<any>('SELECT UUID() as id');
        const configId = uuidResult.id;
        
        await query(
          `INSERT INTO system_config (
            id, status, created_at, updated_at
          ) VALUES (?, ?, NOW(), NOW())`,
          [configId, status]
        );
        
        config = { id: configId, status };
      } else {
        // Update existing config
        const configId = configs[0].id;
        const updateFields: string[] = ['status = ?'];
        const updateValues: any[] = [status];

        if (status === SystemStatus.LOCKED) {
          updateFields.push('last_locked_by = ?', 'last_locked_at = NOW()');
          updateValues.push(user.id);
        } else {
          updateFields.push('last_unlocked_at = NOW()');
        }

        updateFields.push('updated_at = NOW()');
        updateValues.push(configId);

        await execute(
          `UPDATE system_config SET ${updateFields.join(', ')} WHERE id = ?`,
          updateValues
        );

        const [updatedConfig] = await query<any>(
          'SELECT id, status FROM system_config WHERE id = ?',
          [configId]
        );
        config = updatedConfig;
      }

      await createAuditLog(
        user.id,
        `SYSTEM_${status}`,
        'SYSTEM',
        config.id,
        { status },
        req.headers.get('x-forwarded-for') || undefined,
        req.headers.get('user-agent') || undefined
      );

      return NextResponse.json({ status: config.status });
    } catch (error) {
      console.error('System status update error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('System status POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

