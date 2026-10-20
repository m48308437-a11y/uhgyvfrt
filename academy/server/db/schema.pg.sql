-- اسکیمای PostgreSQL آکادمی (idempotent: اجرای چندباره امن است)
-- قیمت‌ها به «تومان» و به صورت عدد صحیح ذخیره می‌شوند. زمان‌ها timestamptz هستند.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  phone text NOT NULL UNIQUE CHECK (phone ~ '^09[0-9]{9}$'),
  email text UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  grade text,
  phone_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,                       -- SHA-256 توکن؛ خود توکن هرگز ذخیره نمی‌شود
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ip text, user_agent text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid PRIMARY KEY,
  phone text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('verify','reset')),
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_phone_idx ON otp_codes(phone, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text NOT NULL DEFAULT 'course' CHECK (kind IN ('course','package')),
  title text NOT NULL,
  short_desc text NOT NULL DEFAULT '',
  full_desc text NOT NULL DEFAULT '',
  cover_url text,
  instructor text NOT NULL DEFAULT '',
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'all' CHECK (level IN ('beginner','intermediate','advanced','all')),
  badge text,
  price int NOT NULL CHECK (price >= 0),
  discount_price int CHECK (discount_price IS NULL OR (discount_price >= 0 AND discount_price <= price)),
  discount_expires_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','inactive','archived')),
  featured boolean NOT NULL DEFAULT false,
  duration_text text,
  prerequisites text NOT NULL DEFAULT '[]',
  benefits text NOT NULL DEFAULT '[]',
  formula_accent text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chapters (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chapters_course_idx ON chapters(course_id, sort_order);

CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY,
  storage_provider text NOT NULL CHECK (storage_provider IN ('local','s3')),
  storage_key text NOT NULL UNIQUE,
  upload_id text,
  original_name text NOT NULL,
  mime text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  part_size int NOT NULL,
  duration_seconds int,
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','processing','ready','failed')),
  error text,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lessons (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  duration_seconds int NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  access text NOT NULL DEFAULT 'paid' CHECK (access IN ('free','preview','paid')),
  published boolean NOT NULL DEFAULT true,
  video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
  math_topic text,
  formula text,
  key_points text NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lessons_chapter_idx ON lessons(chapter_id, sort_order);
CREATE INDEX IF NOT EXISTS lessons_course_idx ON lessons(course_id);

CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{3,32}$'),
  type text NOT NULL CHECK (type IN ('percent','fixed')),
  value int NOT NULL CHECK (value > 0),
  max_usage int NOT NULL CHECK (max_usage > 0),
  used_count int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (type <> 'percent' OR value <= 100),
  CHECK (used_count >= 0 AND used_count <= max_usage)
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY,
  order_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled','refunded')),
  subtotal int NOT NULL CHECK (subtotal >= 0),
  discount_amount int NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  final_amount int NOT NULL CHECK (final_amount >= 0),
  coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL,
  coupon_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  title_snapshot text NOT NULL,
  list_price int NOT NULL,
  unit_price int NOT NULL,
  UNIQUE (order_id, course_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  gateway text NOT NULL CHECK (gateway IN ('zarinpal','free')),
  authority text UNIQUE,
  amount_rial bigint NOT NULL CHECK (amount_rial >= 0),
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','verified','failed','cancelled','refunded')),
  ref_id text,
  card_pan text,
  gateway_code int,
  gateway_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments(order_id);

CREATE TABLE IF NOT EXISTS enrollments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('purchase','manual','free')),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position_seconds int NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  subject text NOT NULL,
  message text NOT NULL,
  reply text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  replied_at timestamptz
);

CREATE TABLE IF NOT EXISTS articles (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  category text,
  grade text,
  read_time text,
  excerpt text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  entity_id text,
  details text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS error_log (
  id uuid PRIMARY KEY,
  level text NOT NULL,
  source text NOT NULL,
  message text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS error_created_idx ON error_log(created_at DESC);
