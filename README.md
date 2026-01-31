# Road Forge Workers

Cloudflare Workers for the Road Forge ecosystem.

## Workers

### license-server

License management and authentication server for Road Forge Pro.

**Features:**
- Paddle webhook handling (purchase, refund)
- License issuance and Ed25519 signing
- Device activation/deactivation
- License validation
- User authentication (Better Auth)
- Dashboard API

## Development

```bash
# Install dependencies
cd license-server && bun install

# Run locally
bun run dev

# Deploy to Cloudflare
bun run deploy

# Apply database migrations
bun run db:migrate
```

## Environment Variables

Set via `wrangler secret put`:

- `ED25519_PRIVATE_KEY` - Private key for license signing
- `PADDLE_WEBHOOK_SECRET` - Paddle webhook verification secret
- `PADDLE_PRODUCT_ID` - Paddle product ID for Road Forge Pro
- `RESEND_API_KEY` - Resend API key for email delivery
- `BETTER_AUTH_SECRET` - Secret for Better Auth session encryption

## Database

Uses Cloudflare D1. Create the database first:

```bash
wrangler d1 create roadforge_licenses
```

Then update `wrangler.toml` with the database ID.
