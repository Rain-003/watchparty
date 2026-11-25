import { signSession, verifySession } from './cryptoHelper';
import { serverState, AUTH_SECRET, sendOtpEmail } from './serverState';
import { fetchSecurityFromDb, fetchRoomFromDb } from './supabaseServer';

export const config = {
  runtime: 'edge',
};

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
    const { action, passcode, token, otp } = body;

    // Load dynamic state from Supabase (with fallback)
    const [dbSec, dbRoom] = await Promise.all([
      fetchSecurityFromDb(),
      fetchRoomFromDb(),
    ]);

    const activeMasterPasscode = dbSec?.master_passcode || serverState.masterPasscode;
    const activeMasterRecoveryOtp = dbSec?.master_recovery_otp || serverState.masterRecoveryOtp;
    const activeHostPasscode = dbSec?.host_passcode || serverState.hostPasscode;
    const activeViewerPasscode = dbSec?.viewer_passcode || serverState.viewerPasscode;
    const activeOwnerEmail = dbSec?.owner_email || serverState.ownerEmail;
    const activeHostEpoch = dbRoom?.host_epoch ?? serverState.hostEpoch;
    const isLockedDown = dbRoom?.is_locked_down ?? serverState.lockdown;

    // 1. Verify an existing signed token
    if (action === 'verify') {
      if (!token || typeof token !== 'string') {
        return new Response(JSON.stringify({ ok: false, error: 'Missing token' }), { status: 400, headers });
      }

      const payload = await verifySession(token, AUTH_SECRET);
      if (!payload) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid or expired token' }), { status: 401, headers });
      }

      // Check if session was invalidated by emergency revocation (Owner is exempt)
      if (!payload.isSuperAdmin && payload.epoch && payload.epoch < activeHostEpoch) {
        return new Response(JSON.stringify({ ok: false, error: 'SESSION_REVOKED', message: 'Session revoked by Owner' }), { status: 401, headers });
      }

      // Check if room is in lockdown mode (Owner is exempt)
      if (isLockedDown && !payload.isSuperAdmin) {
        return new Response(JSON.stringify({ ok: false, error: 'ROOM_LOCKDOWN', message: 'Room locked by Owner' }), { status: 403, headers });
      }

      return new Response(JSON.stringify({
        ok: true,
        role: payload.role,
        isSuperAdmin: payload.isSuperAdmin,
        exp: payload.exp,
        lockdown: isLockedDown,
      }), { status: 200, headers });
    }

    // 2. Verify 2FA OTP for Owner
    if (action === 'verify_otp') {
      if (!otp || typeof otp !== 'string') {
        return new Response(JSON.stringify({ ok: false, error: 'OTP code required' }), { status: 400, headers });
      }

      const trimmedOtp = otp.trim();

      // Master Emergency Recovery Bypass (Guarantees owner access if email fails or is delayed)
      const isMasterRecovery = 
        trimmedOtp === activeMasterRecoveryOtp || 
        trimmedOtp === activeMasterPasscode;

      if (!isMasterRecovery) {
        const active = serverState.activeOtp;
        if (!active) {
          return new Response(JSON.stringify({ ok: false, error: 'No pending verification. Please log in again.' }), { status: 400, headers });
        }

        if (Date.now() > active.exp) {
          serverState.activeOtp = null;
          return new Response(JSON.stringify({ ok: false, error: 'Verification code expired. Please request a new one.' }), { status: 400, headers });
        }

        if (active.attempts >= 5) {
          serverState.activeOtp = null;
          return new Response(JSON.stringify({ ok: false, error: 'Too many failed attempts. Code invalidated.' }), { status: 429, headers });
        }

        if (trimmedOtp !== active.code) {
          active.attempts += 1;
          return new Response(JSON.stringify({ ok: false, error: 'Invalid verification code' }), { status: 401, headers });
        }
      }

      // OTP or Master Recovery Verified! Issue elevated Owner session token
      serverState.activeOtp = null;

      const payload = {
        role: 'host' as const,
        isSuperAdmin: true,
        exp: Date.now() + SESSION_DURATION_MS,
        epoch: activeHostEpoch,
      };

      const signedToken = await signSession(payload, AUTH_SECRET);

      return new Response(JSON.stringify({
        ok: true,
        role: 'host',
        isSuperAdmin: true,
        token: signedToken,
      }), { status: 200, headers });
    }

    // 3. Login with passcode
    if (action === 'login') {
      if (!passcode || typeof passcode !== 'string') {
        return new Response(JSON.stringify({ ok: false, error: 'Passcode required' }), { status: 400, headers });
      }

      const trimmed = passcode.trim();

      // Check master owner key -> TRIGGERS 2FA EMAIL OTP
      if (trimmed === activeMasterPasscode) {
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        serverState.activeOtp = {
          code: otpCode,
          exp: Date.now() + 10 * 60 * 1000, // 10 minutes
          email: activeOwnerEmail,
          attempts: 0,
        };

        // Dispatch email to owner in background
        await sendOtpEmail(activeOwnerEmail, otpCode);

        // Stealth response: Never reveal the email address or OTP in client responses
        return new Response(JSON.stringify({
          ok: true,
          requiresOtp: true,
        }), { status: 200, headers });
      }

      // If room is locked down, ordinary hosts and viewers cannot log in
      if (isLockedDown) {
        return new Response(JSON.stringify({ ok: false, error: 'ROOM_LOCKDOWN', message: 'Screening room is currently under emergency lockdown by Owner.' }), { status: 403, headers });
      }

      // Check host passcode
      if (trimmed === activeHostPasscode) {
        const payload = {
          role: 'host' as const,
          isSuperAdmin: false,
          exp: Date.now() + SESSION_DURATION_MS,
          epoch: activeHostEpoch,
        };
        const signedToken = await signSession(payload, AUTH_SECRET);
        return new Response(JSON.stringify({
          ok: true,
          role: 'host',
          isSuperAdmin: false,
          token: signedToken,
        }), { status: 200, headers });
      }

      // Check viewer passcode
      if (trimmed === activeViewerPasscode) {
        const payload = {
          role: 'viewer' as const,
          isSuperAdmin: false,
          exp: Date.now() + SESSION_DURATION_MS,
          epoch: activeHostEpoch,
        };
        const signedToken = await signSession(payload, AUTH_SECRET);
        return new Response(JSON.stringify({
          ok: true,
          role: 'viewer',
          isSuperAdmin: false,
          token: signedToken,
        }), { status: 200, headers });
      }

      return new Response(JSON.stringify({ ok: false, error: 'Invalid passcode' }), { status: 401, headers });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers });
  } catch (err) {
    console.error('Auth handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers });
  }
}
