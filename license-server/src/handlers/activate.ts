import type { Env, ActivateRequest } from '../types';
import * as db from '../db';

/**
 * Handle license activation (device limit enforcement)
 */
export async function handleActivate(
  request: ActivateRequest,
  env: Env
): Promise<Response> {
  const { license_id, device_id, device_name, os } = request;

  // 1. Check license exists and is active
  const license = await db.getLicense(env, license_id);

  if (!license) {
    return Response.json(
      { error: 'License not found' },
      { status: 404 }
    );
  }

  if (license.status !== 'active') {
    return Response.json(
      { error: `License ${license.status}: ${license.reason || 'unknown'}` },
      { status: 403 }
    );
  }

  // 2. Check if device already activated
  const existingDevice = await db.getDevice(env, license_id, device_id);

  if (existingDevice) {
    // Update last_seen
    await db.upsertDevice(env, {
      license_id,
      device_id,
      device_name,
      os,
      last_seen: new Date().toISOString(),
    });

    const deviceCount = await db.getDeviceCount(env, license_id);

    return Response.json({
      success: true,
      device_count: deviceCount,
      message: 'Device already activated',
    });
  }

  // 3. Check device limit
  const deviceCount = await db.getDeviceCount(env, license_id);
  const maxDevices = 3;

  if (deviceCount >= maxDevices) {
    return Response.json(
      {
        error: `Maximum ${maxDevices} devices reached. Deactivate old device first.`,
        device_count: deviceCount,
      },
      { status: 403 }
    );
  }

  // 4. Activate device
  await db.upsertDevice(env, {
    license_id,
    device_id,
    device_name,
    os,
    last_seen: new Date().toISOString(),
  });

  const newDeviceCount = await db.getDeviceCount(env, license_id);

  console.log(
    `Device activated: ${device_id} (${device_name}) for license ${license_id} (${newDeviceCount}/${maxDevices})`
  );

  return Response.json({
    success: true,
    device_count: newDeviceCount,
  });
}
