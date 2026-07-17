// /expense — บันทึกรายจ่ายร้าน (เวอร์ชันแรก: กรอกเอง; อ่านสลิปอัตโนมัติค่อยเสริมทีหลัง)
const { SlashCommandBuilder, ModalBuilder } = require('discord.js');
const db = require('../db');
const { ensureMember } = require('../lib/members');
const { textField, selectField, num } = require('../lib/modal');

const METHOD = [
  { name: 'โอน', value: 'transfer' },
  { name: 'เงินสด', value: 'cash' },
  { name: 'บัตร', value: 'card' },
];

// วันที่วันนี้ตามเวลาไทย (YYYY-MM-DD)
function todayTH() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

// หา/สร้างหมวดรายจ่ายจากชื่อ -> คืน category_id
function categoryId(name) {
  if (!name) return null;
  const row = db.prepare('SELECT id FROM expense_categories WHERE name = ? COLLATE NOCASE').get(name);
  if (row) return row.id;
  return db.prepare('INSERT INTO expense_categories (name) VALUES (?)').run(name).lastInsertRowid;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('expense')
    .setDescription('บันทึกรายจ่ายร้าน')
    .addSubcommand((sc) => sc.setName('add').setDescription('เพิ่มรายจ่าย (เปิดฟอร์มกรอก)'))
    .addSubcommand((sc) =>
      sc.setName('list').setDescription('ดูรายจ่ายล่าสุด + ยอดรวมเดือนนี้'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') return openAddModal(interaction);
    if (sub === 'list') return listExpenses(interaction);
  },

  modalNamespace: 'expense',
  async handleModal(interaction) {
    const action = interaction.customId.split(':')[1];
    if (action === 'add') return addExpense(interaction);
  },
};

function openAddModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('expense:add')
    .setTitle('💸 เพิ่มรายจ่าย')
    .addLabelComponents(
      textField('desc', 'รายการ', { placeholder: 'เช่น ผงชา 2 กก.', required: true, maxLength: 200 }),
      textField('amount', 'จำนวนเงิน (บาท)', { placeholder: 'เช่น 350', required: true }),
      textField('category', 'หมวด', { placeholder: 'เช่น วัตถุดิบ, ค่าเช่า, การตลาด — เว้นว่างได้' }),
      selectField('method', 'วิธีจ่าย', [
        { label: 'โอน', value: 'transfer', default: true },
        { label: 'เงินสด', value: 'cash' },
        { label: 'บัตร', value: 'card' },
      ]),
      textField('date', 'วันที่ (ปี-เดือน-วัน)', { placeholder: 'เว้นว่าง = วันนี้' }),
    );
  return interaction.showModal(modal);
}

function addExpense(interaction) {
  const desc = interaction.fields.getTextInputValue('desc').trim();
  const catName = interaction.fields.getTextInputValue('category').trim() || null;
  const method = interaction.fields.getStringSelectValues('method')[0];

  const amount = num(interaction.fields.getTextInputValue('amount'));
  if (amount == null || amount <= 0)
    return interaction.reply({ content: '❌ จำนวนเงินต้องเป็นตัวเลข เช่น 350', ephemeral: true });

  const dateRaw = interaction.fields.getTextInputValue('date').trim();
  if (dateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw))
    return interaction.reply({
      content: `❌ วันที่ต้องเป็นรูปแบบ ปี-เดือน-วัน เช่น ${todayTH()}`,
      ephemeral: true,
    });
  const date = dateRaw || todayTH();
  const memberId = ensureMember(interaction.user);

  const info = db
    .prepare(
      `INSERT INTO expenses (date, category_id, description, amount, payment_method, paid_by, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(date, categoryId(catName), desc, amount, method, memberId, memberId);

  return interaction.reply(
    `💸 บันทึกรายจ่าย **${amount.toFixed(2)}฿** — ${desc}\n` +
      `${date}${catName ? ` · ${catName}` : ''} · ${METHOD.find((m) => m.value === method).name} (\`#${info.lastInsertRowid}\`)`,
  );
}

function listExpenses(interaction) {
  const rows = db
    .prepare(
      `SELECT e.id, e.date, e.description, e.amount, c.name AS category
       FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
       ORDER BY e.date DESC, e.id DESC LIMIT 15`,
    )
    .all();
  if (!rows.length) return interaction.reply('ยังไม่มีรายจ่าย — เพิ่มด้วย `/expense add`');

  const month = todayTH().slice(0, 7);
  const monthTotal = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE date LIKE ?`)
    .get(month + '%').t;

  let out = `📒 รายจ่ายล่าสุด\n\n`;
  for (const r of rows) {
    out +=
      `\`${r.date}\` **${r.amount.toFixed(2)}฿** — ${r.description}` +
      (r.category ? ` _(${r.category})_` : '') +
      '\n';
  }
  out += `\n━━━━━━━━━━━━━\n📅 รวมเดือน ${month}: **${monthTotal.toFixed(2)}฿**`;
  return interaction.reply(out.slice(0, 1900));
}
