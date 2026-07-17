// /withdraw — ระบบเบิกเงินจากกองกลาง (ขอ -> กดปุ่มอนุมัติ/ปฏิเสธ)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
} = require('discord.js');
const db = require('../db');
const { ensureMember } = require('../lib/members');
const { textField, num } = require('../lib/modal');

function reqEmbed(row, requesterTag) {
  const color = { pending: 0xf1c40f, paid: 0x2ecc71, rejected: 0xe74c3c }[row.status];
  const statusText = { pending: '⏳ รออนุมัติ', paid: '✅ จ่ายแล้ว', rejected: '🚫 ปฏิเสธ' }[row.status];
  const e = new EmbedBuilder()
    .setTitle(`🧾 เบิกเงิน #${row.id}`)
    .setColor(color)
    .addFields(
      { name: 'จำนวน', value: `**${row.amount.toFixed(2)}฿**`, inline: true },
      { name: 'สถานะ', value: statusText, inline: true },
      { name: 'เหตุผล', value: row.reason || '-' },
    );
  if (requesterTag) e.addFields({ name: 'ผู้ขอ', value: requesterTag, inline: true });
  return e;
}

module.exports = {
  buttonNamespace: 'wd',

  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('เบิกเงินจากกองกลาง')
    .addSubcommand((sc) => sc.setName('request').setDescription('ขอเบิกเงิน (เปิดฟอร์มกรอก)'))
    .addSubcommand((sc) => sc.setName('list').setDescription('ดูรายการที่รออนุมัติ')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'request') return openRequestModal(interaction);
    if (sub === 'list') return list(interaction);
  },

  modalNamespace: 'wd',
  async handleModal(interaction) {
    const action = interaction.customId.split(':')[1];
    if (action === 'request') return request(interaction);
  },

  async handleButton(interaction) {
    const [, action, idStr] = interaction.customId.split(':');
    const id = Number(idStr);
    const row = db.prepare('SELECT * FROM reimbursements WHERE id = ?').get(id);
    if (!row) return interaction.reply({ content: '❌ ไม่เจอรายการนี้', ephemeral: true });
    if (row.status !== 'pending')
      return interaction.reply({ content: 'รายการนี้ถูกจัดการไปแล้ว', ephemeral: true });

    // ปุ่มลบ: กดได้เฉพาะคนที่ขอเบิกรายการนี้เอง
    if (action === 'delete') {
      if (row.requester !== ensureMember(interaction.user))
        return interaction.reply({ content: '❌ ลบได้เฉพาะคนที่ขอเบิกรายการนี้', ephemeral: true });
      db.prepare('DELETE FROM reimbursements WHERE id = ?').run(id);
      return interaction.update({
        content: `🗑️ รายการเบิก \`#${id}\` ถูกลบโดยผู้ขอ`,
        embeds: [],
        components: [],
      });
    }

    // อนุมัติ/ปฏิเสธ: ต้องมี role KB
    const kb = db.prepare(`SELECT value FROM settings WHERE key = 'role:kb'`).get();
    if (!kb)
      return interaction.reply({
        content: '⚠️ ยังไม่ได้ตั้งค่า role ผู้อนุมัติ — รัน `npm run setup-roles` ก่อน',
        ephemeral: true,
      });
    if (!interaction.member.roles.cache.has(kb.value))
      return interaction.reply({
        content: '❌ ต้องมี role **KB** ถึงจะอนุมัติ/ปฏิเสธได้',
        ephemeral: true,
      });

    const approverId = ensureMember(interaction.user);
    const now = new Date().toISOString();

    if (action === 'approve') {
      db.prepare(
        `UPDATE reimbursements SET status = 'paid', approver = ?, resolved_at = ? WHERE id = ?`,
      ).run(approverId, now, id);
      row.status = 'paid';
    } else {
      db.prepare(
        `UPDATE reimbursements SET status = 'rejected', approver = ?, resolved_at = ? WHERE id = ?`,
      ).run(approverId, now, id);
      row.status = 'rejected';
    }

    const verb = action === 'approve' ? `✅ อนุมัติโดย ${interaction.user}` : `🚫 ปฏิเสธโดย ${interaction.user}`;
    await interaction.update({
      content: verb,
      embeds: [reqEmbed(row)],
      components: [], // เอาปุ่มออก
    });
  },
};

function openRequestModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('wd:request')
    .setTitle('🧾 ขอเบิกเงิน')
    .addLabelComponents(
      textField('amount', 'จำนวนเงิน (บาท)', { placeholder: 'เช่น 500', required: true }),
      textField('reason', 'เบิกไปทำอะไร', { required: true, paragraph: true, maxLength: 200 }),
    );
  return interaction.showModal(modal);
}

function request(interaction) {
  const amount = num(interaction.fields.getTextInputValue('amount'));
  if (amount == null || amount <= 0)
    return interaction.reply({ content: '❌ จำนวนเงินต้องเป็นตัวเลข เช่น 500', ephemeral: true });
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const memberId = ensureMember(interaction.user);

  const info = db
    .prepare(
      `INSERT INTO reimbursements (requester, amount, reason, status) VALUES (?, ?, ?, 'pending')`,
    )
    .run(memberId, amount, reason);
  const row = { id: info.lastInsertRowid, amount, reason, status: 'pending' };

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wd:approve:${row.id}`)
      .setLabel('อนุมัติ')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`wd:reject:${row.id}`)
      .setLabel('ปฏิเสธ')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`wd:delete:${row.id}`)
      .setLabel('🗑️ ลบ (เฉพาะผู้ขอ)')
      .setStyle(ButtonStyle.Secondary),
  );

  return interaction.reply({
    content: '📢 มีคำขอเบิกเงินใหม่ — รออนุมัติ',
    embeds: [reqEmbed(row, `${interaction.user}`)],
    components: [buttons],
  });
}

function list(interaction) {
  const rows = db
    .prepare(
      `SELECT r.id, r.amount, r.reason, m.name AS requester
       FROM reimbursements r LEFT JOIN members m ON m.id = r.requester
       WHERE r.status = 'pending' ORDER BY r.id`,
    )
    .all();
  if (!rows.length) return interaction.reply('✅ ไม่มีรายการรออนุมัติ');
  const out = rows
    .map((r) => `\`#${r.id}\` **${r.amount.toFixed(2)}฿** — ${r.reason} _(${r.requester})_`)
    .join('\n');
  return interaction.reply('⏳ รออนุมัติ:\n' + out.slice(0, 1900));
}
