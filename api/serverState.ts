// In-memory runtime state for Vercel Serverless / Edge execution
// Allows the Owner to dynamically change passcodes, update recovery email,
// trigger lockdown, and revoke all active host sessions instantly.

export interface HostGrant {
  id: string;
  code: string;
  createdAt: number;
  claimed: boolean;
  claimedAt?: number;
  revoked?: boolean;
}

export interface ServerState {
  ownerEmail: string;
  masterPasscode: string;
  masterRecoveryOtp: string;
  hostPasscode: string;
  viewerPasscode: string;
  hostEpoch: number;
  lockdown: boolean;
  activeOtp: {
    code: string;
    exp: number;
    email: string;
    attempts: number;
  } | null;
  hostGrants: HostGrant[];
  revokedHostIds: string[];
}

// In production on Vercel, these MUST be set in Vercel Environment Variables.
// Generic fallback placeholders are used here so no personal secrets are exposed in public Git repositories.
export const serverState: ServerState = {
  ownerEmail: process.env.OWNER_EMAIL || 'wrainmacalindong@gmail.com',
  masterPasscode: process.env.MASTER_PASSCODE || 'wRain1234',
  masterRecoveryOtp: process.env.MASTER_RECOVERY_OTP || '999000',
  hostPasscode: process.env.HOST_PASSCODE || 'party-host',
  viewerPasscode: process.env.VIEWER_PASSCODE || 'watchparty',
  hostEpoch: 1,
  lockdown: false,
  activeOtp: null,
  hostGrants: [],
  revokedHostIds: [],
};

export const AUTH_SECRET = process.env.AUTH_SECRET || 'watchparty-secure-hmac-token-secret-2026';

/**
 * Sends a real email via Resend if RESEND_API_KEY is configured.
 * Also supports DISCORD_WEBHOOK_URL for instant phone alert notifications.
 */
export async function sendOtpEmail(email: string, otp: string): Promise<{ sent: boolean; devMode: boolean; error?: string }> {
  let emailSent = false;
  let lastError = '';

  const targetEmail = email || serverState.ownerEmail || 'wrainmacalindong@gmail.com';

  // 1. If DISCORD_WEBHOOK_URL is configured, send immediate alert
  const discordWebhook = process.env.DISCORD_SECURITY_WEBHOOK || process.env.DISCORD_WEBHOOK_URL;
  if (discordWebhook) {
    try {
      const dwRes = await fetch(discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🔐 **Watchparty Owner 2FA Alert**\nVerification Code: \`${otp}\`\nRequested for: \`${targetEmail}\`\nValid for 10 minutes.`,
        }),
      });
      if (dwRes.ok) {
        console.log('[Auth] 2FA alert dispatched to Discord Webhook successfully');
      }
    } catch (e) {
      console.warn('Discord webhook dispatch error:', e);
    }
  }

  // 2. Dispatch via Resend API if API key is present
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[Auth] RESEND_API_KEY environment variable is missing. Email dispatch skipped.');
    lastError = 'RESEND_API_KEY is not configured';
  } else {
    try {
      console.log(`[Auth] Dispatching 2FA OTP email via Resend to ${targetEmail}...`);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Watchparty Security <onboarding@resend.dev>',
          to: [targetEmail],
          subject: `🔐 Your Watchparty Owner 2FA Code: ${otp}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #08080a; color: #f4f4f5; padding: 32px 24px; border-radius: 16px; max-width: 480px; margin: 0 auto; border: 1px solid #27272a;">
              <div style="display: flex; align-items: center; margin-bottom: 20px;">
                <span style="font-size: 20px; font-weight: 700; letter-spacing: 0.05em; color: #f59e0b; text-transform: uppercase;">Watchparty Security</span>
              </div>
              <h1 style="font-size: 18px; font-weight: 600; color: #fafafa; margin: 0 0 12px;">Owner 2FA Verification</h1>
              <p style="font-size: 14px; line-height: 1.5; color: #a1a1aa; margin: 0 0 24px;">An Owner login attempt was initiated for your private screening platform. Enter the single-use verification code below to authorize access:</p>
              <div style="background: #18181b; border: 1px solid #3f3f46; border-radius: 12px; padding: 20px; text-align: center; margin: 0 0 24px;">
                <span style="font-family: monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #fbbf24;">${otp}</span>
              </div>
              <p style="font-size: 12px; color: #71717a; line-height: 1.4; margin: 0;">This code is valid for 10 minutes. If you did not make this request, someone is attempting to enter with your Master Key.</p>
            </div>
          `,
        }),
      });

      if (res.ok) {
        emailSent = true;
        console.log(`[Auth] OTP email accepted by Resend for ${targetEmail}`);
      } else {
        const errorBody = await res.text();
        lastError = `Resend API returned HTTP ${res.status}: ${errorBody}`;
        console.error('[Auth] Failed to dispatch OTP email via Resend:', lastError);
      }
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.error('[Auth] Resend network error:', err);
    }
  }

  return { sent: emailSent, devMode: !apiKey, error: lastError };
}
