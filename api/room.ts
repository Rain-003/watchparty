// Vercel Serverless API Route: /api/room
// Stores the host's active stream URL in-memory and serves it to all viewers.
// POST requests strictly require a cryptographically signed Host token in Authorization header.

import { verifySession } from './cryptoHelper';
import { serverState, AUTH_SECRET } from './serverState';

let roomState: Record<string, unknown> = {};

// Pre-load from optional ENV default
try {
  if (process.env.ROOM_DEFAULT) {
    roomState = JSON.parse(process.env.ROOM_DEFAULT);
  }
} catch {
  // ignore
}

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

  if (req.method === 'POST') {
    // Security check: Only verified hosts can update room state
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Host token required' }), { status: 401, headers });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const payload = await verifySession(token, AUTH_SECRET);

    if (!payload || payload.role !== 'host') {
      return new Response(JSON.stringify({ error: 'Forbidden: Valid Host session required' }), { status: 403, headers });
    }

    // Check if session was revoked by Owner (Owner is exempt)
    if (!payload.isSuperAdmin && payload.epoch && payload.epoch < serverState.hostEpoch) {
      return new Response(JSON.stringify({ error: 'Forbidden: Host session has been revoked by Owner' }), { status: 403, headers });
    }

    // Check lockdown mode (Owner is exempt)
    if (serverState.lockdown && !payload.isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Room is locked down by Owner' }), { status: 403, headers });
    }

    try {
      const body = await req.json();
      // Only allow viewer-safe fields — never store passcodes
      const { title, hlsUrl, embedUrl, discordUrl, autoPlay, ambientGlow, updatedAt } = body;
      roomState = { title, hlsUrl, embedUrl, discordUrl, autoPlay, ambientGlow, updatedAt };
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers });
    }
  }

  // GET - return current room state to viewers
  if (serverState.lockdown) {
    return new Response(JSON.stringify({ lockdown: true, title: 'Screening Room Locked (Maintenance)' }), { status: 200, headers });
  }

  if (Object.keys(roomState).length === 0) {
    return new Response(JSON.stringify({}), { status: 200, headers });
  }

  return new Response(JSON.stringify(roomState), { status: 200, headers });
}
