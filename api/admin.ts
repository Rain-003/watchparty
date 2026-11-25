import { verifySession } from './cryptoHelper';
import { serverState, AUTH_SECRET } from './serverState';

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

  // GET: Return current system status to Owner Admin Panel
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      ok: true,
      ownerEmail: serverState.ownerEmail,
      hostPasscode: serverState.hostPasscode,
      viewerPasscode: serverState.viewerPasscode,
      hostEpoch: serverState.hostEpoch,
      lockdown: serverState.lockdown,
    }), { status: 200, headers });
  }

  // POST: Execute emergency or administrative action
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { action } = body;

      // 1. Invalidate and kick all active host & viewer sessions
      if (action === 'revoke_hosts') {
        serverState.hostEpoch += 1;
        return new Response(JSON.stringify({
          ok: true,
          message: 'All existing host sessions have been revoked immediately.',
          hostEpoch: serverState.hostEpoch,
        }), { status: 200, headers });
      }

      // 2. Toggle emergency room lockdown
      if (action === 'toggle_lockdown') {
        serverState.lockdown = !!body.lockdown;
        return new Response(JSON.stringify({
          ok: true,
          lockdown: serverState.lockdown,
          message: serverState.lockdown ? 'Room lockdown enabled' : 'Room lockdown lifted',
        }), { status: 200, headers });
      }

      // 3. Update recovery / 2FA email
      if (action === 'update_email') {
        const { newEmail } = body;
        if (!newEmail || typeof newEmail !== 'string' || !newEmail.includes('@')) {
          return new Response(JSON.stringify({ ok: false, error: 'Valid email address required' }), { status: 400, headers });
        }
        serverState.ownerEmail = newEmail.trim();
        return new Response(JSON.stringify({
          ok: true,
          message: 'Owner recovery email updated successfully',
          ownerEmail: serverState.ownerEmail,
        }), { status: 200, headers });
      }

      // 4. Update Host / Viewer passcodes on the fly
      if (action === 'update_passcodes') {
        if (body.hostPasscode && typeof body.hostPasscode === 'string') {
          serverState.hostPasscode = body.hostPasscode.trim();
        }
        if (body.viewerPasscode && typeof body.viewerPasscode === 'string') {
          serverState.viewerPasscode = body.viewerPasscode.trim();
        }
        return new Response(JSON.stringify({
          ok: true,
          message: 'Passcodes updated successfully',
          hostPasscode: serverState.hostPasscode,
          viewerPasscode: serverState.viewerPasscode,
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
