# Receipt Generation Module — Design Spec

## Overview

Standalone Receipts module that generates bi-weekly pay stubs for employees. Replaces the current Make.com/Monday.com receipt automation. Admin selects a bi-weekly period, system pulls hours from PayrollRun visits (EVV clients) and approved timesheets (private pay clients), admin previews/adjusts, generates PDF pay stubs, and optionally emails them to employees.

## Data Model

### PayrollProfile (one per employee)

| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK) | |
| employeeId | Int (FK → Employee, unique) | |
| hourlyRate | Decimal | Current rate |
| classification | String | `W2` or `1099` |
| ein | String | Encrypted, displayed masked |
| ssn | String | Encrypted, displayed masked (last 4 shown) |
| accountNumber | String | |
| garnishmentActive | Boolean | Default false |
| childSupportActive | Boolean | Default false |
| childSupportAmount | Decimal | Fixed amount per period |
| overpaymentBalance | Decimal | Running balance, reduced each receipt |
| ytdGrossOverride | Decimal? | Nullable — for migration period |
| ytdDeductionsOverride | Decimal? | Nullable — for migration period |
| ytdNetOverride | Decimal? | Nullable — for migration period |
| ytdOverpaymentOverride | Decimal? | Nullable — for migration period |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### PayReceipt (one per employee per bi-weekly period)

| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK) | |
| employeeId | Int (FK → Employee) | |
| periodStart | DateTime | Sunday of week 1 |
| periodEnd | DateTime | Saturday of week 2 |
| payDate | DateTime | |
| totalHours | Decimal | From sources or admin override |
| hourlyRate | Decimal | Snapshot at generation time |
| grossEarnings | Decimal | hours × rate |
| garnishment | Decimal | 18% of gross, or 0 if inactive |
| childSupport | Decimal | Fixed amount or 0 if inactive |
| overpaymentDeduction | Decimal | Deducted from balance |
| otherDeductions | Decimal | Manual entry |
| netPay | Decimal | gross + deductions (deductions are negative) |
| ytdGross | Decimal | Snapshot |
| ytdDeductions | Decimal | Snapshot |
| ytdOverpayments | Decimal | Snapshot |
| ytdNet | Decimal | Snapshot |
| classification | String | Snapshot (W2/1099) |
| status | String | `draft`, `finalized`, `sent` |
| emailSentAt | DateTime? | Null until emailed |
| notes | String | |
| createdAt | DateTime | |
| updatedAt | DateTime | |

**Constraints:** Unique on (employeeId, periodStart) — one receipt per employee per period.

## Hours Sourcing Logic

When admin selects a bi-weekly date range (Sunday–Saturday × 2), for each employee:

1. Find all clients they served in that period
2. For each client, check the client's active authorization to determine source:
   - **EVV clients** (insurance-based auth) → sum `finalPayableUnits / 4` from PayrollVisit records matching that employee name + date range
   - **Private pay clients** (no insurance auth) → sum hours from admin-approved Timesheets within that date range
3. Total hours = sum across all clients from both sources
4. Admin sees the calculated total and can override before finalizing

An employee serving both EVV and private pay clients gets one receipt combining hours from both sources.

### Pay Period Structure

- Timesheets and EVV data are **weekly** (Sun–Sat)
- Receipts are **bi-weekly** (two weeks combined)
- A receipt aggregates data from two weekly cycles

## Receipt Generation Flow (UI)

### Receipts Page (top-level, sidebar)

- **Page hero:** Title "Receipts", search bar, "+ Generate Receipts" button
- **Filter bar:** Bi-weekly period selector, status filter (Draft/Finalized/Sent/All)
- **Table:** Dark header, columns: Employee Name, Period, Gross, Deductions, Net Pay, Status, Actions
- **Sidebar visibility:** Hidden from PCA role users (admin-only page, not shown in nav)

### Generate Receipts Modal

1. Admin clicks "+ Generate Receipts"
2. Modal with:
   - Bi-weekly period selector (two date fields snapping to Sun–Sat boundaries)
   - Pay date picker
   - System fetches all active employees with a PayrollProfile
3. Preview table: employee name, calculated hours, hourly rate, gross, deductions breakdown, net pay
4. Each row editable — admin can override hours, deductions, add notes
5. Checkbox column + "Email to employee" toggle (defaults on)
6. "Generate" button:
   - If "Email to employee" checked → creates receipts and emails immediately (status = `sent`)
   - If unchecked → creates receipts in `draft` status

### Draft → Finalize → Send Flow (decoupled)

1. Receipts in `draft` — editable, admin can adjust values
2. Admin finalizes → status = `finalized`, values locked
3. Admin selects finalized receipts → "Send" button → emails PDF, status = `sent`
4. Admin can re-send previously sent receipts or download PDF at any status

## PDF Receipt Layout

Portrait LETTER, generated with pdfkit.

