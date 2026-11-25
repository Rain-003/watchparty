import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { signSession, verifySession } from './api/cryptoHelper';
import { serverState, AUTH_SECRET, sendOtpEmail } from './api/serverState';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const [user, domain] = parts;
  const visible = user.length > 2 ? user.slice(0, 2) + '***' + user.slice(-1) : user + '***';
  return `${visible}@${domain}`;
}

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
              const { action, passcode, token, otp } = body;

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
                if (!payload.isSuperAdmin && payload.epoch && payload.epoch < serverState.hostEpoch) {
                  res.statusCode = 401;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ ok: false, error: 'SESSION_REVOKED', message: 'Session revoked by Owner' }));
                }
                if (payload.hostId && serverState.revokedHostIds?.includes(payload.hostId)) {
                  res.statusCode = 403;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ ok: false, error: 'HOST_REVOKED', message: 'Host access was revoked by Owner' }));
                }
                if (serverState.lockdown && !payload.isSuperAdmin) {
                  res.statusCode = 403;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ ok: false, error: 'ROOM_LOCKDOWN', message: 'Room locked by Owner' }));
                }
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  ok: true,
                  role: payload.role,
                  isSuperAdmin: payload.isSuperAdmin,
                  exp: payload.exp,
                  lockdown: serverState.lockdown,
                }));
              }

              if (action === 'verify_otp') {
                const trimmedOtp = (otp || '').trim();
                const isMasterRecovery = 
                  trimmedOtp === serverState.masterRecoveryOtp || 
                  trimmedOtp === serverState.masterPasscode;

                if (!isMasterRecovery) {
                  const active = serverState.activeOtp;
                  if (!active) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ ok: false, error: 'No pending verification. Please log in again.' }));
                  }
                  if (Date.now() > active.exp) {
                    serverState.activeOtp = null;
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ ok: false, error: 'Verification code expired.' }));
                  }
                  if (trimmedOtp !== active.code) {
                    res.statusCode = 401;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ ok: false, error: 'Invalid verification code' }));
                  }
                }

                serverState.activeOtp = null;
                const payload = {
                  role: 'host' as const,
                  isSuperAdmin: true,
                  exp: Date.now() + SESSION_DURATION_MS,
                  epoch: serverState.hostEpoch,
                };
                const signedToken = await signSession(payload, AUTH_SECRET);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  ok: true,
                  role: 'host',
                  isSuperAdmin: true,
                  token: signedToken,
                }));
              }

              if (action === 'claim_host') {
                const cleanCode = (body.grantCode || '').trim().toUpperCase();
                const grant = serverState.hostGrants?.find(
                  g => g.code.toUpperCase() === cleanCode && !g.claimed && !g.revoked
                );
                if (!grant) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ ok: false, error: 'INVALID_GRANT', message: 'Invalid or claimed invite.' }));
                }

                grant.claimed = true;
                grant.claimedAt = Date.now();
                const payload = {
                  role: 'host' as const,
                  isSuperAdmin: false,
                  hostId: grant.id,
                  exp: Date.now() + 365 * 24 * 60 * 60 * 1000,
                  epoch: serverState.hostEpoch,
                };
                const signedToken = await signSession(payload, AUTH_SECRET);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  ok: true,
                  role: 'host',
                  token: signedToken,
                  hostId: grant.id,
                  message: 'Host authorization granted!',
                }));
              }

              if (action === 'login') {
                const trimmed = (passcode || '').trim();

                // Master owner key -> 2FA OTP
                if (trimmed === serverState.masterPasscode) {
                  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
                  serverState.activeOtp = {
                    code: otpCode,
                    exp: Date.now() + 10 * 60 * 1000,
                    email: serverState.ownerEmail,
                    attempts: 0,
                  };
                  const otpRes = await sendOtpEmail(serverState.ownerEmail, otpCode);
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({
                    ok: true,
                    requiresOtp: true,
                    emailSent: otpRes.sent,
                    deliveryNotice: otpRes.sent ? 'Verification code sent.' : 'Email failed. You can use Master Passcode as recovery code.',
                  }));
                }

                // Check 1-time host grant code in passcode box
                const grant = serverState.hostGrants?.find(
                  g => g.code.toUpperCase() === trimmed.toUpperCase() && !g.claimed && !g.revoked
                );
                if (grant) {
                  grant.claimed = true;
                  grant.claimedAt = Date.now();
                  const payload = {
                    role: 'host' as const,
                    isSuperAdmin: false,
                    hostId: grant.id,
                    exp: Date.now() + 365 * 24 * 60 * 60 * 1000,
                    epoch: serverState.hostEpoch,
                  };
                  const signedToken = await signSession(payload, AUTH_SECRET);
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({
                    ok: true,
                    role: 'host',
                    isSuperAdmin: false,
                    token: signedToken,
                  }));
                }

                if (serverState.lockdown) {
                  res.statusCode = 403;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ ok: false, error: 'ROOM_LOCKDOWN', message: 'Room under emergency lockdown' }));
                }

                let role: 'host' | 'viewer' | null = null;
                if (trimmed === serverState.hostPasscode) {
                  role = 'host';
                } else if (trimmed === serverState.viewerPasscode) {
                  role = 'viewer';
                }

                if (role) {
                  const payload = {
                    role,
                    isSuperAdmin: false,
                    exp: Date.now() + SESSION_DURATION_MS,
                    epoch: serverState.hostEpoch,
                  };
                  const signedToken = await signSession(payload, AUTH_SECRET);
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({
                    ok: true,
                    role,
                    isSuperAdmin: false,
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

        // 2. /api/admin endpoint
        if (url === '/api/admin') {
          const authHeader = req.headers['authorization'];
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'Unauthorized: Owner token required' }));
          }

          const token = authHeader.replace(/^Bearer\s+/i, '').trim();
          const payload = await verifySession(token, AUTH_SECRET);
          if (!payload || !payload.isSuperAdmin) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'Forbidden: Owner privilege required' }));
          }

          if (req.method === 'GET') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              ok: true,
              ownerEmail: serverState.ownerEmail,
              hostPasscode: serverState.hostPasscode,
              viewerPasscode: serverState.viewerPasscode,
              hostEpoch: serverState.hostEpoch,
              lockdown: serverState.lockdown,
              hostGrants: serverState.hostGrants || [],
            }));
          }

          if (req.method === 'POST') {
            let bodyStr = '';
            req.on('data', chunk => { bodyStr += chunk; });
            req.on('end', () => {
              try {
                const body = JSON.parse(bodyStr || '{}');
                const { action } = body;

                if (action === 'generate_host_grant') {
                  const randChars = Math.random().toString(36).substring(2, 8).toUpperCase();
                  const code = `HOST-${randChars}`;
                  const grant = {
                    id: `grant_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    code,
                    createdAt: Date.now(),
                    claimed: false,
                  };
                  if (!serverState.hostGrants) serverState.hostGrants = [];
                  serverState.hostGrants.push(grant);
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ ok: true, grant }));
                }

                if (action === 'revoke_host_grant') {
                  const { grantId } = body;
                  const grant = serverState.hostGrants?.find(g => g.id === grantId);
                  if (grant) grant.revoked = true;
                  if (!serverState.revokedHostIds) serverState.revokedHostIds = [];
                  if (!serverState.revokedHostIds.includes(grantId)) serverState.revokedHostIds.push(grantId);
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ ok: true, message: 'Host revoked' }));
                }

                if (action === 'revoke_hosts') {
                  serverState.hostEpoch += 1;
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ ok: true, message: 'Host sessions revoked', hostEpoch: serverState.hostEpoch }));
                }

                if (action === 'toggle_lockdown') {
                  serverState.lockdown = !!body.lockdown;
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ ok: true, lockdown: serverState.lockdown }));
                }

                if (action === 'update_email') {
                  if (body.newEmail && body.newEmail.includes('@')) {
                    serverState.ownerEmail = body.newEmail.trim();
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ ok: true, ownerEmail: serverState.ownerEmail }));
                  }
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ ok: false, error: 'Invalid email' }));
                }

                if (action === 'update_passcodes') {
                  if (body.hostPasscode) serverState.hostPasscode = body.hostPasscode.trim();
                  if (body.viewerPasscode) serverState.viewerPasscode = body.viewerPasscode.trim();
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ ok: true, hostPasscode: serverState.hostPasscode, viewerPasscode: serverState.viewerPasscode }));
                }

                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'Unknown action' }));
              } catch {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'Invalid body' }));
              }
            });
            return;
          }
        }

        // 3. /api/room endpoint
        if (url === '/api/room') {
          if (req.method === 'GET') {
            if (serverState.lockdown) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ lockdown: true, title: 'Screening Room Locked (Maintenance)' }));
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            const respData: Record<string, unknown> = { ...devRoomState };
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
              respData.viewerPasscode = serverState.viewerPasscode;
              respData.hostPasscode = serverState.hostPasscode;
            }
            return res.end(JSON.stringify(respData));
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

            if (!payload.isSuperAdmin && payload.epoch && payload.epoch < serverState.hostEpoch) {
              res.statusCode = 403;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Session revoked by Owner' }));
            }

            if (serverState.lockdown && !payload.isSuperAdmin) {
              res.statusCode = 403;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Room is locked down by Owner' }));
            }

            let bodyStr = '';
            req.on('data', chunk => { bodyStr += chunk; });
            req.on('end', () => {
              try {
                const body = JSON.parse(bodyStr || '{}');
                devRoomState = { ...body };
                if (body.viewerPasscode) serverState.viewerPasscode = body.viewerPasscode.trim();
                if (body.hostPasscode) serverState.hostPasscode = body.hostPasscode.trim();

                if (body.announceToDiscord) {
                  const discordWebhook = process.env.DISCORD_SECURITY_WEBHOOK || process.env.DISCORD_WEBHOOK_URL;
                  if (discordWebhook) {
                    const eventTitle = body.customAnnouncement || body.scheduledTitle || body.title || 'Screening';
                    const timeInfo = body.scheduledTime ? `\n⏰ **Showtime:** \`${body.scheduledTime}\`` : '';
                    fetch(discordWebhook, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        content: `🎬 **WATCHPARTY SCREENING ANNOUNCEMENT**\n📢 **${eventTitle}**${timeInfo}\n🍿 **Join the Watchparty:** https://watchparty-vert.vercel.app`,
                      }),
                    }).catch(() => {});
                  }
                }

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
