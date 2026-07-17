// โพสต์คู่มือวิธีใช้ในแต่ละแชแนล แล้ว pin ไว้
//  รัน:  npm run setup-pins   (รันซ้ำได้ ถ้ามี pin เดิมจะแก้ข้อความเดิมแทนโพสต์ใหม่)
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const db = require('./db');
const { CHANNEL_MAP, getChannelId } = require('./lib/channels');

const BRAND = 0x8b5e3c; // สีชานม

const getS = db.prepare('SELECT value FROM settings WHERE key = ?');
const setS = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);
const getPin = (c) => (getS.get('pin:' + c) || {}).value || null;
const setPin = (c, id) => setS.run('pin:' + c, id);

// คู่มือแต่ละคำสั่ง
const HELP = {
  item: {
    title: '📦 วัตถุดิบ — /item',
    desc:
      'เก็บวัตถุดิบ/แพ็คเกจจิ้งพร้อมต้นทุนต่อหน่วย (ฐานของการคำนวณต้นทุนต่อแก้ว)\n\n' +
      '**เพิ่มไอเทม**\n`/item add` → ฟอร์มเด้งให้กรอก: ชื่อ / ประเภท (เลือกจากลิสต์) / หน่วย / ต้นทุนต่อหน่วย / สต๊อกเริ่มต้น\n\n' +
      '**ดูทั้งหมด**\n`/item list`\n\n' +
      '💡 หน่วย = หน่วยที่ใช้ในสูตร (g/ml/ชิ้น) · ต้นทุน = ราคาต่อ 1 หน่วย เช่น ผงชา กก.ละ 350฿ → หน่วย g ต้นทุน 0.35',
  },
  recipe: {
    title: '🧪 สูตรชา — /recipe',
    desc:
      'บันทึกสูตร + ส่วนผสม (ใส่ได้ทั้งวัตถุดิบและแก้ว/ฝา/หลอด)\n\n' +
      '**1) สร้างสูตร**\n`/recipe add` → ฟอร์ม: ชื่อสูตร / หมวด\n\n' +
      '**2) ใส่ส่วนผสม**\n`/recipe ingredient` → ฟอร์ม: สูตร / ไอเทม / ปริมาณ / ไซซ์ (เลือกจากลิสต์ ไม่เลือก = ทุกไซซ์)\n\n' +
      '**ดูสูตร**\n`/recipe show recipe:ชานมไข่มุก`\n\n' +
      '**ดูสูตรทั้งหมด**\n`/recipe list`\n\n' +
      '💡 ต้องเพิ่มวัตถุดิบใน #📦-วัตถุดิบ ก่อนถึงจะใส่เข้าสูตรได้ · ช่องสูตร/ไอเทมพิมพ์ชื่อบางส่วนหรือเลข id ก็ได้',
  },
  cost: {
    title: '🧮 ต้นทุนต่อแก้ว — /cost',
    desc:
      'คำนวณต้นทุนต่อแก้ว + กำไร % จากสูตร\n\n' +
      '**ดูต้นทุน + กำไร**\n`/cost recipe:ชานมไข่มุก size:M price:45`\n\n' +
      '**ดูแค่ต้นทุน (ไม่ใส่ราคา)**\n`/cost recipe:ชานมไข่มุก size:M`\n\n' +
      '💡 บอทจะแยกให้เห็นว่าเป็นค่าวัตถุดิบเท่าไหร่ ค่าแพ็คเกจเท่าไหร่ และกำไรกี่ %',
  },
  product: {
    title: '🍽️ เมนูขาย — /product',
    desc:
      'เปลี่ยนสูตรเป็นเมนูขาย (มีราคา) แล้วดูต้นทุน/กำไรทั้งร้าน\n\n' +
      '**เพิ่มเมนู**\n`/product add` → ฟอร์ม: สูตร / ราคาขาย / ไซซ์ (เลือกจากลิสต์) / ชื่อบนเมนู (เว้นว่าง = ชื่อสูตร)\n\n' +
      '**ดูเมนูทั้งร้าน + กำไร**\n`/product menu`\n\n' +
      '💡 `menu` โชว์กำไร % ทุกเมนู + กำไรเฉลี่ย และติด ⚠️ เมนูที่กำไรต่ำกว่า 60%',
  },
  expense: {
    title: '💸 รายจ่าย — /expense',
    desc:
      'บันทึกรายจ่ายร้าน\n\n' +
      '**เพิ่มรายจ่าย**\n`/expense add` → ฟอร์ม: รายการ / จำนวนเงิน / หมวด / วิธีจ่าย (เลือกจากลิสต์) / วันที่\n\n' +
      '**ดูรายจ่าย + ยอดรวมเดือนนี้**\n`/expense list`\n\n' +
      '💡 ช่องวันที่เว้นว่าง = วันนี้ · บันทึกย้อนหลังพิมพ์ ปี-เดือน-วัน เช่น 2026-07-01',
  },
  withdraw: {
    title: '🧾 เบิกเงิน — /withdraw',
    desc:
      'ขอเบิกเงิน → รอคนมี role KB กดอนุมัติ → แนบสลิปใน thread\n\n' +
      '**ขอเบิก**\n`/withdraw request` → ฟอร์ม: จำนวนเงิน / เหตุผล\n' +
      'การ์ดคำขอมี 3 ปุ่ม:\n' +
      '• **[อนุมัติ]** / **[ปฏิเสธ]** — กดได้เฉพาะคนมี role **KB**\n' +
      '• **[🗑️ ลบ]** — กดได้เฉพาะคนที่ขอเบิกรายการนั้นเอง (ยกเลิกคำขอ)\n\n' +
      '**แนบสลิป/หลักฐาน** 🆕\nทุกคำขอมี thread 🧾 ของตัวเองใต้การ์ด — โยนรูปสลิปลงในนั้นได้เลย แยกเรื่องกันชัดเจน\n\n' +
      '**ดูรายการที่รออนุมัติ**\n`/withdraw list`\n\n' +
      '💡 รายการที่อนุมัติ/ปฏิเสธแล้วลบไม่ได้',
  },
  supplier: {
    title: '🏭 ซัพพลายเออร์ — /supplier',
    desc:
      'เก็บซัพ + ราคา แล้วเทียบราคาต่อหน่วยข้ามเจ้า\n\n' +
      '**เพิ่มซัพ**\n`/supplier add` → ฟอร์ม: ชื่อร้าน / LINE / เบอร์ / โน้ต\n\n' +
      '**บันทึกราคา**\n`/supplier price` → ฟอร์ม: ซัพ / ไอเทม / ราคาต่อแพ็ค / แพ็คได้กี่หน่วยฐาน / อธิบายแพ็ค\n' +
      '(หน่วยฐาน เช่น ถุง 1 กก. ของไอเทมหน่วย g → ใส่ 1000)\n\n' +
      '**เทียบราคาทุกเจ้า**\n`/supplier compare item:ผงชาแดง`\n\n' +
      '💡 บอทเรียงจากถูกสุด→แพงสุดต่อหน่วย และบอกว่าประหยัดได้เท่าไหร่',
  },
  milestone: {
    title: '🎯 Milestone — /milestone',
    desc:
      'จด/ติดตามเป้าหมายของร้าน\n\n' +
      '**เพิ่มเป้าหมาย**\n`/milestone add` → ฟอร์ม: เป้าหมาย / หมวด (เลือกจากลิสต์) / กำหนดเสร็จ (เลือกจากลิสต์ หรือพิมพ์วันเอง) / รายละเอียด\n\n' +
      '**อัปเดตความคืบหน้า**\n`/milestone progress milestone:คิดสูตร pct:40`\n\n' +
      '**ทำเสร็จ**\n`/milestone done milestone:คิดสูตร`\n\n' +
      '**ดูทั้งหมด**\n`/milestone list` → แยกตามเดือนของกำหนดเสร็จ · ✅ = เสร็จแล้ว\n\n' +
      '💡 อ้างถึง milestone ได้ทั้งชื่อ (พิมพ์บางส่วนพอ) หรือเลข id เช่น `milestone:1`',
  },
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    for (const command of Object.keys(CHANNEL_MAP)) {
      const chId = getChannelId(command);
      const channel = chId ? await guild.channels.fetch(chId).catch(() => null) : null;
      if (!channel) {
        console.log(`   ⏭️ ข้าม /${command} (ไม่เจอแชแนล)`);
        continue;
      }
      const help = HELP[command];
      const embed = new EmbedBuilder()
        .setColor(BRAND)
        .setTitle(help.title)
        .setDescription(help.desc)
        .setFooter({ text: 'ใช้คำสั่งได้เฉพาะในแชแนลนี้เท่านั้น' });

      const pinId = getPin(command);
      let msg = pinId ? await channel.messages.fetch(pinId).catch(() => null) : null;
      if (msg) {
        await msg.edit({ embeds: [embed] });
        console.log(`   ✏️ อัปเดตคู่มือ: /${command}`);
      } else {
        msg = await channel.send({ embeds: [embed] });
        await msg.pin();
        setPin(command, msg.id);
        console.log(`   📌 pin คู่มือ: /${command}`);
      }
    }
    console.log('\n✅ pin คู่มือครบทุกแชแนลแล้ว');
  } catch (err) {
    console.error('❌ error:', err.message);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(process.env.DISCORD_TOKEN);
