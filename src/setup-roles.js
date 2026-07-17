// สร้าง role "KB" (ผู้มีสิทธิ์อนุมัติ/ปฏิเสธเบิกเงิน) + เก็บ id ลง DB
//  รันครั้งเดียว:  npm run setup-roles   (รันซ้ำได้ ข้ามถ้ามีแล้ว)
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const db = require('./db');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);

    // มี role เดิมไหม: เช็คจาก id ที่เคยเซฟ แล้วค่อยเช็คจากชื่อ
    const saved = db.prepare(`SELECT value FROM settings WHERE key = 'role:kb'`).get();
    let role = saved ? await guild.roles.fetch(saved.value).catch(() => null) : null;
    if (!role) role = (await guild.roles.fetch()).find((r) => r.name === 'KB') || null;

    if (!role) {
      role = await guild.roles.create({
        name: 'KB',
        colors: { primaryColor: 0xf1c40f },
        reason: 'สิทธิ์อนุมัติเบิกเงินของ xuebot',
      });
      console.log('＋ สร้าง role:', role.name, `(${role.id})`);
    } else {
      console.log('✓ มี role อยู่แล้ว:', role.name, `(${role.id})`);
    }

    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('role:kb', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(role.id);

    console.log('✅ บันทึก role id แล้ว — อย่าลืมกำหนด role KB ให้คนที่มีสิทธิ์อนุมัติใน Discord');
  } catch (err) {
    console.error('❌ error:', err.message);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(process.env.DISCORD_TOKEN);
