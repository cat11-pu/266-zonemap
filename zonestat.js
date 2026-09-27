// zonestat.js：分块内容的最小值 / 最大值与包含判定（纯函数，空块给一对零）
export function minMax(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    return [0, 0];
  }
  let min = list[0];
  let max = list[0];
  for (let i = 1; i < list.length; i += 1) {
    const value = list[i];
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  return [min, max];
}

export function contains(rows, value) {
  const list = Array.isArray(rows) ? rows : [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] === value) {
      return true;
    }
  }
  return false;
}
