// zonestat.js：统计计算
export function minMax(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [0, 0];
  let min = rows[0];
  let max = rows[0];
  for (const value of rows) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return [min, max];
}

export function contains(rows, value) {
  return Array.isArray(rows) && rows.indexOf(value) !== -1;
}
