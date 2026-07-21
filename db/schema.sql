-- ============================================================
--  XUEBOT — Tea Shop Backend Schema (SQLite)
--  หน่วยเงิน: บาท (REAL)  |  วันที่: ISO-8601 text "YYYY-MM-DD HH:MM:SS"
--  หลักคิด: ทุกอย่างที่ "ซื้อได้" อยู่ในตาราง items ตัวเดียว
--           ซื้อของ 1 ครั้ง -> รายจ่าย + สต๊อก + ต้นทุน อัปเดตพร้อมกัน
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- 👥 คน / ทีม -------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id               INTEGER PRIMARY KEY,
  discord_user_id  TEXT UNIQUE NOT NULL,          -- id ของ user ใน Discord
  name             TEXT NOT NULL,                  -- "ภู", "เพื่อน"
  role             TEXT NOT NULL DEFAULT 'staff',  -- owner / partner / staff
  can_approve      INTEGER NOT NULL DEFAULT 0,     -- 1 = อนุมัติเบิกเงินได้
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 🏭 ซัพพลายเออร์ ---------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  contact_line   TEXT,
  contact_phone  TEXT,
  address        TEXT,
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 📦 items = วัตถุดิบ + packaging + ของใช้ ---------
--  base_unit = หน่วยที่ "ใช้" ในสูตร (g / ml / ชิ้น)
--  current_cost = ต้นทุนต่อ base_unit (อัปเดตอัตโนมัติจากการซื้อล่าสุด)
CREATE TABLE IF NOT EXISTS items (
  id                  INTEGER PRIMARY KEY,
  name                TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'ingredient', -- ingredient / packaging / supply
  category            TEXT,                                -- ชา / นม / ท็อปปิ้ง / แก้ว / ...
  base_unit           TEXT NOT NULL,                       -- g / ml / ชิ้น
  current_cost        REAL NOT NULL DEFAULT 0,             -- ต่อ base_unit
  stock_qty           REAL NOT NULL DEFAULT 0,             -- cache จาก stock_movements
  reorder_level       REAL NOT NULL DEFAULT 0,             -- ต่ำกว่านี้เตือน
  default_supplier_id INTEGER REFERENCES suppliers(id),
  active              INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 🏷️ ราคาจากซัพแต่ละเจ้า (ไว้เทียบราคา) -----------
--  เทียบราคา = price / qty_base_units  (normalize ทุกเจ้าให้เทียบตรงๆ)
CREATE TABLE IF NOT EXISTS supplier_prices (
  id             INTEGER PRIMARY KEY,
  supplier_id    INTEGER NOT NULL REFERENCES suppliers(id),
  item_id        INTEGER NOT NULL REFERENCES items(id),
  pack_desc      TEXT,                 -- "ถุง 1 กก." / "แพ็ค 50 ใบ"
  price          REAL NOT NULL,        -- ราคาต่อ pack
  qty_base_units REAL NOT NULL,        -- pack นั้นได้กี่ base_unit (เช่น 1000 g)
  min_order      REAL,
  note           TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 💸 รายจ่าย ---------------------------------------
CREATE TABLE IF NOT EXISTS expense_categories (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,                 -- วัตถุดิบ / อุปกรณ์ / ค่าเช่า / การตลาด
  type  TEXT NOT NULL DEFAULT 'variable' -- fixed / variable
);

CREATE TABLE IF NOT EXISTS slips (
  id              INTEGER PRIMARY KEY,
  image_url       TEXT,
  amount          REAL,
  sender_name     TEXT,
  receiver_name   TEXT,
  bank            TEXT,
  transaction_ref TEXT UNIQUE,         -- กันสลิปซ้ำ
  trans_datetime  TEXT,
  raw_data        TEXT,                -- json ดิบจาก API/OCR
  verified        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id             INTEGER PRIMARY KEY,
  date           TEXT NOT NULL,        -- วันที่จ่าย (YYYY-MM-DD)
  category_id    INTEGER REFERENCES expense_categories(id),
  description    TEXT,
  amount         REAL NOT NULL,
  payment_method TEXT DEFAULT 'transfer', -- transfer / cash / card
  paid_by        INTEGER REFERENCES members(id),   -- ใครสำรองจ่าย
  slip_id        INTEGER REFERENCES slips(id),
  created_by     INTEGER REFERENCES members(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- รายการย่อยใน expense ที่เป็น "การซื้อของเข้าร้าน" -> ป้อนสต๊อก+ต้นทุน
CREATE TABLE IF NOT EXISTS purchase_items (
  id             INTEGER PRIMARY KEY,
  expense_id     INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  item_id        INTEGER NOT NULL REFERENCES items(id),
  supplier_id    INTEGER REFERENCES suppliers(id),
  pack_desc      TEXT,                 -- "ถุง 1 กก." (ไว้ดูย้อนหลัง)
  qty_base_units REAL NOT NULL,        -- แปลงเป็น base_unit แล้ว (เช่น 1000 g)
  total_price    REAL NOT NULL         -- ราค่ารวมของรายการนี้
);

-- ---------- 📊 สต๊อก (ทุกการขยับของวัตถุดิบ) ----------------
CREATE TABLE IF NOT EXISTS stock_movements (
  id             INTEGER PRIMARY KEY,
  item_id        INTEGER NOT NULL REFERENCES items(id),
  type           TEXT NOT NULL,        -- in / out / adjust / waste
  qty_base_units REAL NOT NULL,        -- +/- (in เป็นบวก, out เป็นลบ)
  ref_type       TEXT,                 -- purchase / sale / manual
  ref_id         INTEGER,
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 🧪 สูตรชา ----------------------------------------
CREATE TABLE IF NOT EXISTS recipes (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,        -- "ชานมหอมหมื่นลี้"
  category        TEXT,                 -- ชานม / ชาผลไม้ / ชาเพียว / พิเศษ
  current_version INTEGER REFERENCES recipe_versions(id), -- version ที่ใช้จริง
  status          TEXT NOT NULL DEFAULT 'testing',        -- testing / approved / retired
  notes           TEXT,
  created_by      INTEGER REFERENCES members(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS recipe_versions (
  id           INTEGER PRIMARY KEY,
  recipe_id    INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version_no   INTEGER NOT NULL,       -- 1, 2, 3...
  instructions TEXT,                   -- ขั้นตอนการชง
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ส่วนผสมของสูตร (ใส่ได้ทั้งผงชา และ แก้ว/ฝา/หลอด)
--  size = NULL แปลว่าใช้เท่ากันทุกไซซ์
CREATE TABLE IF NOT EXISTS recipe_items (
  id                INTEGER PRIMARY KEY,
  recipe_version_id INTEGER NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  item_id           INTEGER NOT NULL REFERENCES items(id),
  size              TEXT,               -- S / M / L / NULL
  quantity          REAL NOT NULL,      -- เช่น 25
  unit              TEXT                -- g (ควรตรงกับ base_unit ของ item)
);

-- log การชิม/ฟีดแบ็กแต่ละ version
CREATE TABLE IF NOT EXISTS tasting_notes (
  id                INTEGER PRIMARY KEY,
  recipe_version_id INTEGER NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  taster            INTEGER REFERENCES members(id),
  rating            INTEGER,            -- 1-5
  sweetness         INTEGER,            -- แยกแกนได้ยิ่งดี
  body              INTEGER,
  aroma             INTEGER,
  feedback          TEXT,
  tasted_at         TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 🧮 เมนูขาย + snapshot ต้นทุน --------------------
CREATE TABLE IF NOT EXISTS products (
  id         INTEGER PRIMARY KEY,
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id),
  name       TEXT NOT NULL,             -- ชื่อบนเมนู
  size       TEXT,                      -- S / M / L
  sell_price REAL NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1
);

-- ล็อกต้นทุน ณ เวลาหนึ่ง (ต้นทุนต่อแก้วคำนวณสดจาก recipe_items ได้ แต่เก็บไว้ดูย้อนหลัง)
CREATE TABLE IF NOT EXISTS cup_cost_snapshots (
  id              INTEGER PRIMARY KEY,
  product_id      INTEGER NOT NULL REFERENCES products(id),
  ingredient_cost REAL NOT NULL,        -- รวมวัตถุดิบ
  packaging_cost  REAL NOT NULL,        -- รวม packaging
  total_cost      REAL NOT NULL,
  sell_price      REAL NOT NULL,
  gross_margin    REAL NOT NULL,        -- (sell - total) / sell
  calculated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 💰 ยอดขายรายวัน (กรอกท้ายวัน ไม่ต้องมี POS) ------
CREATE TABLE IF NOT EXISTS daily_sales (
  id           INTEGER PRIMARY KEY,
  date         TEXT NOT NULL,
  product_id   INTEGER REFERENCES products(id),
  channel      TEXT NOT NULL DEFAULT 'store', -- store / grab / lineman / robinhood
  qty_sold     INTEGER NOT NULL,
  gross_amount REAL NOT NULL,           -- ยอดก่อนหัก GP
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 🧾 ระบบเบิกเงิน ----------------------------------
CREATE TABLE IF NOT EXISTS reimbursements (
  id           INTEGER PRIMARY KEY,
  requester    INTEGER NOT NULL REFERENCES members(id),
  amount       REAL NOT NULL,
  reason       TEXT,
  expense_id   INTEGER REFERENCES expenses(id),  -- ถ้าเบิกคืนที่สำรองจ่าย
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending / approved / paid / rejected
  approver     INTEGER REFERENCES members(id),
  slip_id      INTEGER REFERENCES slips(id),     -- สลิปตอนจ่ายคืน
  deduct_pool  INTEGER NOT NULL DEFAULT 0,       -- 1 = พออนุมัติให้หักจากเงินกองกลาง
  note         TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  resolved_at  TEXT
);

-- บัญชีเงินกองกลางเข้า-ออก (ยอดคงเหลือคำนวณสดด้วย SUM ไม่เก็บ balance_after)
CREATE TABLE IF NOT EXISTS cash_ledger (
  id         INTEGER PRIMARY KEY,
  type       TEXT NOT NULL,            -- in / out
  amount     REAL NOT NULL,
  ref_type   TEXT,                     -- expense / reimbursement / topup
  ref_id     INTEGER,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 🎯 Milestone (แยกอิสระ) -------------------------
CREATE TABLE IF NOT EXISTS milestones (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  category     TEXT,                   -- setup / recipe / marketing / finance
  target_date  TEXT,
  status       TEXT NOT NULL DEFAULT 'todo', -- todo / doing / done / dropped
  progress_pct INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES members(id),
  thread_id    TEXT,                   -- โพสต์ใน forum 🎯-milestone ของเป้าหมายนี้
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  completed_at TEXT
);

-- ---------- ⚙️ settings (key-value เช่น channel id ของแต่ละคำสั่ง) --
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ---------- ⚡ index ที่ใช้บ่อย -----------------------------
CREATE INDEX IF NOT EXISTS idx_expenses_date        ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_purchase_items_item  ON purchase_items(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_ver     ON recipe_items(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_item ON supplier_prices(item_id);
CREATE INDEX IF NOT EXISTS idx_daily_sales_date     ON daily_sales(date);
