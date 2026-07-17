// Forum เบิกเงิน — บอทสร้าง/ผูกให้เองตอนสตาร์ท (idempotent: หา id จาก settings -> หาจากชื่อ -> สร้างใหม่)
//  1 โพสต์ = 1 รายการเบิก, แท็กบอกสถานะ, แนบสลิปในโพสต์ได้เลย
const { ChannelType } = require('discord.js');
const db = require('../db');

const FORUM_NAME = '🧾-เบิกเงิน';
const TAGS = [
  { key: 'pending', name: '⏳ รออนุมัติ' },
  { key: 'paid', name: '✅ จ่ายแล้ว' },
  { key: 'rejected', name: '🚫 ปฏิเสธ' },
];

const getS = db.prepare('SELECT value FROM settings WHERE key = ?');
const setS = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);
const getSetting = (key) => (getS.get(key) || {}).value || null;

async function ensureWithdrawForum(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);

  // ---- หา forum: จาก id ที่เซฟไว้ -> จากชื่อ -> สร้างใหม่ ----
  let forum = null;
  const savedId = getSetting('forum:withdraw');
  if (savedId) forum = await guild.channels.fetch(savedId).catch(() => null);
  if (!forum) {
    const all = await guild.channels.fetch();
    forum =
      all.find((c) => c && c.type === ChannelType.GuildForum && c.name === FORUM_NAME) || null;
  }
  if (!forum) {
    forum = await guild.channels.create({
      name: FORUM_NAME,
      type: ChannelType.GuildForum,
      parent: getSetting('channel:_category') || undefined,
      topic:
        'ขอเบิกด้วย /withdraw request (พิมพ์จากแชแนลไหนก็ได้) — 1 โพสต์ = 1 รายการเบิก ' +
        'แนบสลิป/หลักฐานในโพสต์นั้นได้เลย · ปุ่มอนุมัติ/ปฏิเสธกดได้เฉพาะคนมี role KB',
      availableTags: TAGS.map((t) => ({ name: t.name })),
    });
    console.log('🧾 สร้าง forum เบิกเงินแล้ว');

    // เปลี่ยนชื่อแชแนลข้อความเบิกเงินอันเก่ากันสับสน (ลบเองได้เมื่อไม่ใช้แล้ว)
    const oldId = getSetting('channel:withdraw');
    if (oldId) {
      const old = await guild.channels.fetch(oldId).catch(() => null);
      if (old && old.type === ChannelType.GuildText)
        await old.setName('🧾-เบิกเงิน-เก่า').catch(() => {});
    }
  }
  setS.run('forum:withdraw', forum.id);

  // ---- ผูกแท็ก: เติมที่ขาด แล้วเซฟ id ตามชื่อ ----
  const missing = TAGS.filter((t) => !forum.availableTags.some((a) => a.name === t.name));
  if (missing.length)
    forum = await forum.setAvailableTags([
      ...forum.availableTags,
      ...missing.map((t) => ({ name: t.name })),
    ]);
  for (const t of TAGS) {
    const tag = forum.availableTags.find((a) => a.name === t.name);
    if (tag) setS.run(`forumtag:withdraw:${t.key}`, tag.id);
  }
  return forum;
}

module.exports = { ensureWithdrawForum, getSetting };
