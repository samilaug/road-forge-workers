import type { Env, License, Device, User, UserLicense } from './types';

/**
 * Get license by ID
 */
export async function getLicense(
  env: Env,
  licenseId: string
): Promise<License | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM licenses WHERE license_id = ?'
  )
    .bind(licenseId)
    .first<License>();

  return result;
}

/**
 * Get license by Paddle transaction ID (for idempotency)
 */
export async function getLicenseByTransactionId(
  env: Env,
  transactionId: string
): Promise<License | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM licenses WHERE paddle_transaction_id = ?'
  )
    .bind(transactionId)
    .first<License>();

  return result;
}

/**
 * Create license
 */
export async function createLicense(
  env: Env,
  license: Omit<License, 'created_at' | 'updated_at'>
): Promise<void> {
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO licenses (license_id, status, reason, customer_email, paddle_transaction_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      license.license_id,
      license.status,
      license.reason || null,
      license.customer_email,
      license.paddle_transaction_id || null,
      now,
      now
    )
    .run();
}

/**
 * Update license status
 */
export async function updateLicenseStatus(
  env: Env,
  licenseId: string,
  status: 'active' | 'revoked',
  reason?: string
): Promise<void> {
  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE licenses
    SET status = ?, reason = ?, updated_at = ?
    WHERE license_id = ?
  `)
    .bind(status, reason || null, now, licenseId)
    .run();
}

/**
 * Get device count for license
 */
export async function getDeviceCount(
  env: Env,
  licenseId: string
): Promise<number> {
  const result = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM devices WHERE license_id = ?'
  )
    .bind(licenseId)
    .first<{ count: number }>();

  return result?.count || 0;
}

/**
 * Get device by license and device ID
 */
export async function getDevice(
  env: Env,
  licenseId: string,
  deviceId: string
): Promise<Device | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM devices WHERE license_id = ? AND device_id = ?'
  )
    .bind(licenseId, deviceId)
    .first<Device>();

  return result;
}

/**
 * Upsert device (insert or update last_seen)
 */
export async function upsertDevice(
  env: Env,
  device: Omit<Device, 'id' | 'first_seen'>
): Promise<void> {
  const now = new Date().toISOString();

  // Try to update existing device
  const updated = await env.DB.prepare(`
    UPDATE devices
    SET device_name = ?, os = ?, last_seen = ?
    WHERE license_id = ? AND device_id = ?
  `)
    .bind(device.device_name, device.os, now, device.license_id, device.device_id)
    .run();

  // If no rows updated, insert new device
  if (updated.meta.changes === 0) {
    await env.DB.prepare(`
      INSERT INTO devices (license_id, device_id, device_name, os, first_seen, last_seen)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .bind(
        device.license_id,
        device.device_id,
        device.device_name,
        device.os,
        now,
        now
      )
      .run();
  }
}

/**
 * Delete device
 */
export async function deleteDevice(
  env: Env,
  licenseId: string,
  deviceId: string
): Promise<void> {
  await env.DB.prepare(
    'DELETE FROM devices WHERE license_id = ? AND device_id = ?'
  )
    .bind(licenseId, deviceId)
    .run();
}

/**
 * Delete device by ID (for dashboard)
 */
export async function deleteDeviceById(
  env: Env,
  deviceId: number
): Promise<void> {
  await env.DB.prepare(
    'DELETE FROM devices WHERE id = ?'
  )
    .bind(deviceId)
    .run();
}

/**
 * Get all devices for license
 */
export async function getDevices(
  env: Env,
  licenseId: string
): Promise<Device[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM devices WHERE license_id = ? ORDER BY last_seen DESC'
  )
    .bind(licenseId)
    .all<Device>();

  return result.results || [];
}

// ============================================
// User & User License functions (Better Auth)
// ============================================

/**
 * Get user by ID
 */
export async function getUser(
  env: Env,
  userId: string
): Promise<User | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  )
    .bind(userId)
    .first<User>();

  return result;
}

/**
 * Get user by email
 */
export async function getUserByEmail(
  env: Env,
  email: string
): Promise<User | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  )
    .bind(email.toLowerCase())
    .first<User>();

  return result;
}

/**
 * Link license to user
 */
export async function linkLicenseToUser(
  env: Env,
  userId: string,
  licenseId: string,
  paddleTransactionId?: string
): Promise<void> {
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO user_licenses (user_id, license_id, paddle_transaction_id, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (license_id) DO UPDATE SET user_id = excluded.user_id
  `)
    .bind(userId, licenseId, paddleTransactionId || null, now)
    .run();
}

/**
 * Get user's license (via user_licenses link)
 */
export async function getUserLicense(
  env: Env,
  userId: string
): Promise<(License & { device_count: number }) | null> {
  const result = await env.DB.prepare(`
    SELECT l.*, (SELECT COUNT(*) FROM devices d WHERE d.license_id = l.license_id) as device_count
    FROM licenses l
    INNER JOIN user_licenses ul ON l.license_id = ul.license_id
    WHERE ul.user_id = ?
    ORDER BY l.created_at DESC
    LIMIT 1
  `)
    .bind(userId)
    .first<License & { device_count: number }>();

  return result;
}

/**
 * Get user's devices (via user_licenses link)
 */
export async function getUserDevices(
  env: Env,
  userId: string
): Promise<Device[]> {
  const result = await env.DB.prepare(`
    SELECT d.*
    FROM devices d
    INNER JOIN user_licenses ul ON d.license_id = ul.license_id
    WHERE ul.user_id = ?
    ORDER BY d.last_seen DESC
  `)
    .bind(userId)
    .all<Device>();

  return result.results || [];
}

/**
 * Check if device belongs to user (for authorization)
 */
export async function deviceBelongsToUser(
  env: Env,
  userId: string,
  deviceId: number
): Promise<boolean> {
  const result = await env.DB.prepare(`
    SELECT 1
    FROM devices d
    INNER JOIN user_licenses ul ON d.license_id = ul.license_id
    WHERE ul.user_id = ? AND d.id = ?
    LIMIT 1
  `)
    .bind(userId, deviceId)
    .first();

  return result !== null;
}
