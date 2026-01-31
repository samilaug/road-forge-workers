import type { Env, PaddleWebhookEvent, LicenseFile } from '../types';
import { signLicense, hashEmail } from '../crypto';
import { createLicense, updateLicenseStatus, getLicenseByTransactionId, linkLicenseToUser } from '../db';

/**
 * Verify Paddle webhook signature
 * https://developer.paddle.com/webhooks/signature-verification
 */
async function verifyPaddleSignature(
  request: Request,
  secret: string
): Promise<{ valid: boolean; body: string }> {
  try {
    // Get signature from header
    const signature = request.headers.get('Paddle-Signature');
    if (!signature) {
      console.error('Missing Paddle-Signature header');
      return { valid: false, body: '' };
    }

    // Parse signature (format: ts=timestamp;h1=signature_hash)
    const sigParts = signature.split(';').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const timestamp = sigParts['ts'];
    const signatureHash = sigParts['h1'];

    if (!timestamp || !signatureHash) {
      console.error('Invalid signature format');
      return { valid: false, body: '' };
    }

    // Get raw body
    const body = await request.text();

    // Construct signed payload
    const signedPayload = `${timestamp}:${body}`;

    // Compute expected signature (HMAC SHA256)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(signedPayload);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      messageData
    );

    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Compare signatures (constant-time comparison)
    const valid = expectedSignature === signatureHash;

    return { valid, body };
  } catch (error) {
    console.error('Signature verification error:', error);
    return { valid: false, body: '' };
  }
}

/**
 * Send license email via Resend
 */
async function sendLicenseEmail(
  env: Env,
  email: string,
  customerName: string | undefined,
  licenseFile: LicenseFile,
  licenseId: string
): Promise<void> {
  const licenseJson = JSON.stringify(licenseFile, null, 2);
  const licenseBase64 = btoa(licenseJson);

  const html = `
    <h1>Your Road Forge Pro License</h1>
    <p>Hi${customerName ? ` ${customerName}` : ''},</p>
    <p>Thanks for purchasing Road Forge Pro!</p>

    <h2>Activate Pro Features:</h2>
    <ol>
      <li>Download the license file (attached)</li>
      <li>Open Road Forge</li>
      <li>Go to Settings → Pro</li>
      <li>Click "Import License"</li>
      <li>Select the license file</li>
    </ol>

    <h3>License Details:</h3>
    <ul>
      <li>License ID: <code>${licenseId}</code></li>
      <li>Max devices: 3</li>
      <li>Works offline (no internet required after activation)</li>
    </ul>

    <h3>Manage Your License:</h3>
    <p>Visit <a href="https://roadforge.app/dashboard">your dashboard</a> to view your license, manage devices, or re-download your license file.</p>

    <h3>Need Help?</h3>
    <p>Reply to this email or visit our support page.</p>

    <hr>
    <p><small>License file (copy-paste if attachment doesn't work):</small></p>
    <pre style="background: #f5f5f5; padding: 10px; font-size: 11px; overflow-x: auto;">${licenseJson}</pre>
  `;

  // Send via Resend
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Road Forge <noreply@roadforge.app>',
      to: [email],
      subject: 'Your Road Forge Pro License',
      html,
      attachments: [
        {
          filename: 'roadforge-pro.rflicense',
          content: licenseBase64,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Email send failed: ${error}`);
  }

  console.log('License email sent to:', email);
}

/**
 * Handle Paddle webhook events
 */
export async function handlePaddleWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  // 1. Verify signature
  const { valid, body } = await verifyPaddleSignature(request, env.PADDLE_WEBHOOK_SECRET);

  if (!valid) {
    console.error('Invalid webhook signature');
    return new Response('Invalid signature', { status: 401 });
  }

  // 2. Parse event
  const event: PaddleWebhookEvent = JSON.parse(body);
  console.log('Paddle webhook event:', event.event_type, event.event_id);

  // 3. Handle event based on type
  try {
    switch (event.event_type) {
      case 'transaction.completed':
        return await handleTransactionCompleted(event, env);

      case 'transaction.refunded':
        return await handleTransactionRefunded(event, env);

      default:
        console.log('Unhandled event type:', event.event_type);
        return new Response('OK', { status: 200 });
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    return new Response('Internal error', { status: 500 });
  }
}

/**
 * Handle successful purchase
 */
async function handleTransactionCompleted(
  event: PaddleWebhookEvent,
  env: Env
): Promise<Response> {
  const transaction = event.data;
  const email = transaction.customer.email;
  const transactionId = transaction.id;

  // Check if this transaction was already processed (idempotency)
  const existingLicense = await getLicenseByTransactionId(env, transactionId);
  if (existingLicense) {
    console.log('Transaction already processed:', transactionId);
    return new Response('Already processed', { status: 200 });
  }

  // Verify product is Road Forge Pro
  const hasRoadForgePro = transaction.items.some(item =>
    item.product_id === env.PADDLE_PRODUCT_ID
  );

  if (!hasRoadForgePro) {
    console.log('Transaction does not include Road Forge Pro');
    return new Response('Wrong product', { status: 200 });
  }

  // Generate license
  const licenseId = `paddle_${transactionId}`;
  const emailHash = await hashEmail(email);

  const payload = {
    schema_version: 1,
    license_id: licenseId,
    tier: 'pro' as const,
    issued_at: new Date().toISOString(),
    max_devices: 3,
    customer_email_hash: emailHash,
  };

  // Sign license
  const licenseFile = await signLicense(payload, env.ED25519_PRIVATE_KEY);

  // Store in database
  await createLicense(env, {
    license_id: licenseId,
    status: 'active',
    customer_email: email,
    paddle_transaction_id: transactionId,
  });

  // Extract user_id from passthrough (if user was logged in during purchase)
  let userId: string | undefined;
  try {
    if (transaction.custom_data?.passthrough) {
      const passthrough = JSON.parse(transaction.custom_data.passthrough);
      userId = passthrough.user_id;
    }
  } catch (e) {
    console.log('Could not parse passthrough data:', e);
  }

  // Link license to user if user_id was provided
  if (userId) {
    await linkLicenseToUser(env, userId, licenseId, transactionId);
    console.log('License linked to user:', userId);
  }

  // Send email with license
  await sendLicenseEmail(env, email, transaction.customer.name, licenseFile, licenseId);

  console.log('License issued:', licenseId, 'to', email);

  return new Response('License issued', { status: 200 });
}

/**
 * Handle refund
 */
async function handleTransactionRefunded(
  event: PaddleWebhookEvent,
  env: Env
): Promise<Response> {
  const transactionId = event.data.id;
  const licenseId = `paddle_${transactionId}`;

  // Mark license as revoked
  await updateLicenseStatus(env, licenseId, 'revoked', 'refund');

  console.log('License revoked due to refund:', licenseId);

  return new Response('License revoked', { status: 200 });
}
