import { verifySession } from './cryptoHelper';
import { serverState, AUTH_SECRET } from './serverState';
import { fetchRoomFromDb, updateRoomInDb, fetchSecurityFromDb, updateSecurityInDb } from './supabaseServer';

export const config = {
  runtime: 'edge',
};

let fallbackRoomState: Record<string, unknown> = {};

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

  // Load current room state from Supabase
  const dbRoom = await fetchRoomFromDb();
  const currentHostEpoch = dbRoom?.host_epoch ?? serverState.hostEpoch;
  const isLockedDown = dbRoom?.is_locked_down ?? serverState.lockdown;

  if (req.method === 'POST') {
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
    if (!payload.isSuperAdmin && payload.epoch && payload.epoch < currentHostEpoch) {
      return new Response(JSON.stringify({ error: 'Forbidden: Host session has been revoked by Owner' }), { status: 403, headers });
    }

    // Check lockdown mode (Owner is exempt)
    if (isLockedDown && !payload.isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Room is locked down by Owner' }), { status: 403, headers });
    }

    try {
      const body = await req.json();
      const { title, hlsUrl, embedUrl, discordUrl, autoPlay, ambientGlow, viewerPasscode, hostPasscode } = body;

      // 1. Update Supabase Room Configuration
      await updateRoomInDb({
        title,
        primary_hls_url: hlsUrl,
        backup_embed_url: embedUrl,
        discord_url: discordUrl,
        auto_play: autoPlay,
        ambient_glow: ambientGlow,
      });

      // 2. If Host updated passcodes, save to Supabase party_security
      const secUpdates: Record<string, string> = {};
      if (viewerPasscode && typeof viewerPasscode === 'string') {
        const vp = viewerPasscode.trim();
        secUpdates.viewer_passcode = vp;
        serverState.viewerPasscode = vp;
      }
      if (hostPasscode && typeof hostPasscode === 'string') {
        const hp = hostPasscode.trim();
        secUpdates.host_passcode = hp;
        serverState.hostPasscode = hp;
      }

      if (Object.keys(secUpdates).length > 0) {
        await updateSecurityInDb(secUpdates);
      }

      // Update in-memory fallback
      fallbackRoomState = {
        title,
        hlsUrl,
        embedUrl,
        discordUrl,
        autoPlay,
        ambientGlow,
        viewerPasscode,
        hostPasscode,
        updatedAt: Date.now(),
      };

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers });
    }
  }

  // GET - return current room state
  if (isLockedDown) {
    return new Response(JSON.stringify({ lockdown: true, title: 'Screening Room Locked (Maintenance)' }), { status: 200, headers });
  }

  // Check if caller is authenticated Host (to safely include live passcodes)
  let includePasscodes = false;
  let dbSec = null;
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const payload = await verifySession(token, AUTH_SECRET);
    if (payload && payload.role === 'host') {
      includePasscodes = true;
      dbSec = await fetchSecurityFromDb();
    }
  }

  if (dbRoom) {
    const responseData: Record<string, unknown> = {
      title: dbRoom.title,
      hlsUrl: dbRoom.primary_hls_url,
      embedUrl: dbRoom.backup_embed_url,
      discordUrl: dbRoom.discord_url,
      autoPlay: dbRoom.auto_play,
      ambientGlow: dbRoom.ambient_glow,
      lockdown: dbRoom.is_locked_down,
    };

    if (includePasscodes) {
      responseData.viewerPasscode = dbSec?.viewer_passcode || serverState.viewerPasscode;
      responseData.hostPasscode = dbSec?.host_passcode || serverState.hostPasscode;
    }

    return new Response(JSON.stringify(responseData), { status: 200, headers });
  }

  return new Response(JSON.stringify(fallbackRoomState), { status: 200, headers });
}
