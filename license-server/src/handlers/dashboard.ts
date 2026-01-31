import type { Context } from 'hono';
import type { Env, DashboardLicense, DashboardDevice, LicenseFile } from '../types';
import { getSession } from '../auth';
import * as db from '../db';
import { signLicense, hashEmail } from '../crypto';

/**
 * Middleware to require authentication
 */
export async function requireAuth(c: Context<{ Bindings: Env }>) {
  const session = await getSession(c.req.raw, c.env);

  if (!session?.user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return session;
}

/**
 * GET /dashboard/license
 * Get user's license details
 */
export async function handleGetLicense(c: Context<{ Bindings: Env }>) {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const license = await db.getUserLicense(c.env, session.user.id);

  if (!license) {
    return c.json({ license: null });
  }

  const response: DashboardLicense = {
    license_id: license.license_id,
    status: license.status,
    reason: license.reason,
    created_at: license.created_at,
    device_count: license.device_count,
    max_devices: 3,
  };

  return c.json({ license: response });
}

/**
 * GET /dashboard/devices
 * Get user's active devices
 */
export async function handleGetDevices(c: Context<{ Bindings: Env }>) {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const devices = await db.getUserDevices(c.env, session.user.id);

  const response: DashboardDevice[] = devices.map(d => ({
    id: d.id,
    device_id: d.device_id,
    device_name: d.device_name,
    os: d.os,
    first_seen: d.first_seen,
    last_seen: d.last_seen,
  }));

  return c.json({ devices: response });
}

/**
 * POST /dashboard/devices/:id/deactivate
 * Deactivate a device
 */
export async function handleDeactivateDevice(c: Context<{ Bindings: Env }>) {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const deviceIdParam = c.req.param('id');
  const deviceId = parseInt(deviceIdParam, 10);

  if (isNaN(deviceId)) {
    return c.json({ error: 'Invalid device ID' }, 400);
  }

  // Verify device belongs to user
  const belongs = await db.deviceBelongsToUser(c.env, session.user.id, deviceId);

  if (!belongs) {
    return c.json({ error: 'Device not found' }, 404);
  }

  // Delete device
  await db.deleteDeviceById(c.env, deviceId);

  // Get updated device list
  const devices = await db.getUserDevices(c.env, session.user.id);

  return c.json({
    success: true,
    device_count: devices.length,
  });
}

/**
 * GET /dashboard/license/download
 * Re-download license file
 */
export async function handleDownloadLicense(c: Context<{ Bindings: Env }>) {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const license = await db.getUserLicense(c.env, session.user.id);

  if (!license) {
    return c.json({ error: 'No license found' }, 404);
  }

  if (license.status !== 'active') {
    return c.json({ error: 'License is not active' }, 403);
  }

  // Generate fresh license file
  const emailHash = await hashEmail(license.customer_email);

  const payload = {
    schema_version: 1,
    license_id: license.license_id,
    tier: 'pro' as const,
    issued_at: license.created_at, // Use original issue date
    max_devices: 3,
    customer_email_hash: emailHash,
  };

  const licenseFile: LicenseFile = await signLicense(payload, c.env.ED25519_PRIVATE_KEY);

  // Return as downloadable file
  const licenseJson = JSON.stringify(licenseFile, null, 2);

  return new Response(licenseJson, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="roadforge-pro.rflicense"',
    },
  });
}

/**
 * GET /dashboard/profile
 * Get user profile info
 */
export async function handleGetProfile(c: Context<{ Bindings: Env }>) {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  return c.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      email_verified: session.user.emailVerified,
    },
  });
}
