function chooseOne(items, rng) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * totalWeight;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items.at(-1);
}

export function chooseDesserts(desserts, count = 3, rng = Math.random) {
  const pool = (Array.isArray(desserts) ? desserts : []).filter(
    (dessert) => dessert.active !== false && Number.isFinite(dessert.weight) && dessert.weight > 0,
  );
  const result = [];
  while (pool.length > 0 && result.length < count) {
    const selected = chooseOne(pool, rng);
    result.push(selected);
    pool.splice(pool.indexOf(selected), 1);
  }
  return result;
}
