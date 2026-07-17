# 🧋 xuebot — ระบบหลังบ้านร้านชา (Discord Bot)

บอท Discord สำหรับจัดการหลังบ้านร้านชา: milestone, รายจ่าย+สลิป, เบิกเงิน,
สูตรชา, ต้นทุนต่อแก้ว, ซัพพลายเออร์ + สต๊อก + ยอดขาย

Stack: **discord.js v14** + **SQLite** (better-sqlite3)

---

## ⚙️ ติดตั้งครั้งแรก

### 1. ติดตั้ง Node.js (ถ้ายังไม่มี)
```bash
# ติดตั้ง Homebrew ก่อน
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
# แล้วลง Node
brew install node
node --version   # ควรได้ v18 ขึ้นไป
```

### 2. สร้างบอทที่ Discord Developer Portal
1. เข้า https://discord.com/developers/applications → **New Application**
2. เมนู **Bot** → **Reset Token** → คัดลอก token
3. เมนู **General Information** → คัดลอก **Application ID**
4. เมนู **OAuth2 > URL Generator** → ติ๊ก `bot` + `applications.commands`
   → ติ๊กสิทธิ์ `Send Messages`, `Embed Links`, `Read Message History`
   → เอา URL ล่างสุดไปเปิดในเบราว์เซอร์เพื่อเชิญบอทเข้า server

### 3. เปิด Developer Mode + เอา Server ID
Discord → Settings → Advanced → เปิด **Developer Mode**
→ คลิกขวาที่ชื่อ server → **Copy Server ID**

### 4. ตั้งค่า + ติดตั้ง dependency
```bash
cd ~/xuebot
cp .env.example .env      # แล้วเปิด .env เติม TOKEN, CLIENT_ID, GUILD_ID
npm install
```

### 5. ลงทะเบียนคำสั่ง + รันบอท
```bash
npm run deploy   # ลงทะเบียน slash command (รันซ้ำเมื่อเพิ่มคำสั่งใหม่)
npm start        # เปิดบอท
```
ไปที่ Discord พิมพ์ `/ping` — ถ้าตอบ "🏓 พร้อม!" = ใช้ได้แล้ว 🎉

---

## 📁 โครงสร้าง
```
xuebot/
├── db/
│   ├── schema.sql      ← โครงสร้างฐานข้อมูลทั้งหมด (19 ตาราง)
│   └── xuebot.db       ← ไฟล์ DB (สร้างอัตโนมัติตอนรัน, ไม่ commit)
├── src/
│   ├── index.js        ← จุดเริ่มบอท
│   ├── db.js           ← เชื่อม SQLite + สร้างตาราง
│   ├── deploy-commands.js
│   └── commands/       ← 1 ไฟล์ = 1 คำสั่ง
│       └── ping.js
├── .env                ← ค่าลับ (ไม่ commit)
└── package.json
```

## ➕ เพิ่มคำสั่งใหม่
สร้างไฟล์ใน `src/commands/` ที่ export `{ data, execute }` แล้วรัน `npm run deploy`

---

## ☁️ Deploy ขึ้น Railway (รัน 24 ชม.)

1. เข้า https://railway.app → login ด้วย GitHub
2. **New Project → Deploy from GitHub repo** → เลือก repo นี้
3. ที่ service → แท็บ **Variables** เพิ่ม:
   - `DISCORD_TOKEN` = token ของบอท
   - `CLIENT_ID` = application id
   - `GUILD_ID` = server id
   - `DB_DIR` = `/data`
   - `SEED_B64` = เนื้อหาไฟล์ `db/seed.b64` (ถ้าอยากย้ายข้อมูลจากเครื่องเดิม — ใส่ครั้งแรกครั้งเดียว)
4. คลิกขวาที่ service → **Attach Volume** → mount path = `/data`
5. รอ deploy เสร็จ → ดู **Logs** ต้องเห็น `✅ ล็อกอินสำเร็จ`
6. **ปิดบอทที่รันในเครื่อง** (ห้ามรันสองตัวพร้อมกัน จะตอบซ้อนกัน)

> อัปเดตโค้ดครั้งถัดไป: แค่ `git push` — Railway จะ build + restart ให้เอง
> ถ้าแก้ชื่อ/option ของ slash command ต้องรัน `npm run deploy` จากเครื่องด้วย
