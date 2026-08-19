/** Shared plastic category labels (CPCB EPR). */
export const PLASTIC_CATEGORIES = ['Cat-I', 'Cat-II', 'Cat-III', 'Cat-IV'];

export function normalizePlasticCategory(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '').toLowerCase();
  if (['cat-i', 'cati', 'categoryi', 'category-i', 'cat1', 'i'].includes(compact)) return 'Cat-I';
  if (['cat-ii', 'catii', 'categoryii', 'category-ii', 'cat2', 'ii'].includes(compact)) return 'Cat-II';
  if (['cat-iii', 'catiii', 'categoryiii', 'category-iii', 'cat3', 'iii'].includes(compact)) return 'Cat-III';
  if (['cat-iv', 'cativ', 'categoryiv', 'category-iv', 'cat4', 'iv'].includes(compact)) return 'Cat-IV';
  if (PLASTIC_CATEGORIES.includes(raw)) return raw;
  return raw;
}

export function emptyCategoryMtMap() {
  return Object.fromEntries([...PLASTIC_CATEGORIES.map((c) => [c, 0]), ['total', 0]]);
}
