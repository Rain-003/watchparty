// In-memory runtime state for Vercel Serverless / Edge execution
// Allows the Owner to dynamically change passcodes, update recovery email,
// trigger lockdown, and revoke all active host sessions instantly.

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
}

// In production on Vercel, these MUST be set in Vercel Environment Variables.
// Generic fallback placeholders are used here so no personal secrets are exposed in public Git repositories.
export const serverState: ServerState = {
  ownerEmail: process.env.OWNER_EMAIL || '',
  masterPasscode: process.env.MASTER_PASSCODE || 'change-me-in-vercel-env',
  masterRecoveryOtp: process.env.MASTER_RECOVERY_OTP || '',
  hostPasscode: process.env.HOST_PASSCODE || 'change-me-in-vercel-env',
  viewerPasscode: process.env.VIEWER_PASSCODE || 'change-me-in-vercel-env',
  hostEpoch: 1,
  lockdown: false,
  activeOtp: null,
};

export const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-secret-replace-in-vercel-env';

/**
 * Sends a real email via Resend if RESEND_API_KEY is configured.
 * Also supports DISCORD_WEBHOOK_URL for instant phone alert notifications.
 */
export async function sendOtpEmail(email: string, otp: string): Promise<{ sent: boolean; devMode: boolean }> {
  let emailSent = false;

  // 1. If DISCORD_WEBHOOK_URL is configured, send immediate alert
  const discordWebhook = process.env.DISCORD_SECURITY_WEBHOOK || process.env.DISCORD_WEBHOOK_URL;
  if (discordWebhook) {
    try {
      await fetch(discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🔐 **Watchparty Owner 2FA Alert**\nVerification Code: \`${otp}\`\nRequested for: \`${email}\`\nValid for 10 minutes.`,
        }),
      });
    } catch (e) {
      console.warn('Discord webhook dispatch error:', e);
    }
  }

  // 2. Dispatch via Resend API if API key is present
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey && email) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Watchparty Security <onboarding@resend.dev>',
          to: [email],
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
      emailSent = res.ok;
    } catch (err) {
      console.error('Failed to dispatch OTP email via Resend:', err);
    }
  }

  return { sent: emailSent, devMode: !apiKey };
}
