// Cloudflare Worker environment bindings
export interface Env {
  DB: D1Database;
  ED25519_PRIVATE_KEY: string;
  PADDLE_WEBHOOK_SECRET: string;
  PADDLE_PRODUCT_ID: string;
  RESEND_API_KEY: string;
  BETTER_AUTH_SECRET: string;
}

// License payload (signed by server)
export interface LicensePayload {
  schema_version: number;
  license_id: string;
  tier: 'free' | 'pro';
  issued_at: string; // ISO-8601
  max_devices: number;
  customer_email_hash: string;
}

// License file (payload + signature)
export interface LicenseFile {
  payload: LicensePayload;
  signature: string; // Base64-encoded Ed25519 signature
}

// Database models
export interface License {
  license_id: string;
  status: 'active' | 'revoked';
  reason?: string;
  customer_email: string;
  paddle_transaction_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: number;
  license_id: string;
  device_id: string;
  device_name: string;
  os: string;
  first_seen: string;
  last_seen: string;
}

// User models (Better Auth)
export interface User {
  id: string;
  name?: string;
  email: string;
  email_verified: boolean;
  image?: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface UserLicense {
  id: number;
  user_id: string;
  license_id: string;
  paddle_transaction_id?: string;
  created_at: string;
}

// Paddle webhook event structure
export interface PaddleWebhookEvent {
  event_id: string;
  event_type: string;
  occurred_at: string;
  notification_id: string;
  data: {
    id: string; // transaction_id
    status: string;
    customer_id: string;
    custom_data?: {
      passthrough?: string; // JSON string with user_id
    };
    items: Array<{
      price_id: string;
      product_id: string;
      quantity: number;
    }>;
    customer: {
      email: string;
      name?: string;
    };
    created_at: string;
    updated_at: string;
  };
}

// API request/response types
export interface ActivateRequest {
  license_id: string;
  device_id: string;
  device_name: string;
  os: string;
}

export interface ActivateResponse {
  success: boolean;
  device_count: number;
  message?: string;
}

export interface ValidateRequest {
  license_id: string;
  device_id: string;
}

export interface ValidateResponse {
  valid: boolean;
  status: string;
  reason?: string;
}

export interface DeactivateRequest {
  license_id: string;
  device_id: string;
}

// Dashboard types
export interface DashboardLicense {
  license_id: string;
  status: 'active' | 'revoked';
  reason?: string;
  created_at: string;
  device_count: number;
  max_devices: number;
}

export interface DashboardDevice {
  id: number;
  device_id: string;
  device_name: string;
  os: string;
  first_seen: string;
  last_seen: string;
}
