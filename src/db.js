// การเชื่อมต่อฐานข้อมูล SQLite + สร้างตารางอัตโนมัติจาก schema.sql
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

// ที่เก็บไฟล์ DB:
//  - ในเครื่อง: โฟลเดอร์ db/ ของโปรเจกต์ (ค่า default)
//  - บน Railway: ตั้ง env DB_DIR=/data (โฟลเดอร์ volume ถาวร ไม่หายตอน deploy ใหม่)
const dbDir = process.env.DB_DIR || path.join(__dirname, '..', 'db');
fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(path.join(dbDir, 'xuebot.db'));

// เปิด WAL (เขียน/อ่านพร้อมกันลื่นขึ้น) + บังคับ foreign key
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// seed ข้อมูลครั้งแรก (ใช้ตอนย้ายขึ้น cloud): ถ้ามี env SEED_B64 + DB ยังไม่มีข้อมูลจริง
// ให้ import SQL dump (base64) ที่ย้ายมาจากเครื่องเดิม — ถ้ามีข้อมูลอยู่แล้วจะไม่แตะอะไรเลย
if (process.env.SEED_B64) {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => r.name);
  const hasData = tables.some(
    (t) => db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c > 0,
  );
  if (!hasData) {
    // ตารางเปล่าๆ ที่ schema สร้างไว้ต้องทิ้งก่อน เพราะใน dump มี CREATE TABLE ของมันเอง
    // (ปิด FK ชั่วคราว ไม่งั้นลบตารางที่ถูกอ้างถึงไม่ได้)
    db.pragma('foreign_keys = OFF');
    for (const t of tables) db.exec(`DROP TABLE "${t}"`);
    db.exec(Buffer.from(process.env.SEED_B64, 'base64').toString('utf8'));
    db.pragma('foreign_keys = ON');
    console.log('🌱 seed ข้อมูลจาก SEED_B64 สำเร็จ');
  }
}

// รัน schema.sql ทุกครั้งที่เริ่ม (ทุกคำสั่งเป็น "IF NOT EXISTS" จึงรันซ้ำได้ปลอดภัย)
const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
db.exec(schema);

// migration สำหรับ DB เก่าที่สร้างก่อน schema จะมีคอลัมน์ใหม่ (CREATE IF NOT EXISTS ไม่เติมคอลัมน์ให้)
const msCols = db.prepare(`PRAGMA table_info(milestones)`).all().map((c) => c.name);
if (!msCols.includes('thread_id')) db.exec(`ALTER TABLE milestones ADD COLUMN thread_id TEXT`);

// maintenance: ลบรายจ่ายที่วันที่หลุดไปปี 2027 (พิมพ์ปีผิด) — ตั้ง env WIPE_EXPENSE_2027=1 แล้ว restart
// (backup ลง log ก่อนลบเสมอ · เสร็จแล้วต้องเอา env ออกด้วย)
if (process.env.WIPE_EXPENSE_2027 === '1') {
  const rows = db.prepare(`SELECT * FROM expenses WHERE date >= '2027-01-01'`).all();
  if (rows.length) {
    console.log('🗑️ backup expenses ปี 2027 ก่อนลบ: ' + JSON.stringify(rows));
    db.prepare(`DELETE FROM purchase_items WHERE expense_id IN (SELECT id FROM expenses WHERE date >= '2027-01-01')`).run();
    db.prepare(`DELETE FROM expenses WHERE date >= '2027-01-01'`).run();
    console.log(`🗑️ ลบรายจ่ายปี 2027 แล้ว (${rows.length} รายการ)`);
  } else {
    console.log('🗑️ ไม่มีรายจ่ายปี 2027 ให้ลบ');
  }
}

// maintenance: ล้างตารางเบิกเงินครั้งเดียว — ตั้ง env WIPE_REIMBURSEMENTS=1 แล้ว restart
// (backup ลง log ก่อนลบเสมอ · เสร็จแล้วต้องเอา env ออกด้วย)
if (process.env.WIPE_REIMBURSEMENTS === '1') {
  const rows = db.prepare('SELECT * FROM reimbursements').all();
  console.log('🗑️ backup reimbursements ก่อนล้าง: ' + JSON.stringify(rows));
  db.prepare('DELETE FROM reimbursements').run();
  console.log(`🗑️ ล้างตาราง reimbursements แล้ว (${rows.length} รายการ)`);
}

module.exports = db;
