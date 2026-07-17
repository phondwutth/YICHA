// /recipe — บันทึกสูตรชา + ส่วนผสม
const { SlashCommandBuilder, ModalBuilder } = require('discord.js');
const db = require('../db');
const { ensureMember } = require('../lib/members');
const { findItem, findRecipe } = require('../lib/lookup');
const { computeCost } = require('../lib/cost');
const { textField, selectField, num } = require('../lib/modal');

const SIZE_CHOICES = [
  { name: 'S', value: 'S' },
  { name: 'M', value: 'M' },
  { name: 'L', value: 'L' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recipe')
    .setDescription('บันทึก/ดูสูตรชา')
    .addSubcommand((sc) =>
      sc.setName('add').setDescription('สร้างสูตรใหม่ (เปิดฟอร์มกรอก)'),
    )
    .addSubcommand((sc) =>
      sc.setName('ingredient').setDescription('ใส่ส่วนผสมเข้าสูตร (เปิดฟอร์มกรอก)'),
    )
    .addSubcommand((sc) =>
      sc
        .setName('show')
        .setDescription('ดูส่วนผสม + ต้นทุนของสูตร')
        .addStringOption((o) =>
          o.setName('recipe').setDescription('ชื่อสูตร หรือ #id').setRequired(true),
        ),
    )
    .addSubcommand((sc) => sc.setName('list').setDescription('ดูสูตรทั้งหมด')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') return openAddModal(interaction);
    if (sub === 'ingredient') return openIngredientModal(interaction);
    if (sub === 'show') return showRecipe(interaction);
    if (sub === 'list') return listRecipes(interaction);
  },

  modalNamespace: 'recipe',
  async handleModal(interaction) {
    const action = interaction.customId.split(':')[1];
    if (action === 'add') return addRecipe(interaction);
    if (action === 'ingredient') return addIngredient(interaction);
  },
};

function openAddModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('recipe:add')
    .setTitle('🧪 สร้างสูตรใหม่')
    .addLabelComponents(
      textField('name', 'ชื่อสูตร', { placeholder: 'เช่น ชานมหอมหมื่นลี้', required: true, maxLength: 100 }),
      textField('category', 'หมวด', { placeholder: 'เช่น ชานม, ชาผลไม้, ชาเพียว — เว้นว่างได้' }),
    );
  return interaction.showModal(modal);
}

function openIngredientModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('recipe:ingredient')
    .setTitle('🥣 ใส่ส่วนผสมเข้าสูตร')
    .addLabelComponents(
      textField('recipe', 'สูตร (ชื่อ หรือ #id)', { required: true }),
      textField('item', 'ไอเทม (ชื่อ หรือ #id)', { required: true }),
      textField('qty', 'ปริมาณ (หน่วยตามไอเทม)', { placeholder: 'เช่น 15', required: true }),
      selectField('size', 'ใช้กับไซซ์ไหน', [
        { label: 'ทุกไซซ์', value: 'all', default: true },
        ...SIZE_CHOICES.map((s) => ({ label: s.name, value: s.value })),
      ]),
    );
  return interaction.showModal(modal);
}

function addRecipe(interaction) {
  const name = interaction.fields.getTextInputValue('name').trim();
  const category = interaction.fields.getTextInputValue('category').trim() || null;
  const memberId = ensureMember(interaction.user);

  const info = db
    .prepare(
      `INSERT INTO recipes (name, category, status, created_by) VALUES (?, ?, 'testing', ?)`,
    )
    .run(name, category, memberId);
  const recipeId = info.lastInsertRowid;
  const ver = db
    .prepare(`INSERT INTO recipe_versions (recipe_id, version_no) VALUES (?, 1)`)
    .run(recipeId);
  db.prepare(`UPDATE recipes SET current_version = ? WHERE id = ?`).run(
    ver.lastInsertRowid,
    recipeId,
  );

  return interaction.reply(
    `✅ สร้างสูตร **${name}** แล้ว (\`#${recipeId}\` · v1)\n` +
      `ใส่ส่วนผสมด้วย \`/recipe ingredient\``,
  );
}

