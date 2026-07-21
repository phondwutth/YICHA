// เงินกองกลาง (cash pool) — ยอด = เงินเข้า − เงินออก คำนวณสดจาก cash_ledger
//  ดีไซน์ใหม่: รายจ่าย (/expense) ไม่ยุ่งกับกองกลาง — แถว ref_type='expense' เก่าถูกกรองทิ้ง
//  กองกลางเปลี่ยนแค่: topup (เข้า) + เบิกที่เลือก "หักกองกลาง" (ออก)
const db = require('../db');

function poolBalance() {
  const inn = db.prepare(`SELECT COALESCE(SUM(amount),0) t FROM cash_ledger WHERE type='in'`).get().t;
  const out = db
    .prepare(`SELECT COALESCE(SUM(amount),0) t FROM cash_ledger WHERE type='out' AND ref_type <> 'expense'`)
    .get().t;
  return inn - out;
}

function ledgerAdd(type, amount, refType, refId, note) {
  db.prepare(
    `INSERT INTO cash_ledger (type, amount, ref_type, ref_id, note) VALUES (?, ?, ?, ?, ?)`,
  ).run(type, amount, refType, refId, note);
}

module.exports = { poolBalance, ledgerAdd };
