import type { LicensePayload, LicenseFile } from './types';

/**
 * Sign license payload with Ed25519
 * Uses Web Crypto API (available in Cloudflare Workers)
 */
export async function signLicense(
  payload: LicensePayload,
  privateKeyHex: string
): Promise<LicenseFile> {
  // Canonicalize payload (consistent JSON serialization)
  const payloadJson = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(payloadJson);

  // Decode private key from hex
  const privateKeyBytes = hexToBytes(privateKeyHex);

  // Import private key for signing
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    privateKeyBytes,
    {
      name: 'Ed25519',
    },
    false,
    ['sign']
  );

  // Sign the payload
  const signatureBytes = await crypto.subtle.sign(
    'Ed25519',
    cryptoKey,
    payloadBytes
  );

  // Convert signature to base64
  const signature = bytesToBase64(new Uint8Array(signatureBytes));

  return {
    payload,
    signature,
  };
}

/**
 * Hash email with SHA-256 (for privacy)
 */
export async function hashEmail(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64
 */
function bytesToBase64(bytes: Uint8Array): string {
  const binString = String.fromCodePoint(...bytes);
  return btoa(binString);
}
