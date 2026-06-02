export const CATEGORY_ACCOUNT_MAP = {
  'pcs': '71040',
  'waiver 58': '71120',
  'waiver 48': '71119',
  'iso': '71635',
  'sdpc': '71635',
  'self-directed services': '71635',
};

export const ACCOUNT_NUMBER_OPTIONS = ['71040', '71120', '71119', '71635'];

export function getAccountForCategory(category) {
  if (!category) return '';
  return CATEGORY_ACCOUNT_MAP[category.trim().toLowerCase()] || '';
}
