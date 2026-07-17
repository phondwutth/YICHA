// ลงทะเบียน slash command เข้ากับ server เทสต์ (guild-scoped = อัปเดตทันที)
// รันทุกครั้งที่เพิ่ม/แก้ชื่อคำสั่ง:  npm run deploy
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command) commands.push(command.data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`กำลังลงทะเบียน ${commands.length} คำสั่ง...`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );
    console.log('✅ ลงทะเบียนคำสั่งสำเร็จ');
  } catch (err) {
    console.error(err);
  }
})();
