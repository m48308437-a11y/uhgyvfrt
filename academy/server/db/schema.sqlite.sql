-- اسکیمای SQLite (فقط توسعه و تست) — معادل آکادمی (idempotent: اجرای چندباره امن است)
-- قیمت‌ها به «تومان» و به صورت عدد صحیح ذخیره می‌شوند. زمان‌ها text هستند.

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  phone text NOT NULL UNIQUE CHECK (length(phone) = 11 AND phone GLOB '09[0-9]*'),
  email text UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  grade text,
  phone_verified_at text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,                       -- SHA-256 توکن؛ خود توکن هرگز ذخیره نمی‌شود
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at text NOT NULL,
  ip text, user_agent text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS otp_codes (
  id text PRIMARY KEY,
  phone text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('verify','reset')),
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at text NOT NULL,
  consumed_at text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS otp_phone_idx ON otp_codes(phone, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS courses (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug NOT GLOB '*[^a-z0-9-]*'),
  kind text NOT NULL DEFAULT 'course' CHECK (kind IN ('course','package')),
  title text NOT NULL,
  short_desc text NOT NULL DEFAULT '',
  full_desc text NOT NULL DEFAULT '',
  cover_url text,
  instructor text NOT NULL DEFAULT '',
  category_id text REFERENCES categories(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'all' CHECK (level IN ('beginner','intermediate','advanced','all')),
  badge text,
  price int NOT NULL CHECK (price >= 0),
  discount_price int CHECK (discount_price IS NULL OR (discount_price >= 0 AND discount_price <= price)),
  discount_expires_at text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','inactive','archived')),
  featured integer NOT NULL DEFAULT 0,
  duration_text text,
  prerequisites text NOT NULL DEFAULT '[]',
  benefits text NOT NULL DEFAULT '[]',
  formula_accent text,
  sort_order int NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS chapters (
  id text PRIMARY KEY,
  course_id text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chapters_course_idx ON chapters(course_id, sort_order);

CREATE TABLE IF NOT EXISTS videos (
  id text PRIMARY KEY,
  storage_provider text NOT NULL CHECK (storage_provider IN ('local','s3')),
  storage_key text NOT NULL UNIQUE,
  upload_id text,
  original_name text NOT NULL,
  mime text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  part_size int NOT NULL,
  duration_seconds int,
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','processing','ready','failed')),
  error text,
  uploaded_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS lessons (
  id text PRIMARY KEY,
  course_id text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  chapter_id text NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  duration_seconds int NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  access text NOT NULL DEFAULT 'paid' CHECK (access IN ('free','preview','paid')),
  published integer NOT NULL DEFAULT 1,
  video_id text REFERENCES videos(id) ON DELETE SET NULL,
  math_topic text,
  formula text,
  key_points text NOT NULL DEFAULT '[]',
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS lessons_chapter_idx ON lessons(chapter_id, sort_order);
CREATE INDEX IF NOT EXISTS lessons_course_idx ON lessons(course_id);

CREATE TABLE IF NOT EXISTS coupons (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (length(code) BETWEEN 3 AND 32 AND code NOT GLOB '*[^A-Z0-9_-]*'),
  type text NOT NULL CHECK (type IN ('percent','fixed')),
  value int NOT NULL CHECK (value > 0),
  max_usage int NOT NULL CHECK (max_usage > 0),
  used_count int NOT NULL DEFAULT 0,
  expires_at text,
  active integer NOT NULL DEFAULT 1,
  description text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (type <> 'percent' OR value <= 100),
  CHECK (used_count >= 0 AND used_count <= max_usage)
);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  order_number text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled','refunded')),
  subtotal int NOT NULL CHECK (subtotal >= 0),
  discount_amount int NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  final_amount int NOT NULL CHECK (final_amount >= 0),
  coupon_id text REFERENCES coupons(id) ON DELETE SET NULL,
  coupon_code text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  paid_at text
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  course_id text NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  title_snapshot text NOT NULL,
  list_price int NOT NULL,
  unit_price int NOT NULL,
  UNIQUE (order_id, course_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  gateway text NOT NULL CHECK (gateway IN ('zarinpal','free')),
  authority text UNIQUE,
  amount_rial integer NOT NULL CHECK (amount_rial >= 0),
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','verified','failed','cancelled','refunded')),
  ref_id text,
  card_pan text,
  gateway_code int,
  gateway_message text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  verified_at text
);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments(order_id);

CREATE TABLE IF NOT EXISTS enrollments (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id text NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('purchase','manual','free')),
  order_id text REFERENCES orders(id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at text,
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position_seconds int NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  completed integer NOT NULL DEFAULT 0,
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id text REFERENCES courses(id) ON DELETE SET NULL,
  subject text NOT NULL,
  message text NOT NULL,
  reply text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  replied_at text
);

CREATE TABLE IF NOT EXISTS articles (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  category text,
  grade text,
  read_time text,
  excerpt text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  published integer NOT NULL DEFAULT 1,
  published_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS site_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  entity_id text,
  details text,
  ip text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS error_log (
  id text PRIMARY KEY,
  level text NOT NULL,
  source text NOT NULL,
  message text NOT NULL,
  details text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS error_created_idx ON error_log(created_at DESC);
