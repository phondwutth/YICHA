// /supplier — เก็บซัพพลายเออร์ + ราคา + เทียบราคา (normalize ต่อหน่วย)
const { SlashCommandBuilder, ModalBuilder } = require('discord.js');
const db = require('../db');
const { findItem } = require('../lib/lookup');
const { textField, num } = require('../lib/modal');

function findSupplier(q) {
  if (/^\d+$/.test(q)) return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(Number(q));
  return db.prepare('SELECT * FROM suppliers WHERE name LIKE ? COLLATE NOCASE').get('%' + q + '%');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('supplier')
    .setDescription('ซัพพลายเออร์ + เทียบราคา')
    .addSubcommand((sc) => sc.setName('add').setDescription('เพิ่มซัพพลายเออร์ (เปิดฟอร์มกรอก)'))
    .addSubcommand((sc) => sc.setName('list').setDescription('ดูซัพทั้งหมด'))
    .addSubcommand((sc) =>
      sc.setName('price').setDescription('บันทึกราคาของจากซัพเจ้าหนึ่ง (เปิดฟอร์มกรอก)'),
    )
    .addSubcommand((sc) =>
      sc
        .setName('compare')
        .setDescription('เทียบราคาไอเทมจากทุกซัพ')
        .addStringOption((o) =>
          o.setName('item').setDescription('ชื่อไอเทม หรือ #id').setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') return openAddModal(interaction);
    if (sub === 'list') return listSuppliers(interaction);
    if (sub === 'price') return openPriceModal(interaction);
    if (sub === 'compare') return compare(interaction);
  },

  modalNamespace: 'supplier',
  async handleModal(interaction) {
    const action = interaction.customId.split(':')[1];
    if (action === 'add') return addSupplier(interaction);
    if (action === 'price') return addPrice(interaction);
  },
};

function openAddModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('supplier:add')
    .setTitle('🚚 เพิ่มซัพพลายเออร์')
    .addLabelComponents(
      textField('name', 'ชื่อร้าน/เจ้า', { required: true, maxLength: 100 }),
      textField('line', 'LINE id', { placeholder: 'เว้นว่างได้' }),
      textField('phone', 'เบอร์โทร', { placeholder: 'เว้นว่างได้' }),
      textField('note', 'โน้ต', { placeholder: 'เว้นว่างได้', paragraph: true }),
    );
  return interaction.showModal(modal);
}

function openPriceModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('supplier:price')
    .setTitle('🏷️ บันทึกราคาจากซัพ')
    .addLabelComponents(
      textField('supplier', 'ซัพ (ชื่อ หรือ #id)', { required: true }),
      textField('item', 'ไอเทม (ชื่อ หรือ #id)', { required: true }),
      textField('price', 'ราคาต่อแพ็ค (บาท)', { placeholder: 'เช่น 250', required: true }),
      textField('qty', 'แพ็คนี้ได้กี่หน่วยฐาน', { placeholder: 'เช่น ถุง 1 กก. = 1000', required: true }),
      textField('pack', 'อธิบายแพ็ค', { placeholder: 'เช่น ถุง 1 กก. — เว้นว่างได้' }),
    );
  return interaction.showModal(modal);
}

function addSupplier(interaction) {
  const name = interaction.fields.getTextInputValue('name').trim();
  const line = interaction.fields.getTextInputValue('line').trim() || null;
  const phone = interaction.fields.getTextInputValue('phone').trim() || null;
  const note = interaction.fields.getTextInputValue('note').trim() || null;
  const info = db
    .prepare(
      `INSERT INTO suppliers (name, contact_line, contact_phone, note) VALUES (?, ?, ?, ?)`,
    )
    .run(name, line, phone, note);
  return interaction.reply(`✅ เพิ่มซัพ **${name}** แล้ว (\`#${info.lastInsertRowid}\`)`);
}

function listSuppliers(interaction) {
  const rows = db.prepare(`SELECT * FROM suppliers ORDER BY name`).all();
  if (!rows.length) return interaction.reply('ยังไม่มีซัพ — เพิ่มด้วย `/supplier add`');
  const out = rows
    .map((r) => {
      let s = `\`#${r.id}\` **${r.name}**`;
      const c = [r.contact_line && `LINE ${r.contact_line}`, r.contact_phone].filter(Boolean);
      if (c.length) s += ` · ${c.join(' · ')}`;
      if (r.note) s += `\n   _${r.note}_`;
      return s;
    })
    .join('\n');
  return interaction.reply(out.slice(0, 1900));
}

function addPrice(interaction) {
  const supplier = findSupplier(interaction.fields.getTextInputValue('supplier').trim());
  if (!supplier) return interaction.reply({ content: '❌ ไม่เจอซัพนี้', ephemeral: true });
  const item = findItem(interaction.fields.getTextInputValue('item').trim());
  if (!item)
    return interaction.reply({ content: '❌ ไม่เจอไอเทมนี้ — เพิ่มด้วย `/item add` ก่อน', ephemeral: true });

  const price = num(interaction.fields.getTextInputValue('price'));
  const qty = num(interaction.fields.getTextInputValue('qty'));
  if (price == null || price <= 0 || qty == null || qty <= 0)
    return interaction.reply({ content: '❌ ราคาและจำนวนหน่วยต้องเป็นตัวเลข', ephemeral: true });
  const pack = interaction.fields.getTextInputValue('pack').trim() || null;
  const perUnit = price / qty;

  db.prepare(
    `INSERT INTO supplier_prices (supplier_id, item_id, pack_desc, price, qty_base_units)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(supplier.id, item.id, pack, price, qty);

  return interaction.reply(
    `✅ บันทึกราคา **${item.name}** จาก **${supplier.name}**\n` +
      `${price}฿${pack ? ` (${pack})` : ''} = **${perUnit.toFixed(3)}฿/${item.base_unit}**\n` +
      `_เทียบทุกเจ้า: \`/supplier compare item:${item.name}\`_`,
  );
}

function compare(interaction) {
  const item = findItem(interaction.options.getString('item'));
  if (!item) return interaction.reply({ content: '❌ ไม่เจอไอเทมนี้', ephemeral: true });

  const rows = db
    .prepare(
      `SELECT sp.price, sp.qty_base_units, sp.pack_desc, s.name AS supplier,
              (sp.price / sp.qty_base_units) AS per_unit
       FROM supplier_prices sp JOIN suppliers s ON s.id = sp.supplier_id
       WHERE sp.item_id = ? ORDER BY per_unit ASC`,
    )
    .all(item.id);

  if (!rows.length)
    return interaction.reply(
      `ยังไม่มีราคาของ **${item.name}** — บันทึกด้วย \`/supplier price\``,
    );

  let out = `🏷️ เทียบราคา **${item.name}** (ต้นทุนปัจจุบัน ${item.current_cost}฿/${item.base_unit})\n\n`;
  rows.forEach((r, i) => {
    out +=
      `${i === 0 ? '⭐' : '  '} **${r.per_unit.toFixed(3)}฿/${item.base_unit}** — ${r.supplier}` +
      ` · ${r.price}฿${r.pack_desc ? ` (${r.pack_desc})` : ''}\n`;
  });
  const cheapest = rows[0];
  const save = item.current_cost - cheapest.per_unit;
  if (save > 0)
    out += `\n💡 เจ้าถูกสุด (**${cheapest.supplier}**) ประหยัดได้ ${save.toFixed(3)}฿/${item.base_unit} เทียบต้นทุนตอนนี้`;
  return interaction.reply(out.slice(0, 1900));
}
