// หา/สร้าง member จาก user ของ Discord (ใช้ตอนบันทึกว่าใครทำอะไร)
const db = require('../db');

function ensureMember(user) {
  const row = db.prepare('SELECT id FROM members WHERE discord_user_id = ?').get(user.id);
  if (row) return row.id;
  const info = db
    .prepare('INSERT INTO members (discord_user_id, name, role) VALUES (?, ?, ?)')
    .run(user.id, user.username, 'staff');
  return info.lastInsertRowid;
}

module.exports = { ensureMember };
