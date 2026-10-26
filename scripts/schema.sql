CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('buyer','builder','admin')), disabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_limits (
 key text PRIMARY KEY, attempts int NOT NULL DEFAULT 1, reset_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
 id uuid PRIMARY KEY, seller_id uuid NOT NULL REFERENCES users(id), name text NOT NULL,
 description text NOT NULL, category text NOT NULL, technology text[] NOT NULL DEFAULT '{}',
 features text[] NOT NULL DEFAULT '{}', screenshots text[] NOT NULL DEFAULT '{}',
 price_cents int NOT NULL CHECK(price_cents > 0 AND price_cents <= 10000000),
 repository text NOT NULL, license text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 audit_status text NOT NULL DEFAULT 'not_reviewed' CHECK(audit_status IN ('not_reviewed','reviewed')),
 audit_findings text NOT NULL DEFAULT '', review_note text NOT NULL DEFAULT '',
 reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz,
 artifact_key text, artifact_sha256 text, artifact_name text,
 sample boolean NOT NULL DEFAULT false, accent text NOT NULL DEFAULT 'mint',
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
 id uuid PRIMARY KEY, buyer_id uuid NOT NULL REFERENCES users(id), product_id uuid NOT NULL REFERENCES products(id),
 total_cents int NOT NULL, currency text NOT NULL DEFAULT 'usd',
 license_snapshot text NOT NULL, artifact_key text, artifact_sha256 text, stripe_session_id text UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','refunded')),
 created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_paid_purchase ON orders(buyer_id,product_id) WHERE status='paid';
CREATE TABLE IF NOT EXISTS stripe_events (
 id text PRIMARY KEY, event_type text NOT NULL, processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS requests (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), product_id uuid REFERENCES products(id),
 kind text NOT NULL CHECK(kind IN ('development','design','infrastructure','customization','deployment')),
 description text NOT NULL, status text NOT NULL DEFAULT 'submitted'
 CHECK(status IN ('submitted','in_review','completed','closed')),
 admin_note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_actions (
 id uuid PRIMARY KEY, admin_id uuid NOT NULL REFERENCES users(id), action text NOT NULL,
 target_id uuid NOT NULL, details text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS artifact_key text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS artifact_sha256 text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
