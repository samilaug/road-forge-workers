import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type {
  Env,
  ActivateRequest,
  ValidateRequest,
  DeactivateRequest,
} from './types';
import { createAuth } from './auth';
import { handlePaddleWebhook } from './handlers/paddle';
import { handleActivate } from './handlers/activate';
import { handleValidate } from './handlers/validate';
import { handleDeactivate } from './handlers/deactivate';
import {
  handleGetLicense,
  handleGetDevices,
  handleDeactivateDevice,
  handleDownloadLicense,
  handleGetProfile,
} from './handlers/dashboard';

const app = new Hono<{ Bindings: Env }>();

// CORS middleware (allow requests from Tauri app and website)
app.use('/*', cors({
  origin: ['https://roadforge.app', 'http://localhost:3000', 'tauri://localhost'],
  allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Paddle-Signature', 'Authorization'],
  credentials: true,
}));

// Health check
app.get('/', (c) => {
  return c.json({ status: 'ok', service: 'Road Forge License Server' });
});

// ===========================================
// Better Auth routes (mounted at /auth/*)
// ===========================================
app.all('/auth/*', async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// ===========================================
// Paddle webhook
// ===========================================
app.post('/webhooks/paddle', async (c) => {
  try {
    return await handlePaddleWebhook(c.req.raw, c.env);
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ error: 'Internal error' }, 500);
  }
});

// ===========================================
// License endpoints (called by Tauri app)
// ===========================================
app.post('/licenses/activate', async (c) => {
  try {
    const body = await c.req.json<ActivateRequest>();
    return await handleActivate(body, c.env);
  } catch (error) {
    console.error('Activate error:', error);
    return c.json({ error: 'Invalid request' }, 400);
  }
});

app.post('/licenses/validate', async (c) => {
  try {
    const body = await c.req.json<ValidateRequest>();
    return await handleValidate(body, c.env);
  } catch (error) {
    console.error('Validate error:', error);
    return c.json({ error: 'Invalid request' }, 400);
  }
});

app.post('/devices/deactivate', async (c) => {
  try {
    const body = await c.req.json<DeactivateRequest>();
    return await handleDeactivate(body, c.env);
  } catch (error) {
    console.error('Deactivate error:', error);
    return c.json({ error: 'Invalid request' }, 400);
  }
});

// ===========================================
// Dashboard endpoints (protected, called by website)
// ===========================================
app.get('/dashboard/profile', handleGetProfile);
app.get('/dashboard/license', handleGetLicense);
app.get('/dashboard/devices', handleGetDevices);
app.post('/dashboard/devices/:id/deactivate', handleDeactivateDevice);
app.get('/dashboard/license/download', handleDownloadLicense);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

export default app;