function addIngredient(interaction) {
  const recipe = findRecipe(interaction.fields.getTextInputValue('recipe').trim());
  if (!recipe) return interaction.reply({ content: '❌ ไม่เจอสูตรนี้', ephemeral: true });
  const item = findItem(interaction.fields.getTextInputValue('item').trim());
  if (!item)
    return interaction.reply({
      content: '❌ ไม่เจอไอเทมนี้ — เพิ่มก่อนด้วย `/item add`',
      ephemeral: true,
    });

  const qty = num(interaction.fields.getTextInputValue('qty'));
  if (qty == null || qty <= 0)
    return interaction.reply({ content: '❌ ปริมาณต้องเป็นตัวเลข เช่น 15', ephemeral: true });
  const sizePick = interaction.fields.getStringSelectValues('size')[0];
  const size = sizePick === 'all' ? null : sizePick;

  db.prepare(
    `INSERT INTO recipe_items (recipe_version_id, item_id, size, quantity, unit)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(recipe.current_version, item.id, size, qty, item.base_unit);

  const lineCost = qty * item.current_cost;
  return interaction.reply(
    `✅ ใส่ **${item.name}** ${qty} ${item.base_unit}` +
      (size ? ` (ไซซ์ ${size})` : '') +
      ` เข้าสูตร **${recipe.name}**\n` +
      `+${lineCost.toFixed(2)}฿ ต่อแก้ว`,
  );
}

function showRecipe(interaction) {
  const recipe = findRecipe(interaction.options.getString('recipe'));
  if (!recipe) return interaction.reply({ content: '❌ ไม่เจอสูตรนี้', ephemeral: true });

  const rows = db
    .prepare(
      `SELECT ri.quantity, ri.size, ri.unit, i.name, i.current_cost
       FROM recipe_items ri JOIN items i ON i.id = ri.item_id
       WHERE ri.recipe_version_id = ? ORDER BY ri.size NULLS FIRST, i.name`,
    )
    .all(recipe.current_version);

  if (!rows.length)
    return interaction.reply(
      `**${recipe.name}** ยังไม่มีส่วนผสม — ใส่ด้วย \`/recipe ingredient\``,
    );

  let out = `🧪 **${recipe.name}**` + (recipe.category ? ` · ${recipe.category}` : '') + `\n`;
  out += `สถานะ: ${recipe.status}\n\n**ส่วนผสม:**\n`;
  for (const r of rows) {
    out +=
      `• ${r.name} — ${r.quantity} ${r.unit}` +
      (r.size ? ` _(${r.size})_` : '') +
      ` · ${(r.quantity * r.current_cost).toFixed(2)}฿\n`;
  }
  const base = computeCost(recipe.id, null);
  out += `\n**ต้นทุนฐาน (ไม่รวมส่วนเฉพาะไซซ์):** ${base.total.toFixed(2)}฿`;
  out += `\n_ดูต้นทุนเต็มต่อไซซ์: \`/cost recipe:${recipe.name} size:M\`_`;
  return interaction.reply(out.slice(0, 1900));
}

function listRecipes(interaction) {
  const rows = db
    .prepare(`SELECT id, name, category, status FROM recipes ORDER BY status, name`)
    .all();
  if (!rows.length) return interaction.reply('ยังไม่มีสูตร — สร้างด้วย `/recipe add`');
  const emoji = { testing: '🧪', approved: '✅', retired: '📦' };
  const out = rows
    .map(
      (r) =>
        `${emoji[r.status] || '•'} \`#${r.id}\` **${r.name}**` +
        (r.category ? ` · ${r.category}` : ''),
    )
    .join('\n');
  return interaction.reply(out.slice(0, 1900));
}
