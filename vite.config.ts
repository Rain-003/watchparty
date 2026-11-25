import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { signSession, verifySession } from './api/cryptoHelper';

const AUTH_SECRET = process.env.AUTH_SECRET || 'watchparty-vault-secret-key-32chars!!';
const MASTER_PASSCODE = process.env.MASTER_PASSCODE || 'wRain1234';
const HOST_PASSCODE = process.env.HOST_PASSCODE || 'party-host';
const VIEWER_PASSCODE = process.env.VIEWER_PASSCODE || 'watchparty';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

let devRoomState: Record<string, unknown> = {};

function devApiPlugin(): Plugin {
  return {
    name: 'dev-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];

        // 1. /api/auth endpoint
        if (url === '/api/auth' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const { action, passcode, token } = body;

              if (action === 'verify') {
                if (!token) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ ok: false, error: 'Missing token' }));
                }
                const payload = await verifySession(token, AUTH_SECRET);
                if (!payload) {
                  res.statusCode = 401;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ ok: false, error: 'Invalid or expired token' }));
                }
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  ok: true,
                  role: payload.role,
                  isSuperAdmin: payload.isSuperAdmin,
                  exp: payload.exp,
                }));
              }

              if (action === 'login') {
                const trimmed = (passcode || '').trim();
                let role: 'host' | 'viewer' | null = null;
                let isSuperAdmin = false;

                if (trimmed === MASTER_PASSCODE) {
                  role = 'host';
                  isSuperAdmin = true;
                } else if (trimmed === HOST_PASSCODE) {
                  role = 'host';
                  isSuperAdmin = false;
                } else if (trimmed === VIEWER_PASSCODE) {
                  role = 'viewer';
                  isSuperAdmin = false;
                }

                if (role) {
                  const payload = {
                    role,
                    isSuperAdmin,
                    exp: Date.now() + SESSION_DURATION_MS,
                  };
                  const signedToken = await signSession(payload, AUTH_SECRET);
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({
                    ok: true,
                    role,
                    isSuperAdmin,
                    token: signedToken,
                  }));
                }

                res.statusCode = 401;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ ok: false, error: 'Invalid passcode' }));
              }

              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Unknown action' }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Internal server error' }));
            }
          });
          return;
        }

        // 2. /api/room endpoint
        if (url === '/api/room') {
          if (req.method === 'GET') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(devRoomState));
          }

          if (req.method === 'POST') {
            const authHeader = req.headers['authorization'];
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
              res.statusCode = 401;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Unauthorized: Host token required' }));
            }

            const token = authHeader.replace(/^Bearer\s+/i, '').trim();
            const payload = await verifySession(token, AUTH_SECRET);

            if (!payload || payload.role !== 'host') {
              res.statusCode = 403;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Forbidden: Valid Host session required' }));
            }

            let bodyStr = '';
            req.on('data', chunk => { bodyStr += chunk; });
            req.on('end', () => {
              try {
                const body = JSON.parse(bodyStr || '{}');
                devRoomState = { ...body };
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ ok: true }));
              } catch {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'Invalid body' }));
              }
            });
            return;
          }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApiPlugin()],
});
