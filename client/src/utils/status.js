export function statusLabel(s) {
    if (s === 'OK') return 'OK';
    if (s === 'Renewal Reminder') return 'Renewal Reminder';
    if (s === 'Expired') return 'Expired';
    return s;
}

export function visitRowClass(v) {
    if (v.needsReview)    return 'payroll-row--needs-review';
    if (v.voidFlag)       return 'payroll-row--void';
    if (v.isIncomplete)   return 'payroll-row--incomplete';
    if (v.isUnauthorized) return 'payroll-row--unauthorized';
    if (v.overlapId)      return 'payroll-row--overlap';
    return '';
}
