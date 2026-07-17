// /cost — คำนวณต้นทุนต่อแก้ว + กำไร %
const { SlashCommandBuilder } = require('discord.js');
const { findRecipe } = require('../lib/lookup');
const { computeCost } = require('../lib/cost');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cost')
    .setDescription('คำนวณต้นทุนต่อแก้ว + กำไร')
    .addStringOption((o) =>
      o.setName('recipe').setDescription('ชื่อสูตร หรือ #id').setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('size')
        .setDescription('ไซซ์ (ไม่เลือก = ต้นทุนฐาน)')
        .addChoices(
          { name: 'S', value: 'S' },
          { name: 'M', value: 'M' },
          { name: 'L', value: 'L' },
        ),
    )
    .addNumberOption((o) =>
      o.setName('price').setDescription('ราคาขาย (บาท) — ใส่เพื่อดูกำไร %'),
    ),

  async execute(interaction) {
    const recipe = findRecipe(interaction.options.getString('recipe'));
    if (!recipe) return interaction.reply({ content: '❌ ไม่เจอสูตรนี้', ephemeral: true });

    const size = interaction.options.getString('size');
    const price = interaction.options.getNumber('price');
    const c = computeCost(recipe.id, size);
    if (!c || c.empty)
      return interaction.reply({
        content: `**${recipe.name}** ยังไม่มีส่วนผสม${size ? ` สำหรับไซซ์ ${size}` : ''}`,
        ephemeral: true,
      });

    let out = `🧮 **${recipe.name}**` + (size ? ` · ไซซ์ ${size}` : ' · ต้นทุนฐาน') + '\n\n';
    for (const l of c.lines) {
      out += `• ${l.name} ${l.qty}${l.unit} → ${l.cost.toFixed(2)}฿\n`;
    }
    out += `\n🥃 วัตถุดิบ: **${c.ingredient.toFixed(2)}฿**`;
    out += `\n📦 แพ็คเกจจิ้ง: **${c.packaging.toFixed(2)}฿**`;
    out += `\n━━━━━━━━━━━━━\n💰 **ต้นทุนรวม: ${c.total.toFixed(2)}฿/แก้ว**`;

    if (price) {
      const profit = price - c.total;
      const margin = (profit / price) * 100;
      const markup = (profit / c.total) * 100;
      out += `\n\n🏷️ ราคาขาย: ${price.toFixed(2)}฿`;
      out += `\n📈 กำไร: **${profit.toFixed(2)}฿/แก้ว** (margin ${margin.toFixed(1)}%)`;
      out += `\n_ตั้งราคาแพงกว่าทุน ${markup.toFixed(0)}%_`;
    } else {
      out += `\n\n_ใส่ \`price:\` เพื่อดูกำไร เช่น \`/cost recipe:${recipe.name} size:M price:45\`_`;
    }
    return interaction.reply(out.slice(0, 1900));
  },
};
