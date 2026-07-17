// จับคู่ "คำสั่ง -> แชแนล" + เช็คว่าใช้คำสั่งถูกแชแนลไหม
//  channel id เก็บในตาราง settings (key = "channel:<command>")
const db = require('../db');

// คำสั่ง -> ชื่อแชแนล (คำสั่งที่ไม่อยู่ในนี้ = ใช้ได้ทุกแชแนล เช่น /ping)
const CHANNEL_MAP = {
  item: '📦-วัตถุดิบ',
  recipe: '🧪-สูตรชา',
  cost: '🧮-ต้นทุน',
  product: '🍽-เมนู',
  expense: '💸-รายจ่าย',
  withdraw: '🧾-เบิกเงิน',
  supplier: '🏭-ซัพพลายเออร์',
  milestone: '🎯-milestone',
};

const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setStmt = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);

const keyOf = (command) => `channel:${command}`;

function getChannelId(command) {
  const row = getStmt.get(keyOf(command));
  return row ? row.value : null;
}

function setChannelId(command, id) {
  setStmt.run(keyOf(command), id);
}

// คืน true ถ้าใช้ได้; ถ้าผิดแชแนลจะตอบเตือน (ephemeral) แล้วคืน false
async function checkChannel(interaction, command) {
  const wantId = getChannelId(command);
  if (!wantId) return true; // ยังไม่ตั้งค่า -> ปล่อยผ่าน
  if (interaction.channelId === wantId) return true;
  await interaction.reply({
    content: `⚠️ คำสั่ง \`/${command}\` ใช้ได้เฉพาะที่ <#${wantId}> เท่านั้น`,
    ephemeral: true,
  });
  return false;
}

module.exports = { CHANNEL_MAP, getChannelId, setChannelId, checkChannel };
