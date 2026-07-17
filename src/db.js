// การเชื่อมต่อฐานข้อมูล SQLite + สร้างตารางอัตโนมัติจาก schema.sql
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join(__dirname, '..', 'db', 'xuebot.db');
const db = new Database(dbPath);

// เปิด WAL (เขียน/อ่านพร้อมกันลื่นขึ้น) + บังคับ foreign key
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// รัน schema.sql ทุกครั้งที่เริ่ม (ทุกคำสั่งเป็น "IF NOT EXISTS" จึงรันซ้ำได้ปลอดภัย)
const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
