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

      // Check if this specific host device was individually revoked
      if (payload.hostId && serverState.revokedHostIds.includes(payload.hostId)) {
        return new Response(JSON.stringify({ ok: false, error: 'HOST_REVOKED', message: 'This host device access was revoked by the Owner' }), { status: 403, headers });
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

    // 3. Claim 1-Time Host Invite / Authorization
    if (action === 'claim_host') {
      const { grantCode } = body;
      if (!grantCode || typeof grantCode !== 'string') {
        return new Response(JSON.stringify({ ok: false, error: 'Grant code required' }), { status: 400, headers });
      }

      const cleanCode = grantCode.trim().toUpperCase();
      const grant = serverState.hostGrants.find(
        g => g.code.toUpperCase() === cleanCode && !g.claimed && !g.revoked
      );

      if (!grant) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'INVALID_GRANT',
          message: 'This host invite link is invalid, expired, or has already been claimed.',
        }), { status: 400, headers });
      }

      // Mark invite as redeemed/burned
      grant.claimed = true;
      grant.claimedAt = Date.now();

      // Issue 1-year persistent Host Device token
      const payload = {
        role: 'host' as const,
        isSuperAdmin: false,
        hostId: grant.id,
        exp: Date.now() + 365 * 24 * 60 * 60 * 1000,
        epoch: activeHostEpoch,
      };

      const signedToken = await signSession(payload, AUTH_SECRET);

      return new Response(JSON.stringify({
        ok: true,
        role: 'host',
        token: signedToken,
        hostId: grant.id,
        message: 'Host authorization granted! You now have permanent host access on this device.',
      }), { status: 200, headers });
    }

    // 4. Login with passcode or host grant code
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
        const otpResult = await sendOtpEmail(activeOwnerEmail, otpCode);

        return new Response(JSON.stringify({
          ok: true,
          requiresOtp: true,
          emailSent: otpResult.sent,
          deliveryNotice: otpResult.sent
            ? `Verification code dispatched to ${activeOwnerEmail.replace(/^(.{2})(.*)(@.*)$/, '$1***$3')}.`
            : `Notice: Email delivery could not complete. You can enter your Master Passcode as the emergency bypass code.`,
        }), { status: 200, headers });
      }

      // Check if user entered an unconsumed 1-time host grant code directly into the passcode box
      const grant = serverState.hostGrants.find(
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
          epoch: activeHostEpoch,
        };
        const signedToken = await signSession(payload, AUTH_SECRET);
        return new Response(JSON.stringify({
          ok: true,
          role: 'host',
          isSuperAdmin: false,
          token: signedToken,
          message: 'Host grant claimed successfully!',
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
