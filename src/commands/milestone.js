// /milestone — จด/ติดตาม milestone ของร้าน
const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const db = require('../db');
const { ensureMember } = require('../lib/members');
const { getSetting, milestoneTags } = require('../lib/forum');

const CAT = [
  { name: 'setup ตั้งร้าน', value: 'setup' },
  { name: 'recipe สูตร', value: 'recipe' },
  { name: 'marketing การตลาด', value: 'marketing' },
  { name: 'finance การเงิน', value: 'finance' },
  { name: 'อื่นๆ', value: 'other' },
];

function findMilestone(q) {
  if (/^\d+$/.test(q)) return db.prepare('SELECT * FROM milestones WHERE id = ?').get(Number(q));
  return db.prepare('SELECT * FROM milestones WHERE title LIKE ? COLLATE NOCASE').get('%' + q + '%');
}

function bar(pct) {
  const full = Math.round(pct / 10);
  return '█'.repeat(full) + '░'.repeat(10 - full) + ` ${pct}%`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('milestone')
    .setDescription('จด/ติดตาม milestone')
    .addSubcommand((sc) => sc.setName('add').setDescription('เพิ่ม milestone (เปิดฟอร์มกรอก)'))
    .addSubcommand((sc) => sc.setName('list').setDescription('ดู milestone ทั้งหมด'))
    .addSubcommand((sc) =>
      sc
        .setName('progress')
        .setDescription('อัปเดตความคืบหน้า')
        .addStringOption((o) =>
          o.setName('milestone').setDescription('ชื่อ หรือ #id').setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('pct')
            .setDescription('% ความคืบหน้า 0-100')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(100),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('done')
        .setDescription('ทำเสร็จแล้ว')
        .addStringOption((o) =>
          o.setName('milestone').setDescription('ชื่อ หรือ #id').setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') return openAddModal(interaction);
    if (sub === 'list') return listMs(interaction);
    if (sub === 'progress') return progressMs(interaction);
    if (sub === 'done') return doneMs(interaction);
  },

  modalNamespace: 'milestone',
  async handleModal(interaction) {
    const action = interaction.customId.split(':')[1];
    if (action === 'add') return submitAdd(interaction);
  },
};

function fmtDate(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// ตัวเลือกวันสำเร็จรูป คำนวณจากวันนี้ตอนเปิดฟอร์ม
function datePresets() {
  const now = new Date();
  const plusDays = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  const plusMonths = (n) => new Date(now.getFullYear(), now.getMonth() + n, now.getDate());
  const endOfMonth = (n) => new Date(now.getFullYear(), now.getMonth() + n + 1, 0);
  return [
    { label: 'ไม่กำหนด', value: 'none' },
    { label: 'อีก 1 สัปดาห์', value: fmtDate(plusDays(7)) },
    { label: 'อีก 2 สัปดาห์', value: fmtDate(plusDays(14)) },
    { label: 'สิ้นเดือนนี้', value: fmtDate(endOfMonth(0)) },
    { label: 'อีก 1 เดือน', value: fmtDate(plusMonths(1)) },
    { label: 'สิ้นเดือนหน้า', value: fmtDate(endOfMonth(1)) },
    { label: 'อีก 3 เดือน', value: fmtDate(plusMonths(3)) },
    { label: 'สิ้นปีนี้', value: fmtDate(new Date(now.getFullYear(), 11, 31)) },
  ];
}

function openAddModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('milestone:add')
    .setTitle('🎯 เพิ่ม milestone')
    .addLabelComponents(
      new LabelBuilder().setLabel('เป้าหมาย').setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('title')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('เช่น เปิดร้านวันแรก')
          .setMaxLength(100)
          .setRequired(true),
      ),
      new LabelBuilder().setLabel('หมวด').setStringSelectMenuComponent(
        new StringSelectMenuBuilder().setCustomId('category').addOptions(
          new StringSelectMenuOptionBuilder().setLabel('ไม่ระบุ').setValue('none').setDefault(true),
          ...CAT.map((c) => new StringSelectMenuOptionBuilder().setLabel(c.name).setValue(c.value)),
        ),
      ),
      new LabelBuilder().setLabel('กำหนดเสร็จ').setStringSelectMenuComponent(
        new StringSelectMenuBuilder().setCustomId('target_pick').addOptions(
          ...datePresets().map((p, i) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(p.label + (p.value !== 'none' ? ` (${p.value})` : ''))
              .setValue(p.value)
              .setDefault(i === 0),
          ),
        ),
      ),
      new LabelBuilder().setLabel('หรือพิมพ์วันที่เอง (ปี-เดือน-วัน)').setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('target')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('เช่น 2026-08-01 — ถ้ากรอก จะใช้แทนช่องด้านบน')
          .setRequired(false),
      ),
      new LabelBuilder().setLabel('รายละเอียด').setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('desc')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('เว้นว่างได้')
          .setRequired(false),
      ),
    );
  return interaction.showModal(modal);
}

