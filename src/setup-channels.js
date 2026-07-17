// สร้างแชแนลของแต่ละคำสั่ง (ใต้ category "🧋 XUEBOT") + เก็บ id ลง DB
//  รันครั้งเดียว:  npm run setup-channels   (รันซ้ำได้ ข้ามอันที่มีแล้ว)
require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
require('./db');
const { CHANNEL_MAP, getChannelId, setChannelId } = require('./lib/channels');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);

    // ---- category ----
    let category = null;
    const catId = getChannelId('_category');
    if (catId) category = await guild.channels.fetch(catId).catch(() => null);
    if (!category) {
      category = await guild.channels.create({
        name: '🧋 XUEBOT',
        type: ChannelType.GuildCategory,
      });
      setChannelId('_category', category.id);
      console.log('📁 สร้าง category:', category.name);
    } else {
      console.log('📁 มี category อยู่แล้ว:', category.name);
    }

    // ---- แชแนลของแต่ละคำสั่ง ----
    for (const [command, chName] of Object.entries(CHANNEL_MAP)) {
      const existingId = getChannelId(command);
      const existing = existingId ? await guild.channels.fetch(existingId).catch(() => null) : null;
      if (existing) {
        console.log(`   ✓ มีอยู่แล้ว: #${existing.name}  (/${command})`);
        continue;
      }
      const ch = await guild.channels.create({
        name: chName,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `ใช้คำสั่ง /${command} ที่นี่`,
      });
      setChannelId(command, ch.id);
      console.log(`   ＋ สร้าง: #${ch.name}  (/${command})`);
    }

    console.log('\n✅ ตั้งค่าแชแนลเสร็จแล้ว');
  } catch (err) {
    console.error('❌ error:', err.message);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(process.env.DISCORD_TOKEN);
