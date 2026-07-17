// ระบบ forum กลาง — บอทสร้าง/ผูกให้เองตอนสตาร์ท (idempotent: หา id จาก settings -> หาจากชื่อ -> สร้างใหม่)
//  ใช้กับ: เบิกเงิน (1 โพสต์ = 1 รายการ), milestone (1 โพสต์ = 1 เป้าหมาย)
const { ChannelType } = require('discord.js');
const db = require('../db');

const FORUMS = [
  {
    key: 'withdraw',
    name: '🧾-เบิกเงิน',
    topic:
      'ขอเบิกด้วย /withdraw request (พิมพ์จากแชแนลไหนก็ได้) — 1 โพสต์ = 1 รายการเบิก ' +
      'แนบสลิป/หลักฐานในโพสต์นั้นได้เลย · ปุ่มอนุมัติ/ปฏิเสธกดได้เฉพาะคนมี role KB',
    oldChannelKey: 'channel:withdraw',
    oldName: '🧾-เบิกเงิน-เก่า',
    tags: [
      { key: 'pending', name: '⏳ รออนุมัติ' },
      { key: 'paid', name: '✅ จ่ายแล้ว' },
      { key: 'rejected', name: '🚫 ปฏิเสธ' },
    ],
  },
  {
    key: 'milestone',
    name: '🎯-milestone',
    topic:
      'เพิ่มเป้าหมายด้วย /milestone add (พิมพ์จากแชแนลไหนก็ได้) — 1 โพสต์ = 1 เป้าหมาย ' +
      'อัปเดตด้วย /milestone progress · โยนรูป/คุยความคืบหน้าในโพสต์ของเป้าหมายนั้นได้เลย',
    oldChannelKey: 'channel:milestone',
    oldName: '🎯-milestone-เก่า',
    tags: [
      { key: 'todo', name: '⬜ ยังไม่เริ่ม' },
      { key: 'doing', name: '🔄 กำลังทำ' },
      { key: 'done', name: '✅ เสร็จแล้ว' },
      { key: 'dropped', name: '🚫 ยกเลิก' },
      { key: 'setup', name: '🏗️ ตั้งร้าน' },
      { key: 'recipe', name: '🧪 สูตร' },
      { key: 'marketing', name: '📣 การตลาด' },
      { key: 'finance', name: '💰 การเงิน' },
    ],
  },
];

const getS = db.prepare('SELECT value FROM settings WHERE key = ?');
const setS = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);
const getSetting = (key) => (getS.get(key) || {}).value || null;

// เทียบชื่อแท็กแบบตัด variation selector (U+FE0F) — Discord ตัดตัวนี้ทิ้งตอนเก็บชื่อ
// ถ้าเทียบตรงๆ จะนึกว่าแท็กหายแล้วเพิ่มซ้ำจนโดน "Tag names must be unique"
const norm = (str) => str.replace(/\uFE0F/g, '');
const sameTag = (a, b) => norm(a) === norm(b);

async function ensureForum(guild, spec) {
  // หา forum: จาก id ที่เซฟไว้ -> จากชื่อ -> สร้างใหม่
  let forum = null;
  const savedId = getSetting(`forum:${spec.key}`);
  if (savedId) forum = await guild.channels.fetch(savedId).catch(() => null);
  if (!forum) {
    const all = await guild.channels.fetch();
    forum =
      all.find((c) => c && c.type === ChannelType.GuildForum && c.name === spec.name) || null;
  }
  if (!forum) {
    forum = await guild.channels.create({
      name: spec.name,
      type: ChannelType.GuildForum,
      parent: getSetting('channel:_category') || undefined,
      topic: spec.topic,
      availableTags: spec.tags.map((t) => ({ name: t.name })),
    });
    console.log(`🗂️ สร้าง forum ${spec.name} แล้ว`);

    // เปลี่ยนชื่อแชแนลข้อความอันเก่ากันสับสน (ผู้ใช้ลบเองได้เมื่อไม่ใช้แล้ว)
    const oldId = getSetting(spec.oldChannelKey);
    if (oldId) {
      const old = await guild.channels.fetch(oldId).catch(() => null);
      if (old && old.type === ChannelType.GuildText) await old.setName(spec.oldName).catch(() => {});
    }
  }
  setS.run(`forum:${spec.key}`, forum.id);

  // ผูกแท็ก: เติมที่ขาด แล้วเซฟ id ตามชื่อ
  const missing = spec.tags.filter((t) => !forum.availableTags.some((a) => sameTag(a.name, t.name)));
  if (missing.length)
    forum = await forum.setAvailableTags([
      ...forum.availableTags,
      ...missing.map((t) => ({ name: t.name })),
    ]);
  for (const t of spec.tags) {
    const tag = forum.availableTags.find((a) => sameTag(a.name, t.name));
    if (tag) setS.run(`forumtag:${spec.key}:${t.key}`, tag.id);
  }
  return forum;
}

// แท็กของ milestone ตามสถานะ + หมวด
function milestoneTags(row) {
  const tags = [];
  const st = getSetting(`forumtag:milestone:${row.status}`);
  if (st) tags.push(st);
  const ct = row.category ? getSetting(`forumtag:milestone:${row.category}`) : null;
  if (ct) tags.push(ct);
  return tags;
}

// ย้าย milestone เดิมที่ยังไม่มีโพสต์เข้า forum (รันซ้ำได้ ข้ามอันที่มีแล้ว)
async function backfillMilestones(forum) {
  const rows = db.prepare(`SELECT * FROM milestones WHERE thread_id IS NULL`).all();
  for (const r of rows) {
    const pct = r.progress_pct || 0;
    const barTxt = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    const lines = [`🎯 **${r.title}**`];
    if (r.description) lines.push(r.description);
    if (r.target_date) lines.push(`📅 กำหนดเสร็จ: ${r.target_date}`);
    lines.push(`${barTxt} ${pct}%`);
    const post = await forum.threads.create({
      name: `${r.title}${r.target_date ? ` (เป้า ${r.target_date})` : ''}`.slice(0, 100),
      appliedTags: milestoneTags(r),
      message: { content: lines.join('\n') },
    });
    db.prepare(`UPDATE milestones SET thread_id = ? WHERE id = ?`).run(post.id, r.id);
    console.log(`🎯 ย้าย milestone #${r.id} เข้า forum แล้ว`);
  }
}

async function ensureForums(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  for (const spec of FORUMS) {
    const forum = await ensureForum(guild, spec);
    if (spec.key === 'milestone') await backfillMilestones(forum);
  }
}

module.exports = { ensureForums, getSetting, milestoneTags };
