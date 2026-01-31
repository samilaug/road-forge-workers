import type { Env, ValidateRequest } from '../types';
import * as db from '../db';

/**
 * Handle license validation (checks if license is active and device is registered)
 */
export async function handleValidate(
  request: ValidateRequest,
  env: Env
): Promise<Response> {
  const { license_id, device_id } = request;

  // 1. Check license exists and is active
  const license = await db.getLicense(env, license_id);

  if (!license) {
    return Response.json(
      { valid: false, status: 'not_found', reason: 'License not found' },
      { status: 404 }
    );
  }

  if (license.status !== 'active') {
    return Response.json({
      valid: false,
      status: license.status,
      reason: license.reason || 'License not active',
    });
  }

  // 2. Check if device is registered
  const device = await db.getDevice(env, license_id, device_id);

  if (!device) {
    return Response.json({
      valid: false,
      status: 'device_not_registered',
      reason: 'Device not activated for this license',
    });
  }

  // 3. Update last_seen timestamp
  await db.upsertDevice(env, {
    license_id,
    device_id,
    device_name: device.device_name,
    os: device.os,
    last_seen: new Date().toISOString(),
  });

  // 4. Get device count
  const deviceCount = await db.getDeviceCount(env, license_id);

  return Response.json({
    valid: true,
    status: 'active',
    device_count: deviceCount,
  });
}
