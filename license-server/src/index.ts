import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type {
  Env,
  ActivateRequest,
  ValidateRequest,
  DeactivateRequest,
} from './types';
import { handlePaddleWebhook } from './handlers/paddle';
import { handleActivate } from './handlers/activate';
import { handleValidate } from './handlers/validate';
import { handleDeactivate } from './handlers/deactivate';

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

// Paddle webhook endpoint (called by Paddle on purchases/refunds)
app.post('/webhooks/paddle', async (c) => {
  try {
    return await handlePaddleWebhook(c.req.raw, c.env);
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ error: 'Internal error' }, 500);
  }
});

// License activation endpoint (called by app on license import)
app.post('/licenses/activate', async (c) => {
  try {
    const body = await c.req.json<ActivateRequest>();
    return await handleActivate(body, c.env);
  } catch (error) {
    console.error('Activate error:', error);
    return c.json({ error: 'Invalid request' }, 400);
  }
});

// License validation endpoint (called by app on startup)
app.post('/licenses/validate', async (c) => {
  try {
    const body = await c.req.json<ValidateRequest>();
    return await handleValidate(body, c.env);
  } catch (error) {
    console.error('Validate error:', error);
    return c.json({ error: 'Invalid request' }, 400);
  }
});

// Device deactivation endpoint (called by app to free up device slot)
app.post('/devices/deactivate', async (c) => {
  try {
    const body = await c.req.json<DeactivateRequest>();
    return await handleDeactivate(body, c.env);
  } catch (error) {
    console.error('Deactivate error:', error);
    return c.json({ error: 'Invalid request' }, 400);
  }
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

export default app;
