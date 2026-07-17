// จุดเริ่มของบอท: โหลดคำสั่งทั้งหมดในโฟลเดอร์ commands/ แล้วล็อกอิน
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');

require('./db'); // เปิด/สร้างฐานข้อมูลตั้งแต่เริ่ม
const { checkChannel } = require('./lib/channels');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ---- โหลดคำสั่งจาก src/commands/*.js ----
client.commands = new Collection();
client.buttons = new Collection(); // namespace -> handler สำหรับปุ่มกด
client.modals = new Collection(); // namespace -> handler สำหรับฟอร์ม modal
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[warn] ${file} ไม่มี data/execute — ข้าม`);
  }
  // คำสั่งที่มีปุ่มกด: export buttonNamespace + handleButton
  if (command.buttonNamespace && command.handleButton) {
    client.buttons.set(command.buttonNamespace, command.handleButton);
  }
  // คำสั่งที่มีฟอร์ม modal: export modalNamespace + handleModal
  if (command.modalNamespace && command.handleModal) {
    client.modals.set(command.modalNamespace, command.handleModal);
  }
}

// ---- รับ interaction (slash command + ปุ่มกด) ----
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      // ล็อกให้ใช้คำสั่งได้เฉพาะแชแนลของมัน
      if (!(await checkChannel(interaction, interaction.commandName))) return;
      await command.execute(interaction);
    } else if (interaction.isButton()) {
      // customId รูปแบบ "namespace:action:arg"
      const ns = interaction.customId.split(':')[0];
      const handler = client.buttons.get(ns);
      if (handler) await handler(interaction);
    } else if (interaction.isModalSubmit()) {
      const ns = interaction.customId.split(':')[0];
      const handler = client.modals.get(ns);
      if (handler) await handler(interaction);
    }
  } catch (err) {
    console.error(err);
    const msg = { content: '❌ เกิดข้อผิดพลาด ลองใหม่อีกครั้ง', ephemeral: true };
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    }
  }
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ ล็อกอินสำเร็จ: ${c.user.tag}`);
  try {
    await require('./lib/forum').ensureForums(c);
    console.log('🗂️ forum ทั้งหมดพร้อม (เบิกเงิน + milestone)');
  } catch (err) {
    console.error('ตั้งค่า forum ไม่สำเร็จ:', err.message);
  }
});

client.login(process.env.DISCORD_TOKEN);
