// Vercel Serverless API Route: /api/room
// Stores the host's active stream URL in-memory and serves it to all viewers.
// Vercel Edge Functions are stateless per-instance, so we use a module-level
// variable as a fast in-memory cache. For persistent cross-instance state,
// set the ROOM_DATA environment variable in Vercel as a JSON string of defaults.

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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method === 'POST') {
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
  if (Object.keys(roomState).length === 0) {
    return new Response(JSON.stringify({}), { status: 200, headers });
  }

  return new Response(JSON.stringify(roomState), { status: 200, headers });
}
