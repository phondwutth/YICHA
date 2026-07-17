// ตัวช่วยสร้างช่องในฟอร์ม modal (ลดโค้ดซ้ำในทุกคำสั่ง)
const {
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');

// ช่องพิมพ์ข้อความ — label ห้ามยาวเกิน 45 ตัวอักษร (ลิมิตของ Discord)
function textField(id, label, { placeholder, required = false, paragraph = false, maxLength } = {}) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(required);
  if (placeholder) input.setPlaceholder(placeholder);
  if (maxLength) input.setMaxLength(maxLength);
  return new LabelBuilder().setLabel(label).setTextInputComponent(input);
}

// ช่อง dropdown — options: [{ label, value, default? }]
function selectField(id, label, options) {
  return new LabelBuilder().setLabel(label).setStringSelectMenuComponent(
    new StringSelectMenuBuilder().setCustomId(id).addOptions(
      ...options.map((o) => {
        const b = new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value);
        if (o.default) b.setDefault(true);
        return b;
      }),
    ),
  );
}

// แปลงข้อความเป็นตัวเลข (รองรับใส่ลูกน้ำ) — คืน null ถ้าไม่ใช่เลข
function num(str) {
  const s = String(str).replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

module.exports = { textField, selectField, num };
