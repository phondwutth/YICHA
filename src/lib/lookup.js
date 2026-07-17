// ค้นหา item / recipe จากตัวเลข (id) หรือชื่อ (ตรงตัว -> เดาจากบางส่วน)
const db = require('../db');

function findItem(q) {
  if (/^\d+$/.test(q)) return db.prepare('SELECT * FROM items WHERE id = ?').get(Number(q));
  return (
    db.prepare('SELECT * FROM items WHERE name = ? COLLATE NOCASE').get(q) ||
    db.prepare('SELECT * FROM items WHERE name LIKE ? COLLATE NOCASE').get('%' + q + '%')
  );
}

function findRecipe(q) {
  if (/^\d+$/.test(q)) return db.prepare('SELECT * FROM recipes WHERE id = ?').get(Number(q));
  return (
    db.prepare('SELECT * FROM recipes WHERE name = ? COLLATE NOCASE').get(q) ||
    db.prepare('SELECT * FROM recipes WHERE name LIKE ? COLLATE NOCASE').get('%' + q + '%')
  );
}

module.exports = { findItem, findRecipe };
