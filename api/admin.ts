import { verifySession } from './cryptoHelper';
import { serverState, AUTH_SECRET } from './serverState';
import { fetchSecurityFromDb, updateSecurityInDb, fetchRoomFromDb, updateRoomInDb } from './supabaseServer';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request): Promise<Response> {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // Authorize Owner via Bearer token
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Owner token required' }), { status: 401, headers });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const payload = await verifySession(token, AUTH_SECRET);

  if (!payload || !payload.isSuperAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden: Owner privilege required' }), { status: 403, headers });
  }

  // Load from Supabase
  const [dbSec, dbRoom] = await Promise.all([
    fetchSecurityFromDb(),
    fetchRoomFromDb(),
  ]);

  const currentHostEpoch = dbRoom?.host_epoch ?? serverState.hostEpoch;
  const isLockedDown = dbRoom?.is_locked_down ?? serverState.lockdown;
  const activeOwnerEmail = dbSec?.owner_email || serverState.ownerEmail;
  const activeHostPasscode = dbSec?.host_passcode || serverState.hostPasscode;
  const activeViewerPasscode = dbSec?.viewer_passcode || serverState.viewerPasscode;

  // GET: Return current system status to Owner Admin Panel
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      ok: true,
      ownerEmail: activeOwnerEmail,
      hostPasscode: activeHostPasscode,
      viewerPasscode: activeViewerPasscode,
      hostEpoch: currentHostEpoch,
      lockdown: isLockedDown,
      hostGrants: serverState.hostGrants,
      supabaseConnected: !!dbSec || !!dbRoom,
    }), { status: 200, headers });
  }

  // POST: Execute emergency or administrative action
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { action } = body;

      // 1. Invalidate and kick all active host & viewer sessions
      if (action === 'revoke_hosts') {
        const nextEpoch = currentHostEpoch + 1;
        serverState.hostEpoch = nextEpoch;
        await updateRoomInDb({ host_epoch: nextEpoch });

        return new Response(JSON.stringify({
          ok: true,
          message: 'All existing host sessions have been revoked immediately.',
          hostEpoch: nextEpoch,
        }), { status: 200, headers });
      }

      // 2. Toggle emergency room lockdown
      if (action === 'toggle_lockdown') {
        const targetLockdown = !!body.lockdown;
        serverState.lockdown = targetLockdown;
        await updateRoomInDb({ is_locked_down: targetLockdown });

        return new Response(JSON.stringify({
          ok: true,
          lockdown: targetLockdown,
          message: targetLockdown ? 'Room lockdown enabled' : 'Room lockdown lifted',
        }), { status: 200, headers });
      }

      // 3. Update recovery / 2FA email
      if (action === 'update_email') {
        const { newEmail } = body;
        if (!newEmail || typeof newEmail !== 'string' || !newEmail.includes('@')) {
          return new Response(JSON.stringify({ ok: false, error: 'Valid email address required' }), { status: 400, headers });
        }
        const cleaned = newEmail.trim();
        serverState.ownerEmail = cleaned;
        await updateSecurityInDb({ owner_email: cleaned });

        return new Response(JSON.stringify({
          ok: true,
          message: 'Owner recovery email updated successfully',
          ownerEmail: cleaned,
        }), { status: 200, headers });
      }

      // 4. Update Host / Viewer passcodes on the fly
      if (action === 'update_passcodes') {
        const updates: Record<string, string> = {};
        if (body.hostPasscode && typeof body.hostPasscode === 'string') {
          const hp = body.hostPasscode.trim();
          serverState.hostPasscode = hp;
          updates.host_passcode = hp;
        }
        if (body.viewerPasscode && typeof body.viewerPasscode === 'string') {
          const vp = body.viewerPasscode.trim();
          serverState.viewerPasscode = vp;
          updates.viewer_passcode = vp;
        }
        await updateSecurityInDb(updates);

        return new Response(JSON.stringify({
          ok: true,
          message: 'Passcodes updated successfully',
          hostPasscode: serverState.hostPasscode,
          viewerPasscode: serverState.viewerPasscode,
        }), { status: 200, headers });
      }

      // 5. Generate 1-time Host invite code / grant link
      if (action === 'generate_host_grant') {
        const randChars = Math.random().toString(36).substring(2, 8).toUpperCase();
        const code = `HOST-${randChars}`;
        const grant = {
          id: `grant_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          code,
          createdAt: Date.now(),
          claimed: false,
        };
        serverState.hostGrants.push(grant);

        return new Response(JSON.stringify({
          ok: true,
          grant,
          message: '1-time host invite code created successfully',
        }), { status: 200, headers });
      }

      // 6. Revoke an individual host grant / device
      if (action === 'revoke_host_grant') {
        const { grantId } = body;
        if (!grantId || typeof grantId !== 'string') {
          return new Response(JSON.stringify({ ok: false, error: 'Grant ID required' }), { status: 400, headers });
        }

        const grant = serverState.hostGrants.find(g => g.id === grantId);
        if (grant) {
          grant.revoked = true;
        }

        if (!serverState.revokedHostIds.includes(grantId)) {
          serverState.revokedHostIds.push(grantId);
        }

        return new Response(JSON.stringify({
          ok: true,
          message: 'Host authorization revoked successfully',
          revokedId: grantId,
        }), { status: 200, headers });
      }

      return new Response(JSON.stringify({ error: 'Unknown admin action' }), { status: 400, headers });
    } catch (err) {
      console.error('Admin API error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
}
