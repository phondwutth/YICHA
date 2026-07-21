// /cash — เงินกองกลางร้าน (เติมเงิน + ดูยอดคงเหลือ)
//  ยอด = เงินเข้า − เงินออก คำนวณสด (ไม่เก็บ balance ตายตัว)
const { SlashCommandBuilder, ModalBuilder } = require('discord.js');
const db = require('../db');
const { textField, num } = require('../lib/modal');
const { poolBalance, ledgerAdd } = require('../lib/cash');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cash')
    .setDescription('เงินกองกลางร้าน')
    .addSubcommand((sc) =>
      sc.setName('topup').setDescription('เติมเงินเข้ากองกลาง (เปิดฟอร์มกรอก)'),
    )
    .addSubcommand((sc) => sc.setName('balance').setDescription('ดูยอดคงเหลือ + สรุปเข้า-ออก')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'topup') return openTopupModal(interaction);
    if (sub === 'balance') return balance(interaction);
  },

  modalNamespace: 'cash',
  async handleModal(interaction) {
    if (interaction.customId.split(':')[1] === 'topup') return topup(interaction);
  },
};

function openTopupModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('cash:topup')
    .setTitle('💰 เติมเงินกองกลาง')
    .addLabelComponents(
      textField('amount', 'จำนวนเงิน (บาท)', { placeholder: 'เช่น 5000', required: true }),
      textField('note', 'โน้ต', { placeholder: 'เช่น ลงหุ้นรอบแรก — เว้นว่างได้' }),
    );
  return interaction.showModal(modal);
}

function topup(interaction) {
  const amount = num(interaction.fields.getTextInputValue('amount'));
  if (amount == null || amount <= 0)
    return interaction.reply({ content: '❌ จำนวนเงินต้องเป็นตัวเลข เช่น 5000', ephemeral: true });
  const note = interaction.fields.getTextInputValue('note').trim() || null;
  ledgerAdd('in', amount, 'topup', null, note);
  return interaction.reply(
    `💰 เติมเงินเข้ากองกลาง **${amount.toFixed(2)}฿**${note ? ` — ${note}` : ''}\n` +
      `ยอดคงเหลือ: **${poolBalance().toFixed(2)}฿**`,
  );
}

function balance(interaction) {
  const topups = db.prepare(`SELECT COALESCE(SUM(amount),0) t FROM cash_ledger WHERE type='in'`).get().t;
  const wd = db
    .prepare(`SELECT COALESCE(SUM(amount),0) t FROM cash_ledger WHERE type='out' AND ref_type='reimbursement'`)
    .get().t;
  let out = `💰 **เงินกองกลาง**\n\n`;
  out += `ยอดคงเหลือ: **${poolBalance().toFixed(2)}฿**\n`;
  out += `━━━━━━━━━━━━━\n`;
  out += `🟢 เติมเงินเข้า: ${topups.toFixed(2)}฿\n`;
  out += `🔴 เบิกหักจากกองกลาง: ${wd.toFixed(2)}฿\n`;
  out += `\n_เติมเงินด้วย \`/cash topup\` · รายจ่าย (/expense) ไม่หักจากกองกลาง_`;
  return interaction.reply(out);
}
