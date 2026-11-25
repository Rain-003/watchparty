// Lightweight, zero-dependency HMAC SHA-256 Web Crypto helper
// Compatible with Vercel Edge Runtime, Cloudflare Workers, and modern browsers.

export interface SessionPayload {
  role: 'viewer' | 'host';
  isSuperAdmin: boolean;
  exp: number; // Unix timestamp in ms
  epoch?: number; // Invalidation epoch
  hostId?: string; // Unique grant ID if granted via 1-time invite
}

function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToUint8Array(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(byte)) return null;
    bytes[i / 2] = byte;
  }
  return bytes;
}

function toBase64Url(str: string): string {
  try {
    if (typeof btoa === 'function') {
      return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
  } catch {
    // fallback
  }
  return Buffer.from(str, 'utf-8').toString('base64url');
}

function fromBase64Url(b64: string): string | null {
  try {
    let base64 = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    if (typeof atob === 'function') {
      return atob(base64);
    }
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    stringToUint8Array(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Creates a cryptographically signed HMAC SHA-256 token
 */
export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const key = await getHmacKey(secret);
  const json = JSON.stringify(payload);
  const data = toBase64Url(json);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, stringToUint8Array(data));
  const signatureHex = bufferToHex(signatureBuffer);
  return `${data}.${signatureHex}`;
}

/**
 * Verifies a token and returns the payload if valid and unexpired
 */
export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [data, signatureHex] = parts;
    const sigBytes = hexToUint8Array(signatureHex);
    if (!sigBytes) return null;

    const key = await getHmacKey(secret);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      stringToUint8Array(data)
    );

    if (!isValid) return null;

    const json = fromBase64Url(data);
    if (!json) return null;

    const payload = JSON.parse(json) as SessionPayload;
    if (!payload.exp || Date.now() > payload.exp) {
      return null; // Expired
    }

    if (payload.role !== 'viewer' && payload.role !== 'host') {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
