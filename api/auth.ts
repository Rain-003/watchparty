import { signSession, verifySession } from './cryptoHelper';

export const config = {
  runtime: 'edge',
};

const AUTH_SECRET = process.env.AUTH_SECRET || 'watchparty-vault-secret-key-32chars!!';
const MASTER_PASSCODE = process.env.MASTER_PASSCODE || 'wRain1234';
const HOST_PASSCODE = process.env.HOST_PASSCODE || 'party-host';
const VIEWER_PASSCODE = process.env.VIEWER_PASSCODE || 'watchparty';

// 7 days expiration
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

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

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    const body = await req.json();
    const { action, passcode, token } = body;

    // 1. Verify an existing signed token
    if (action === 'verify') {
      if (!token || typeof token !== 'string') {
        return new Response(JSON.stringify({ ok: false, error: 'Missing token' }), { status: 400, headers });
      }

      const payload = await verifySession(token, AUTH_SECRET);
      if (!payload) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid or expired token' }), { status: 401, headers });
      }

      return new Response(JSON.stringify({
        ok: true,
        role: payload.role,
        isSuperAdmin: payload.isSuperAdmin,
        exp: payload.exp,
      }), { status: 200, headers });
    }

    // 2. Login with passcode & issue a cryptographically signed HMAC token
    if (action === 'login') {
      if (!passcode || typeof passcode !== 'string') {
        return new Response(JSON.stringify({ ok: false, error: 'Passcode required' }), { status: 400, headers });
      }

      const trimmed = passcode.trim();

      // Check master admin key
      if (trimmed === MASTER_PASSCODE) {
        const payload = {
          role: 'host' as const,
          isSuperAdmin: true,
          exp: Date.now() + SESSION_DURATION_MS,
        };
        const signedToken = await signSession(payload, AUTH_SECRET);
        return new Response(JSON.stringify({
          ok: true,
          role: payload.role,
          isSuperAdmin: true,
          token: signedToken,
        }), { status: 200, headers });
      }

      // Check host passcode
      if (trimmed === HOST_PASSCODE) {
        const payload = {
          role: 'host' as const,
          isSuperAdmin: false,
          exp: Date.now() + SESSION_DURATION_MS,
        };
        const signedToken = await signSession(payload, AUTH_SECRET);
        return new Response(JSON.stringify({
          ok: true,
          role: payload.role,
          isSuperAdmin: false,
          token: signedToken,
        }), { status: 200, headers });
      }

      // Check viewer passcode
      if (trimmed === VIEWER_PASSCODE) {
        const payload = {
          role: 'viewer' as const,
          isSuperAdmin: false,
          exp: Date.now() + SESSION_DURATION_MS,
        };
        const signedToken = await signSession(payload, AUTH_SECRET);
        return new Response(JSON.stringify({
          ok: true,
          role: payload.role,
          isSuperAdmin: false,
          token: signedToken,
        }), { status: 200, headers });
      }

      // Invalid passcode
      return new Response(JSON.stringify({ ok: false, error: 'Invalid passcode' }), { status: 401, headers });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers });
  } catch (err) {
    console.error('Auth handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers });
  }
}
