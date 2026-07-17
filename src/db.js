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

// seed ข้อมูลครั้งแรก (ใช้ตอนย้ายขึ้น cloud): ถ้า DB ยังว่างเปล่า + มี env SEED_B64
// ให้ import SQL dump (base64) ที่ย้ายมาจากเครื่องเดิม — รันแค่ครั้งเดียวตอน DB ว่างเท่านั้น
const noTables =
  db.prepare(`SELECT COUNT(*) c FROM sqlite_master WHERE type = 'table'`).get().c === 0;
if (noTables && process.env.SEED_B64) {
  db.exec(Buffer.from(process.env.SEED_B64, 'base64').toString('utf8'));
  console.log('🌱 seed ข้อมูลจาก SEED_B64 สำเร็จ');
}

// รัน schema.sql ทุกครั้งที่เริ่ม (ทุกคำสั่งเป็น "IF NOT EXISTS" จึงรันซ้ำได้ปลอดภัย)
const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
