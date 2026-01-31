import type { Env, DeactivateRequest } from '../types';
import * as db from '../db';

/**
 * Handle device deactivation (frees up device slot)
 */
export async function handleDeactivate(
  request: DeactivateRequest,
  env: Env
): Promise<Response> {
  const { license_id, device_id } = request;

  // 1. Check license exists
  const license = await db.getLicense(env, license_id);

  if (!license) {
    return Response.json(
      { error: 'License not found' },
      { status: 404 }
    );
  }

  // 2. Check device exists
  const device = await db.getDevice(env, license_id, device_id);

  if (!device) {
    return Response.json(
      { error: 'Device not found for this license' },
      { status: 404 }
    );
  }

  // 3. Delete device
  await db.deleteDevice(env, license_id, device_id);

  const newDeviceCount = await db.getDeviceCount(env, license_id);

  console.log(
    `Device deactivated: ${device_id} (${device.device_name}) for license ${license_id} (${newDeviceCount}/3 remaining)`
  );

  return Response.json({
    success: true,
    device_count: newDeviceCount,
  });
}