async function submitAdd(interaction) {
  const title = interaction.fields.getTextInputValue('title').trim();
  const desc = interaction.fields.getTextInputValue('desc').trim();

  const catPick = interaction.fields.getStringSelectValues('category')[0];
  const category = catPick && catPick !== 'none' ? catPick : null;

  // วันที่: ถ้าพิมพ์เองใช้อันนั้นก่อน ไม่งั้นใช้ค่าจาก dropdown
  const typed = interaction.fields.getTextInputValue('target').trim();
  const picked = interaction.fields.getStringSelectValues('target_pick')[0];
  const target = typed || (picked !== 'none' ? picked : '');

  if (typed && !/^\d{4}-\d{2}-\d{2}$/.test(typed)) {
    return interaction.reply({
      content: `❌ วันที่ต้องเป็นรูปแบบ ปี-เดือน-วัน เช่น 2026-08-01 (ที่กรอกมา: ${target})`,
      ephemeral: true,
    });
  }

  const forumId = getSetting('forum:milestone');
  const forum = forumId
    ? await interaction.client.channels.fetch(forumId).catch(() => null)
    : null;
  if (!forum)
    return interaction.reply({
      content: '❌ ยังไม่พบ forum milestone — รีสตาร์ทบอทแล้วลองใหม่',
      ephemeral: true,
    });

  const memberId = ensureMember(interaction.user);
  const info = db
    .prepare(
      `INSERT INTO milestones (title, description, category, target_date, created_by)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(title, desc || null, category, target || null, memberId);
  const id = info.lastInsertRowid;

  // สร้างโพสต์ใน forum: 1 โพสต์ = 1 เป้าหมาย
  const row = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id);
  const lines = [`🎯 **${title}**`];
  if (desc) lines.push(desc);
  if (target) lines.push(`📅 กำหนดเสร็จ: ${target}`);
  lines.push(bar(0));
  lines.push(`\nสร้างโดย ${interaction.user} · อัปเดตด้วย \`/milestone progress milestone:${id} pct:...\``);
  const post = await forum.threads.create({
    name: `${title}${target ? ` (เป้า ${target})` : ''}`.slice(0, 100),
    appliedTags: milestoneTags(row),
    message: { content: lines.join('\n') },
  });
  db.prepare(`UPDATE milestones SET thread_id = ? WHERE id = ?`).run(post.id, id);

  return interaction.reply({
    content: `🎯 เพิ่ม **${title}** (\`#${id}\`) แล้ว → ${post}`,
    ephemeral: true,
  });
}

// อัปเดตโพสต์ใน forum ของ milestone นี้: สลับแท็ก + โพสต์ความคืบหน้า
async function updatePost(client, msId, note) {
  const row = db.prepare('SELECT * FROM milestones WHERE id = ?').get(msId);
  if (!row || !row.thread_id) return null;
  const post = await client.channels.fetch(row.thread_id).catch(() => null);
  if (!post || !post.isThread()) return null;
  if (post.archived) await post.setArchived(false).catch(() => {});
  await post.setAppliedTags(milestoneTags(row)).catch(() => {});
  await post.send(note).catch(() => {});
  return post;
}

const THAI_MONTH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function monthHead(ym) {
  if (ym === 'none') return '📌 ไม่กำหนดวัน';
  const [y, m] = ym.split('-').map(Number);
  return `📅 ${THAI_MONTH[m - 1]} ${y}`;
}

function listMs(interaction) {
  const rows = db
    .prepare(`SELECT * FROM milestones ORDER BY target_date NULLS LAST, id`)
    .all();
  if (!rows.length) return interaction.reply('ยังไม่มี milestone — เพิ่มด้วย `/milestone add`');

  // จัดกลุ่มตามเดือนของกำหนดเสร็จ (YYYY-MM) — ไม่มีกำหนดไปอยู่ท้ายสุด
  const byMonth = new Map();
  for (const r of rows) {
    const key = r.target_date ? r.target_date.slice(0, 7) : 'none';
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(r);
  }

  let out = '';
  for (const [ym, items] of byMonth) {
    out += `\n**${monthHead(ym)}**\n`;
    for (const r of items) {
      out += `${r.status === 'done' ? '✅ ' : ''}\`#${r.id}\` ${r.title}`;
      if (r.thread_id) out += ` → <#${r.thread_id}>`;
      if (r.target_date) out += ` · ${r.target_date}`;
      if (r.description) {
        const d = r.description.replace(/\s+/g, ' ').trim();
        out += `\n-# ${d.length > 100 ? d.slice(0, 100) + '…' : d}`;
      }
      out += '\n';
    }
  }
  return interaction.reply(out.trim().slice(0, 1900));
}

async function progressMs(interaction) {
  const ms = findMilestone(interaction.options.getString('milestone'));
  if (!ms) return interaction.reply({ content: '❌ ไม่เจอ milestone นี้', ephemeral: true });
  const pct = interaction.options.getInteger('pct');
  const status = pct >= 100 ? 'done' : 'doing';
  const completed = pct >= 100 ? new Date().toISOString() : null;
  db.prepare(`UPDATE milestones SET progress_pct = ?, status = ?, completed_at = ? WHERE id = ?`).run(
    pct,
    status,
    completed,
    ms.id,
  );
  const note = `📊 ${interaction.user} อัปเดตความคืบหน้า\n${bar(pct)}` + (pct >= 100 ? '\n🎉 เสร็จแล้ว!' : '');
  const post = await updatePost(interaction.client, ms.id, note);
  return interaction.reply(
    `📊 **${ms.title}**\n${bar(pct)}` +
      (pct >= 100 ? '\n🎉 เสร็จแล้ว!' : '') +
      (post ? `\n→ ${post}` : ''),
  );
}

async function doneMs(interaction) {
  const ms = findMilestone(interaction.options.getString('milestone'));
  if (!ms) return interaction.reply({ content: '❌ ไม่เจอ milestone นี้', ephemeral: true });
  db.prepare(
    `UPDATE milestones SET status = 'done', progress_pct = 100, completed_at = ? WHERE id = ?`,
  ).run(new Date().toISOString(), ms.id);
  const post = await updatePost(
    interaction.client,
    ms.id,
    `✅ ${interaction.user} ปิดเป้าหมายนี้ — เสร็จแล้ว! 🎉\n${bar(100)}`,
  );
  return interaction.reply(`✅ **${ms.title}** เสร็จแล้ว! 🎉` + (post ? `\n→ ${post}` : ''));
}
