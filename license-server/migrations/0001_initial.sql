-- Road Forge Pro Licensing Database Schema

-- Licenses table
CREATE TABLE IF NOT EXISTS licenses (
    license_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'revoked'
    reason TEXT,                             -- 'refund' | 'chargeback' | NULL
    customer_email TEXT NOT NULL,
    paddle_transaction_id TEXT,              -- Paddle transaction ID
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_licenses_status ON licenses(status);
CREATE INDEX idx_licenses_paddle_txn ON licenses(paddle_transaction_id);

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    os TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    FOREIGN KEY (license_id) REFERENCES licenses(license_id) ON DELETE CASCADE,
    UNIQUE(license_id, device_id)
);

CREATE INDEX idx_devices_license ON devices(license_id);
CREATE INDEX idx_devices_last_seen ON devices(last_seen);
