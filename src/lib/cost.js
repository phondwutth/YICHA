// คำนวณต้นทุนต่อแก้วจากสูตร (version ที่ใช้จริง)
//  size = null -> คิดเฉพาะส่วนผสมที่ไม่ระบุไซซ์
//  size = 'M'  -> คิดส่วนผสมที่ไม่ระบุไซซ์ + ที่ระบุ 'M'
const db = require('../db');

function computeCost(recipeId, size = null) {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
  if (!recipe || !recipe.current_version) return null;

  const rows = db
    .prepare(
      `SELECT ri.quantity, ri.size, i.name, i.type, i.current_cost, i.base_unit
       FROM recipe_items ri JOIN items i ON i.id = ri.item_id
       WHERE ri.recipe_version_id = ?`,
    )
    .all(recipe.current_version);

  const used = rows.filter((r) => r.size == null || r.size === size);
  let ingredient = 0;
  let packaging = 0;
  const lines = [];
  for (const r of used) {
    const c = r.quantity * r.current_cost;
    if (r.type === 'ingredient') ingredient += c;
    else packaging += c;
    lines.push({ name: r.name, qty: r.quantity, unit: r.base_unit, cost: c });
  }
  return {
    recipe,
    ingredient,
    packaging,
    total: ingredient + packaging,
    lines,
    empty: used.length === 0,
  };
}

module.exports = { computeCost };