```
┌─────────────────────────────────────────────────┐
│  Nevada Best PCA, LLC                           │
│  PAY STATEMENT                                  │
├─────────────────────────────────────────────────┤
│  Employee: John Smith                           │
│  Address: 123 Main St, Las Vegas, NV 89101      │
│  SSN/EIN: ●●●-●●-1234                          │
│  Account #: 78901                               │
│  Classification: W2                             │
├─────────────────────────────────────────────────┤
│  Pay Period: Jun 1, 2026 – Jun 14, 2026         │
│  Pay Date: Jun 18, 2026                         │
├─────────────────────────────────────────────────┤
│  EARNINGS                                       │
│  Description    Hours    Rate    Current    YTD  │
│  Regular        80.00   $15.00  $1,200.00  $15,600│
├─────────────────────────────────────────────────┤
│  DEDUCTIONS                                     │
│  Description          Current       YTD         │
│  Garnishment (18%)   -$216.00    -$2,808.00     │
│  Child Support        -$0.00       -$0.00       │
│  Overpayment         -$50.00     -$200.00       │
│  Other Deductions     -$0.00       -$0.00       │
├─────────────────────────────────────────────────┤
│  NET PAY             $934.00    $12,592.00      │
├─────────────────────────────────────────────────┤
│  Nevada Best PCA, LLC                           │
└─────────────────────────────────────────────────┘
```

## Email Delivery

- **From:** Existing Brevo config (`EMAIL_FROM_NAME` / `EMAIL_FROM`)
- **To:** Employee's email from their profile
- **Subject:** "Nevada Best PCA / Payroll services"
- **Body:**
  ```
  Hi [Name],

  We've attached your paystub for this pay period [MMM D, YYYY] - [MMM D, YYYY]
  Thank you for being a part of our team!

  Nevada Best PCA, LLC
  ```
- **Attachment:** Generated PDF receipt

### Error Handling

- Employee has no email → receipt generates, status stays `finalized`, admin sees "No email" warning badge
- Email fails → status stays `finalized`, error logged, admin can retry
- Re-send available on previously sent receipts

## PayrollProfile Management

### Location

New "Payroll" tab on Employee Detail page.

### Fields

- Hourly rate
- Classification (W2 / 1099 dropdown)
- EIN (masked ●●●-●●-●●●●, reveal on click with confirmation)
- SSN (masked ●●●-●●-1234, reveal on click with confirmation)
- Account number
- Garnishment active (toggle)
- Child support active (toggle) + amount field
- Overpayment balance (current balance displayed, admin can adjust)
- YTD overrides section (collapsible — gross, deductions, overpayments, net)

### Rate Snapshots

When hourly rate changes, existing receipts retain their snapshotted rate. Profile always shows current rate.

### Sensitive Data

SSN/EIN stored encrypted in the database. Displayed masked in UI. Full value revealed only on click with confirmation.

## Overpayment Balance Tracking

- `overpaymentBalance` on PayrollProfile = what employee still owes
- Admin sets initial balance manually
- During receipt generation: if balance > 0, system suggests a deduction amount (admin can adjust)
- After receipt is finalized, deducted amount subtracted from balance
- Balance reaches $0 → no more overpayment deductions suggested

### UI Indicators

- Receipt generation preview: employees with active overpayment show warning badge with remaining balance
- PayrollProfile tab: balance prominent with deduction history

### Edge Cases

- If suggested deduction exceeds net pay → system caps so net pay doesn't go negative, admin sees warning
- Admin can override to $0 for a period (pause deduction) without clearing balance

## YTD Calculation Logic

### Default (automatic)

- YTD Gross = sum of `grossEarnings` from all finalized/sent receipts for that employee in current calendar year
- YTD Deductions = sum of (garnishment + childSupport + otherDeductions) in the year
- YTD Overpayments = sum of `overpaymentDeduction` in the year
- YTD Net = sum of `netPay` in the year

### Override (migration period)

- If `ytdGrossOverride` set on PayrollProfile → first receipt uses that as starting base, subsequent receipts add on top
- Calculation: override value + sum of all app-generated receipts for the year
- Admin clears overrides once all data lives in app
- Overrides are additive, not replacements

### Year Boundary

- January 1 resets YTD (only sums receipts with `periodStart` in current year)
- Overrides persist until manually cleared — admin should reset at year start if no longer needed

## Permissions & Access Control

### Admin

- Generate, edit, finalize, send receipts
- Manage PayrollProfile (rates, SSN, deductions)
- View all receipts across all employees
- Adjust overpayment balances
- Override YTD values
- Bulk operations (generate all, send all)

### PCA Role

- No access to Receipts page
- Receipts nav item hidden from sidebar
- No access to Payroll tab on Employee Detail
- Cannot see compensation data, SSN/EIN, or receipt details

## Technical Notes

- PDF generation: `pdfkit` (already a dependency)
- Email: `sib-api-v3-sdk` via `notificationService` — existing `sendEmail()` must be extended to accept an `attachments` array (Brevo API supports `attachment: [{ content: base64, name: filename }]`)
- Encryption for SSN/EIN: use Node.js `crypto` module (AES-256-GCM) with a `ENCRYPTION_KEY` env var
- Bi-weekly period snapping: utility function that given any date returns the containing bi-weekly period (Sun–Sat × 2)
- Employee name matching for PayrollVisit: reuse existing `normalizeName()` from payrollService
- Immediate-send flow (generate + email): overpayment balance is still deducted and receipt is fully computed before sending — the `sent` status just means it skipped the manual review step
