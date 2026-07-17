// /product — เปลี่ยนสูตรเป็นเมนูขาย (มีราคา) + ดูต้นทุน/กำไรทั้งร้าน
const { SlashCommandBuilder, ModalBuilder } = require('discord.js');
const db = require('../db');
const { findRecipe } = require('../lib/lookup');
const { computeCost } = require('../lib/cost');
const { textField, selectField, num } = require('../lib/modal');

const SIZE_CHOICES = [
  { name: 'S', value: 'S' },
  { name: 'M', value: 'M' },
  { name: 'L', value: 'L' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('product')
    .setDescription('เมนูขาย + ต้นทุน/กำไรทั้งร้าน')
    .addSubcommand((sc) => sc.setName('add').setDescription('เพิ่มเมนูขายจากสูตร (เปิดฟอร์มกรอก)'))
    .addSubcommand((sc) =>
      sc.setName('menu').setDescription('ดูเมนูทั้งหมด + ต้นทุน + กำไร %'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') return openAddModal(interaction);
    if (sub === 'menu') return showMenu(interaction);
  },

  modalNamespace: 'product',
  async handleModal(interaction) {
    const action = interaction.customId.split(':')[1];
    if (action === 'add') return addProduct(interaction);
  },
};

function openAddModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('product:add')
    .setTitle('🍽️ เพิ่มเมนูขาย')
    .addLabelComponents(
      textField('recipe', 'สูตร (ชื่อ หรือ #id)', { required: true }),
      textField('price', 'ราคาขาย (บาท)', { placeholder: 'เช่น 65', required: true }),
      selectField('size', 'ไซซ์', [
        { label: 'ไม่ระบุ', value: 'none', default: true },
        ...SIZE_CHOICES.map((s) => ({ label: s.name, value: s.value })),
      ]),
      textField('name', 'ชื่อบนเมนู', { placeholder: 'เว้นว่าง = ใช้ชื่อสูตร' }),
    );
  return interaction.showModal(modal);
}

function addProduct(interaction) {
  const recipe = findRecipe(interaction.fields.getTextInputValue('recipe').trim());
  if (!recipe) return interaction.reply({ content: '❌ ไม่เจอสูตรนี้', ephemeral: true });
  const price = num(interaction.fields.getTextInputValue('price'));
  if (price == null || price <= 0)
    return interaction.reply({ content: '❌ ราคาขายต้องเป็นตัวเลข เช่น 65', ephemeral: true });
  const sizePick = interaction.fields.getStringSelectValues('size')[0];
  const size = sizePick === 'none' ? null : sizePick;
  const name = interaction.fields.getTextInputValue('name').trim() || recipe.name;

  const info = db
    .prepare(
      `INSERT INTO products (recipe_id, name, size, sell_price) VALUES (?, ?, ?, ?)`,
    )
    .run(recipe.id, name, size, price);

  const c = computeCost(recipe.id, size);
  let msg = `✅ เพิ่มเมนู **${name}**${size ? ` (${size})` : ''} — ขาย ${price.toFixed(2)}฿ (\`#${info.lastInsertRowid}\`)`;
  if (c && !c.empty) {
    const margin = ((price - c.total) / price) * 100;
    msg += `\nต้นทุน ${c.total.toFixed(2)}฿ · กำไร **${margin.toFixed(1)}%**`;
  } else {
    msg += `\n⚠️ สูตรนี้ยังไม่มีส่วนผสม — ใส่ด้วย \`/recipe ingredient\``;
  }
  return interaction.reply(msg);
}

function showMenu(interaction) {
  const products = db
    .prepare(
      `SELECT p.id, p.name, p.size, p.sell_price, p.recipe_id
       FROM products p WHERE p.active = 1 ORDER BY p.name, p.size`,
    )
    .all();
  if (!products.length) return interaction.reply('ยังไม่มีเมนู — เพิ่มด้วย `/product add`');

  let out = '🍽️ **เมนูทั้งร้าน**\n\n';
  let marginSum = 0;
  let counted = 0;
  for (const p of products) {
    const c = computeCost(p.recipe_id, p.size);
    const cost = c && !c.empty ? c.total : null;
    let line = `**${p.name}**${p.size ? ` (${p.size})` : ''} — ขาย ${p.sell_price.toFixed(0)}฿`;
    if (cost != null) {
      const margin = ((p.sell_price - cost) / p.sell_price) * 100;
      marginSum += margin;
      counted++;
      const flag = margin < 60 ? ' ⚠️' : '';
      line += ` · ทุน ${cost.toFixed(2)}฿ · กำไร **${margin.toFixed(0)}%**${flag}`;
    } else {
      line += ' · _ยังไม่มีสูตร_';
    }
    out += line + '\n';
  }
  if (counted) out += `\n━━━━━━━━━━━━━\n📊 กำไรเฉลี่ย: **${(marginSum / counted).toFixed(1)}%** · ⚠️ = ต่ำกว่า 60%`;
  return interaction.reply(out.slice(0, 1900));
}
