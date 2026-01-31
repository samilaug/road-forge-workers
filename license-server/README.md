# Road Forge License Server

Cloudflare Worker for handling Pro license sales via Paddle, device activation, and license validation.

## Architecture

- **Runtime**: Cloudflare Workers (serverless)
- **Database**: D1 SQLite (license + device tracking)
- **Payment**: Paddle webhooks
- **Email**: Resend API
- **Crypto**: Ed25519 signing (Web Crypto API)
- **Auth**: Better Auth (email/password)

## Endpoints

| Endpoint | Method | Purpose | Called By |
|----------|--------|---------|-----------|
| `/webhooks/paddle` | POST | Paddle webhook handler | Paddle servers |
| `/licenses/activate` | POST | Device activation (3-device limit) | Tauri app |
| `/licenses/validate` | POST | License validation | Tauri app (startup) |
| `/devices/deactivate` | POST | Device deactivation | Tauri app |
| `/auth/*` | ALL | Better Auth endpoints | Website |
| `/dashboard/*` | ALL | Dashboard API | Website |

## Setup

### 1. Install Dependencies

```bash
cd license-server
bun install
```

### 2. Generate Ed25519 Keypair

```bash
# Generate private key (64 hex chars)
node -e "crypto.subtle.generateKey('Ed25519', true, ['sign']).then(k => crypto.subtle.exportKey('raw', k.privateKey)).then(buf => console.log(Buffer.from(buf).toString('hex')))"

# Save output as ED25519_PRIVATE_KEY secret
```

**Alternative (using OpenSSL):**
```bash
# Generate keypair
openssl genpkey -algorithm Ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem

# Extract private key bytes (skip PEM headers, convert to hex)
openssl pkey -in private.pem -text -noout
# Copy the "priv:" section (32 bytes) as hex
```

### 3. Create D1 Database

```bash
# Create database
wrangler d1 create roadforge_licenses

# Copy database_id from output, update wrangler.toml:
# database_id = "your-database-id-here"

# Apply migrations
wrangler d1 migrations apply roadforge_licenses --remote
```

### 4. Set Secrets

```bash
# Ed25519 private key (from step 2)
wrangler secret put ED25519_PRIVATE_KEY

# Paddle webhook secret (from Paddle dashboard)
wrangler secret put PADDLE_WEBHOOK_SECRET

# Paddle product ID (from Paddle dashboard)
wrangler secret put PADDLE_PRODUCT_ID

# Resend API key (from resend.com)
wrangler secret put RESEND_API_KEY

# Better Auth secret (generate with: openssl rand -hex 32)
wrangler secret put BETTER_AUTH_SECRET
```

### 5. Deploy Worker

```bash
# Deploy to production
bun run deploy

# Or test locally
bun run dev
```

### 6. Configure Paddle Webhook

1. Go to Paddle Dashboard → Developer Tools → Notifications
2. Add webhook URL: `https://api.roadforge.app/webhooks/paddle`
3. Enable events: `transaction.completed`, `transaction.refunded`
4. Copy webhook secret → use in step 4 above

### 7. Create Paddle Product

1. Go to Paddle Dashboard → Catalog → Products
2. Create product:
   - Name: "Road Forge Pro"
   - Price: $19 USD (one-time)
   - Tax: Automatic (Paddle handles globally)
3. Copy Product ID → use in step 4 above

## Database Schema

**licenses**
- `license_id` (PK): `paddle_{transaction_id}`
- `status`: `active` | `revoked`
- `reason`: Revocation reason (e.g., `refund`, `chargeback`)
- `customer_email`: Customer email (for support)
- `paddle_transaction_id`: Paddle transaction ID (for idempotency)

**devices**
- `id` (PK): Auto-increment
- `license_id` (FK): Links to licenses table
- `device_id`: SHA256 hash of hardware ID
- `device_name`: User-friendly name (e.g., "John's Laptop")
- `os`: Operating system (e.g., "Windows 11")
- `first_seen`: First activation timestamp
- `last_seen`: Last validation timestamp

**users** (Better Auth)
- `id` (PK): UUID
- `email`: User email (unique)
- `email_verified`: Email verification status
- `name`: Display name

**user_licenses**
- Links users to their licenses (many-to-one)
- Created when purchase includes user_id in passthrough

## Security

- **Ed25519 signatures**: Prevents license tampering
- **HMAC webhook verification**: Ensures webhooks are from Paddle
- **Device limit**: Hard cap at 3 devices (server-enforced)
- **Email hashing**: Customer emails hashed (SHA-256) in license files
- **No PII in logs**: Device IDs are hashed client-side
- **Secure sessions**: Better Auth with HTTP-only cookies

## Monitoring

```bash
# View real-time logs
bun run tail

# Check D1 database
wrangler d1 execute roadforge_licenses --remote --command "SELECT * FROM licenses"
```
