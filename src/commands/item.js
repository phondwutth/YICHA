// /item — จัดการวัตถุดิบ / packaging / ของใช้ (ฐานของต้นทุน)
const { SlashCommandBuilder, ModalBuilder } = require('discord.js');
const db = require('../db');
const { textField, selectField, num } = require('../lib/modal');

const TYPE_LABEL = { ingredient: '🥃 วัตถุดิบ', packaging: '📦 แพ็คเกจจิ้ง', supply: '🧰 ของใช้' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('item')
    .setDescription('จัดการวัตถุดิบ / packaging / ของใช้')
    .addSubcommand((sc) => sc.setName('add').setDescription('เพิ่มไอเทมใหม่ (เปิดฟอร์มกรอก)'))
    .addSubcommand((sc) => sc.setName('list').setDescription('ดูรายการไอเทมทั้งหมด')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') return openAddModal(interaction);
    if (sub === 'list') return listItems(interaction);
  },

  modalNamespace: 'item',
  async handleModal(interaction) {
    const action = interaction.customId.split(':')[1];
    if (action === 'add') return addItem(interaction);
  },
};

function openAddModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('item:add')
    .setTitle('🧃 เพิ่มไอเทม')
    .addLabelComponents(
      textField('name', 'ชื่อ', { placeholder: 'เช่น ผงชาแดง', required: true, maxLength: 100 }),
      selectField('type', 'ประเภท', [
        { label: 'วัตถุดิบ', value: 'ingredient', default: true },
        { label: 'แพ็คเกจจิ้ง', value: 'packaging' },
        { label: 'ของใช้', value: 'supply' },
      ]),
      textField('unit', 'หน่วยที่ใช้ในสูตร', { placeholder: 'เช่น g, ml, ชิ้น', required: true }),
      textField('cost', 'ต้นทุนต่อ 1 หน่วย (บาท)', { placeholder: 'เช่น 0.45', required: true }),
      textField('stock', 'สต๊อกเริ่มต้น', { placeholder: 'เว้นว่าง = 0' }),
    );
  return interaction.showModal(modal);
}

function addItem(interaction) {
  const name = interaction.fields.getTextInputValue('name').trim();
  const unit = interaction.fields.getTextInputValue('unit').trim();
  const type = interaction.fields.getStringSelectValues('type')[0];
  const category = null;

  const cost = num(interaction.fields.getTextInputValue('cost'));
  if (cost == null || cost < 0)
    return interaction.reply({ content: '❌ ต้นทุนต้องเป็นตัวเลข เช่น 0.45', ephemeral: true });

  const stockRaw = interaction.fields.getTextInputValue('stock').trim();
  const stock = stockRaw ? num(stockRaw) : 0;
  if (stock == null || stock < 0)
    return interaction.reply({ content: '❌ สต๊อกต้องเป็นตัวเลข', ephemeral: true });

  const info = db
    .prepare(
      `INSERT INTO items (name, type, category, base_unit, current_cost, stock_qty)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(name, type, category, unit, cost, stock);

  if (stock > 0) {
    db.prepare(
      `INSERT INTO stock_movements (item_id, type, qty_base_units, ref_type, note)
       VALUES (?, 'in', ?, 'manual', 'สต๊อกเริ่มต้น')`,
    ).run(info.lastInsertRowid, stock);
  }

  return interaction.reply(
    `✅ เพิ่ม **${name}** แล้ว (\`#${info.lastInsertRowid}\`)\n` +
      `${TYPE_LABEL[type]} · ${cost}฿/${unit}` +
      (stock ? ` · สต๊อก ${stock} ${unit}` : ''),
  );
}

function listItems(interaction) {
  const rows = db
    .prepare(
      `SELECT id, name, type, category, base_unit, current_cost, stock_qty
       FROM items WHERE active = 1 ORDER BY type, category, name`,
    )
    .all();
  if (!rows.length) return interaction.reply('ยังไม่มีไอเทม — เพิ่มด้วย `/item add`');

  let out = '';
  let curType = null;
  for (const r of rows) {
    if (r.type !== curType) {
      out += `\n**${TYPE_LABEL[r.type] || r.type}**\n`;
      curType = r.type;
    }
    out +=
      `\`#${r.id}\` ${r.name} — ${r.current_cost}฿/${r.base_unit}` +
      (r.stock_qty ? ` · สต๊อก ${r.stock_qty}` : '') +
      '\n';
  }
  return interaction.reply(out.trim().slice(0, 1900));
}
