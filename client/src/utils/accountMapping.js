export const CATEGORY_ACCOUNT_MAP = {
  'pcs': '71040',
  'waiver 58': '71120',
  'waiver 48': '71119',
  'iso': '71635',
  'sdpc': '71635',
  'self-directed services': '71635',
};

export const SERVICE_CODE_ACCOUNT_MAP = {
  'PCS': '71040',
  'PAS': '71040',
  'COPE': '71040',
  'TIMESHEET_PCS': '71040',
  'S5120': '71120',
  'S5125': '71120',
  'S5130': '71120',
  'TIMESHEET_HOMEMAKER': '71120',
  'TIMESHEET_CHORE': '71120',
  'S5135': '71119',
  'S5150': '71119',
  'TIMESHEET_RESPITE': '71119',
  'TIMESHEET_COMPANION': '71119',
  'SDPC': '71635',
};

export const ACCOUNT_NUMBER_OPTIONS = ['71040', '71120', '71119', '71635'];

export function getAccountForCategory(category) {
  if (!category) return '';
  return CATEGORY_ACCOUNT_MAP[category.trim().toLowerCase()] || '';
}

export function getAccountForServiceCode(serviceCode) {
  if (!serviceCode) return '';
  return SERVICE_CODE_ACCOUNT_MAP[serviceCode] || '';
}
