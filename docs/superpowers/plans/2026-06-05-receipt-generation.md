# Receipt Generation Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Receipts module that generates bi-weekly PDF pay stubs for employees, replacing the Make.com/Monday.com automation.

**Architecture:** New PayrollProfile model stores per-employee pay configuration (rate, SSN, deductions). PayReceipt model stores generated receipts per bi-weekly period. A receipt service computes earnings/deductions and generates PDFs via pdfkit. Frontend is a new top-level Receipts page (admin-only) plus a Payroll tab on Employee Detail.

**Tech Stack:** Express + Prisma + PostgreSQL (backend), pdfkit (PDF), Brevo/sib-api-v3-sdk (email), React + Vite (frontend)

---

## File Structure

### Backend (new files)
- `server/prisma/migrations/YYYYMMDD_receipt_module/migration.sql` — PayrollProfile + PayReceipt tables
- `server/src/services/receiptService.js` — receipt computation logic (hours sourcing, deductions, YTD, PDF generation)
- `server/src/services/encryptionService.js` — AES-256-GCM encrypt/decrypt for SSN/EIN
- `server/src/controllers/receiptController.js` — REST handlers for receipts CRUD + send
- `server/src/controllers/payrollProfileController.js` — REST handlers for payroll profile CRUD
- `server/src/services/__tests__/receiptService.test.js` — unit tests for receipt computation
- `server/src/services/__tests__/encryptionService.test.js` — unit tests for encryption

### Backend (modified files)
- `server/prisma/schema.prisma` — add PayrollProfile + PayReceipt models
- `server/src/routes/api.js` — register new routes
- `server/src/services/notificationService.js` — add attachment support to `sendEmail()`

### Frontend (new files)
- `client/src/pages/ReceiptsPage.jsx` — top-level receipts list + generation modal
- `client/src/pages/employee-tabs/PayrollTab.jsx` — payroll profile management tab

### Frontend (modified files)
- `client/src/api.js` — add receipt + payroll profile API functions
- `client/src/components/layout/Sidebar.jsx` — add Receipts nav item (admin-only)
- `client/src/pages/EmployeeDetailPage.jsx` — add Payroll tab
- `client/src/App.jsx` (or router config) — add `/receipts` route

---

## Task 1: Encryption Service

**Files:**
- Create: `server/src/services/encryptionService.js`
- Create: `server/src/services/__tests__/encryptionService.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/services/__tests__/encryptionService.test.js
const { encrypt, decrypt, maskSSN, maskEIN } = require('../encryptionService');

describe('encryptionService', () => {
    beforeAll(() => {
        process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex
    });

    test('encrypts and decrypts a string', () => {
        const plain = '123-45-6789';
        const encrypted = encrypt(plain);
        expect(encrypted).not.toBe(plain);
        expect(encrypted).toContain(':'); // iv:authTag:ciphertext
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(plain);
    });

    test('returns empty string for empty input', () => {
        expect(encrypt('')).toBe('');
        expect(decrypt('')).toBe('');
    });

    test('maskSSN shows last 4', () => {
        expect(maskSSN('123-45-6789')).toBe('***-**-6789');
    });

    test('maskSSN handles empty', () => {
        expect(maskSSN('')).toBe('');
    });

    test('maskEIN shows last 4', () => {
        expect(maskEIN('12-3456789')).toBe('**-***6789');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest --testPathPattern=encryptionService --verbose`
Expected: FAIL with "Cannot find module '../encryptionService'"

- [ ] **Step 3: Write minimal implementation**

```js
// server/src/services/encryptionService.js
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) throw new Error('ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
    return Buffer.from(hex, 'hex');
}

function encrypt(plaintext) {
    if (!plaintext) return '';
    const key = getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(ciphertext) {
    if (!ciphertext) return '';
    const key = getKey();
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function maskSSN(ssn) {
    if (!ssn) return '';
    const digits = ssn.replace(/\D/g, '');
    if (digits.length < 4) return '***';
    return `***-**-${digits.slice(-4)}`;
}

function maskEIN(ein) {
    if (!ein) return '';
    const digits = ein.replace(/\D/g, '');
    if (digits.length < 4) return '***';
    return `**-***${digits.slice(-4)}`;
}

module.exports = { encrypt, decrypt, maskSSN, maskEIN };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest --testPathPattern=encryptionService --verbose`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/services/encryptionService.js server/src/services/__tests__/encryptionService.test.js
git commit -m "feat(receipts): add encryption service for SSN/EIN storage"
```

---

## Task 2: Database Schema — PayrollProfile + PayReceipt

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: migration via `prisma migrate dev`

- [ ] **Step 1: Add models to schema.prisma**

Add after the `PayrollVisit` model block (around line 461):

```prisma
model PayrollProfile {
  id                     Int       @id @default(autoincrement())
  employeeId             Int       @unique @map("employee_id")
  hourlyRate             Decimal   @default(0) @map("hourly_rate") @db.Decimal(10, 2)
  classification         String    @default("W2") @map("classification")
  ein                    String    @default("") @map("ein")
  ssn                    String    @default("") @map("ssn")
  accountNumber          String    @default("") @map("account_number")
  garnishmentActive      Boolean   @default(false) @map("garnishment_active")
  childSupportActive     Boolean   @default(false) @map("child_support_active")
  childSupportAmount     Decimal   @default(0) @map("child_support_amount") @db.Decimal(10, 2)
  overpaymentBalance     Decimal   @default(0) @map("overpayment_balance") @db.Decimal(10, 2)
  ytdGrossOverride       Decimal?  @map("ytd_gross_override") @db.Decimal(10, 2)
  ytdDeductionsOverride  Decimal?  @map("ytd_deductions_override") @db.Decimal(10, 2)
  ytdNetOverride         Decimal?  @map("ytd_net_override") @db.Decimal(10, 2)
  ytdOverpaymentOverride Decimal?  @map("ytd_overpayment_override") @db.Decimal(10, 2)
  createdAt              DateTime  @default(now()) @map("created_at")
  updatedAt              DateTime  @updatedAt @map("updated_at")

  employee               Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@map("payroll_profiles")
}

model PayReceipt {
  id                   Int       @id @default(autoincrement())
  employeeId           Int       @map("employee_id")
  periodStart          DateTime  @map("period_start")
  periodEnd            DateTime  @map("period_end")
  payDate              DateTime  @map("pay_date")
  totalHours           Decimal   @default(0) @map("total_hours") @db.Decimal(10, 2)
  hourlyRate           Decimal   @default(0) @map("hourly_rate") @db.Decimal(10, 2)
  grossEarnings        Decimal   @default(0) @map("gross_earnings") @db.Decimal(10, 2)
  garnishment          Decimal   @default(0) @map("garnishment") @db.Decimal(10, 2)
  childSupport         Decimal   @default(0) @map("child_support") @db.Decimal(10, 2)
  overpaymentDeduction Decimal   @default(0) @map("overpayment_deduction") @db.Decimal(10, 2)
  otherDeductions      Decimal   @default(0) @map("other_deductions") @db.Decimal(10, 2)
  netPay               Decimal   @default(0) @map("net_pay") @db.Decimal(10, 2)
  ytdGross             Decimal   @default(0) @map("ytd_gross") @db.Decimal(10, 2)
  ytdDeductions        Decimal   @default(0) @map("ytd_deductions") @db.Decimal(10, 2)
  ytdOverpayments      Decimal   @default(0) @map("ytd_overpayments") @db.Decimal(10, 2)
  ytdNet               Decimal   @default(0) @map("ytd_net") @db.Decimal(10, 2)
  classification       String    @default("W2") @map("classification")
  status               String    @default("draft") @map("status")
  emailSentAt          DateTime? @map("email_sent_at")
  notes                String    @default("") @map("notes")
  createdAt            DateTime  @default(now()) @map("created_at")
  updatedAt            DateTime  @updatedAt @map("updated_at")

  employee             Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([employeeId, periodStart])
  @@index([employeeId])
  @@index([periodStart])
  @@map("pay_receipts")
}
```

- [ ] **Step 2: Add relations to Employee model**

In the `Employee` model (around line 73), add:

```prisma
  payrollProfile          PayrollProfile?
  receipts                PayReceipt[]
```

- [ ] **Step 3: Run migration**

Run: `cd server && npx prisma migrate dev --name receipt_module`
Expected: Migration created and applied successfully

- [ ] **Step 4: Verify with Prisma generate**

Run: `cd server && npx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat(receipts): add PayrollProfile and PayReceipt schema"
```

---

## Task 3: Receipt Service — Hours Sourcing + Computation

**Files:**
- Create: `server/src/services/receiptService.js`
- Create: `server/src/services/__tests__/receiptService.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// server/src/services/__tests__/receiptService.test.js
const {
    computeReceipt,
    computeYTD,
    snapBiweeklyPeriod,
} = require('../receiptService');

describe('snapBiweeklyPeriod', () => {
    test('snaps a Wednesday to its containing bi-weekly Sun-Sat period', () => {
        // Wed Jun 4 2026 → period starts Sun Jun 1, ends Sat Jun 14
        const { periodStart, periodEnd } = snapBiweeklyPeriod(new Date('2026-06-04'));
        expect(periodStart.toISOString().slice(0, 10)).toBe('2026-06-01');
        expect(periodEnd.toISOString().slice(0, 10)).toBe('2026-06-14');
    });

    test('a Sunday returns itself as period start', () => {
        const { periodStart } = snapBiweeklyPeriod(new Date('2026-06-01'));
        expect(periodStart.toISOString().slice(0, 10)).toBe('2026-06-01');
    });
});

describe('computeReceipt', () => {
    test('calculates gross, garnishment, and net pay', () => {
        const result = computeReceipt({
            totalHours: 80,
            hourlyRate: 15,
            garnishmentActive: true,
            childSupportActive: false,
            childSupportAmount: 0,
            overpaymentDeduction: 50,
            otherDeductions: 0,
        });
        expect(result.grossEarnings).toBe(1200);       // 80 * 15
        expect(result.garnishment).toBe(-216);          // -(1200 * 0.18)
        expect(result.childSupport).toBe(0);
        expect(result.overpaymentDeduction).toBe(-50);
        expect(result.netPay).toBe(934);                // 1200 - 216 - 50
    });

    test('no garnishment when inactive', () => {
        const result = computeReceipt({
            totalHours: 40,
            hourlyRate: 20,
            garnishmentActive: false,
            childSupportActive: true,
            childSupportAmount: 100,
            overpaymentDeduction: 0,
            otherDeductions: 25,
        });
        expect(result.grossEarnings).toBe(800);
        expect(result.garnishment).toBe(0);
        expect(result.childSupport).toBe(-100);
        expect(result.otherDeductions).toBe(-25);
        expect(result.netPay).toBe(675);
    });

    test('caps overpayment so net pay does not go negative', () => {
        const result = computeReceipt({
            totalHours: 10,
            hourlyRate: 10,
            garnishmentActive: true,
            childSupportActive: false,
            childSupportAmount: 0,
            overpaymentDeduction: 500, // more than gross
            otherDeductions: 0,
        });
        // gross = 100, garnishment = -18, available for overpayment = 82
        expect(result.grossEarnings).toBe(100);
        expect(result.garnishment).toBe(-18);
        expect(result.overpaymentDeduction).toBe(-82); // capped
        expect(result.netPay).toBe(0);
    });
});

describe('computeYTD', () => {
    test('sums prior receipts for the year', () => {
        const priorReceipts = [
            { grossEarnings: 1200, garnishment: -216, childSupport: 0, otherDeductions: 0, overpaymentDeduction: -50, netPay: 934 },
            { grossEarnings: 1000, garnishment: -180, childSupport: -100, otherDeductions: 0, overpaymentDeduction: 0, netPay: 720 },
        ];
        const current = { grossEarnings: 800, garnishment: 0, childSupport: 0, otherDeductions: 0, overpaymentDeduction: 0, netPay: 800 };
        const ytd = computeYTD(priorReceipts, current, {});
        expect(ytd.ytdGross).toBe(3000);       // 1200+1000+800
        expect(ytd.ytdDeductions).toBe(-496);   // -216 + -180 + -100 + 0
        expect(ytd.ytdOverpayments).toBe(-50);
        expect(ytd.ytdNet).toBe(2454);          // 934+720+800
    });

    test('adds override to computed YTD', () => {
        const priorReceipts = [
            { grossEarnings: 500, garnishment: 0, childSupport: 0, otherDeductions: 0, overpaymentDeduction: 0, netPay: 500 },
        ];
        const current = { grossEarnings: 500, garnishment: 0, childSupport: 0, otherDeductions: 0, overpaymentDeduction: 0, netPay: 500 };
        const overrides = { ytdGrossOverride: 5000, ytdNetOverride: 4500 };
        const ytd = computeYTD(priorReceipts, current, overrides);
        expect(ytd.ytdGross).toBe(6000);  // 5000 + 500 + 500
        expect(ytd.ytdNet).toBe(5500);    // 4500 + 500 + 500
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest --testPathPattern=receiptService --verbose`
Expected: FAIL with "Cannot find module '../receiptService'"

- [ ] **Step 3: Write implementation**

```js
// server/src/services/receiptService.js
const prisma = require('../lib/prisma');

const GARNISHMENT_RATE = 0.18;

function snapBiweeklyPeriod(date) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    const dayOfWeek = d.getUTCDay(); // 0=Sun
    const periodStart = new Date(d);
    periodStart.setUTCDate(d.getUTCDate() - dayOfWeek);
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCDate(periodStart.getUTCDate() + 13); // 2 weeks - 1 day
    return { periodStart, periodEnd };
}

function computeReceipt({ totalHours, hourlyRate, garnishmentActive, childSupportActive, childSupportAmount, overpaymentDeduction, otherDeductions }) {
    const grossEarnings = totalHours * hourlyRate;
    const garnishment = garnishmentActive ? -(grossEarnings * GARNISHMENT_RATE) : 0;
    const childSupport = childSupportActive ? -Math.abs(childSupportAmount || 0) : 0;
    const otherDed = -Math.abs(otherDeductions || 0);

    // Cap overpayment so net doesn't go negative
    const availableForOverpayment = grossEarnings + garnishment + childSupport + otherDed;
    const requestedOverpayment = Math.abs(overpaymentDeduction || 0);
    const cappedOverpayment = Math.min(requestedOverpayment, Math.max(0, availableForOverpayment));
    const overpaymentDed = cappedOverpayment > 0 ? -cappedOverpayment : 0;

    const netPay = grossEarnings + garnishment + childSupport + otherDed + overpaymentDed;

    return {
        grossEarnings: Math.round(grossEarnings * 100) / 100,
        garnishment: Math.round(garnishment * 100) / 100,
        childSupport: Math.round(childSupport * 100) / 100,
        otherDeductions: Math.round(otherDed * 100) / 100,
        overpaymentDeduction: Math.round(overpaymentDed * 100) / 100,
        netPay: Math.round(netPay * 100) / 100,
    };
}

function computeYTD(priorReceipts, current, overrides) {
    let ytdGross = (overrides.ytdGrossOverride || 0);
    let ytdDeductions = (overrides.ytdDeductionsOverride || 0);
    let ytdOverpayments = (overrides.ytdOverpaymentOverride || 0);
    let ytdNet = (overrides.ytdNetOverride || 0);

    for (const r of priorReceipts) {
        ytdGross += Number(r.grossEarnings);
        ytdDeductions += Number(r.garnishment) + Number(r.childSupport) + Number(r.otherDeductions);
        ytdOverpayments += Number(r.overpaymentDeduction);
        ytdNet += Number(r.netPay);
    }

    ytdGross += current.grossEarnings;
    ytdDeductions += current.garnishment + current.childSupport + current.otherDeductions;
    ytdOverpayments += current.overpaymentDeduction;
    ytdNet += current.netPay;

    return {
        ytdGross: Math.round(ytdGross * 100) / 100,
        ytdDeductions: Math.round(ytdDeductions * 100) / 100,
        ytdOverpayments: Math.round(ytdOverpayments * 100) / 100,
        ytdNet: Math.round(ytdNet * 100) / 100,
    };
}

async function getEmployeeHours(employeeId, employeeName, periodStart, periodEnd) {
    // EVV hours: from PayrollVisit records in any run within the period
    const evvVisits = await prisma.payrollVisit.findMany({
        where: {
            employeeName: { contains: employeeName, mode: 'insensitive' },
            visitDate: { gte: periodStart, lte: periodEnd },
            needsReview: false,
            voidFlag: false,
        },
    });
    const evvHours = evvVisits.reduce((sum, v) => sum + (v.finalPayableUnits / 4), 0);

    // Private pay hours: from approved timesheets where this employee is the PCA
    const timesheets = await prisma.timesheet.findMany({
        where: {
            pcaId: employeeId,
            status: 'accepted',
            weekStart: { gte: periodStart, lte: periodEnd },
        },
        include: { entries: true },
    });
    const tsHours = timesheets.reduce((sum, ts) => {
        return sum + ts.entries.reduce((eSum, e) => eSum + (Number(e.totalHours) || 0), 0);
    }, 0);

    return Math.round((evvHours + tsHours) * 100) / 100;
}

async function getPriorReceipts(employeeId, periodStart) {
    const yearStart = new Date(periodStart.getUTCFullYear(), 0, 1);
    return prisma.payReceipt.findMany({
        where: {
            employeeId,
            periodStart: { gte: yearStart, lt: periodStart },
            status: { in: ['finalized', 'sent'] },
        },
        orderBy: { periodStart: 'asc' },
    });
}

module.exports = {
    snapBiweeklyPeriod,
    computeReceipt,
    computeYTD,
    getEmployeeHours,
    getPriorReceipts,
    GARNISHMENT_RATE,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest --testPathPattern=receiptService --verbose`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/services/receiptService.js server/src/services/__tests__/receiptService.test.js
git commit -m "feat(receipts): add receipt computation service with tests"
```

---

## Task 4: PDF Generation

**Files:**
- Modify: `server/src/services/receiptService.js` (add `generateReceiptPdf`)

- [ ] **Step 1: Write the failing test**

Add to `server/src/services/__tests__/receiptService.test.js`:

```js
const { generateReceiptPdf } = require('../receiptService');

describe('generateReceiptPdf', () => {
    test('returns a Buffer containing PDF data', async () => {
        const receipt = {
            employee: { name: 'John Smith', address: '123 Main St, Las Vegas, NV' },
            ssn: '***-**-6789',
            ein: '',
            accountNumber: '78901',
            classification: 'W2',
            periodStart: new Date('2026-06-01'),
            periodEnd: new Date('2026-06-14'),
            payDate: new Date('2026-06-18'),
            totalHours: 80,
            hourlyRate: 15,
            grossEarnings: 1200,
            garnishment: -216,
            childSupport: 0,
            overpaymentDeduction: -50,
            otherDeductions: 0,
            netPay: 934,
            ytdGross: 15600,
            ytdDeductions: -2808,
            ytdOverpayments: -200,
            ytdNet: 12592,
        };
        const buffer = await generateReceiptPdf(receipt);
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer.length).toBeGreaterThan(500);
        // PDF magic bytes
        expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest --testPathPattern=receiptService --verbose`
Expected: FAIL — `generateReceiptPdf is not a function`

- [ ] **Step 3: Write implementation**

Add to `server/src/services/receiptService.js`:

```js
const PDFDocument = require('pdfkit');

function fmtMoney(n) {
    const abs = Math.abs(Number(n));
    const formatted = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return Number(n) < 0 ? `-${formatted}` : formatted;
}

function fmtDate(d) {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

async function generateReceiptPdf(receipt) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 40, left: 50, right: 50 } });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - 100; // margins

        // Header
        doc.fontSize(18).font('Helvetica-Bold').text('Nevada Best PCA, LLC', { align: 'center' });
        doc.fontSize(14).font('Helvetica').text('PAY STATEMENT', { align: 'center' });
        doc.moveDown(1);

        // Divider
        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(0.5);

        // Employee info
        doc.fontSize(10).font('Helvetica');
        doc.text(`Employee: ${receipt.employee.name}`);
        if (receipt.employee.address) doc.text(`Address: ${receipt.employee.address}`);
        if (receipt.ssn) doc.text(`SSN: ${receipt.ssn}`);
        if (receipt.ein) doc.text(`EIN: ${receipt.ein}`);
        if (receipt.accountNumber) doc.text(`Account #: ${receipt.accountNumber}`);
        doc.text(`Classification: ${receipt.classification}`);
        doc.moveDown(0.5);

        // Divider
        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(0.5);

        // Pay period
        doc.text(`Pay Period: ${fmtDate(receipt.periodStart)} – ${fmtDate(receipt.periodEnd)}`);
        doc.text(`Pay Date: ${fmtDate(receipt.payDate)}`);
        doc.moveDown(0.5);

        // Divider
        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(0.5);

        // Earnings table
        doc.font('Helvetica-Bold').fontSize(11).text('EARNINGS');
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica-Bold');
        const earningsY = doc.y;
        doc.text('Description', 50, earningsY, { width: 150 });
        doc.text('Hours', 200, earningsY, { width: 70, align: 'right' });
        doc.text('Rate', 270, earningsY, { width: 70, align: 'right' });
        doc.text('Current', 370, earningsY, { width: 90, align: 'right' });
        doc.text('YTD', 460, earningsY, { width: 90, align: 'right' });
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(9);
        const earningsRowY = doc.y;
        doc.text('Regular Earnings', 50, earningsRowY, { width: 150 });
        doc.text(Number(receipt.totalHours).toFixed(2), 200, earningsRowY, { width: 70, align: 'right' });
        doc.text(fmtMoney(receipt.hourlyRate), 270, earningsRowY, { width: 70, align: 'right' });
        doc.text(fmtMoney(receipt.grossEarnings), 370, earningsRowY, { width: 90, align: 'right' });
        doc.text(fmtMoney(receipt.ytdGross), 460, earningsRowY, { width: 90, align: 'right' });
        doc.moveDown(1);

        // Divider
        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(0.5);

        // Deductions table
        doc.font('Helvetica-Bold').fontSize(11).text('DEDUCTIONS');
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica-Bold');
        const dedHeaderY = doc.y;
        doc.text('Description', 50, dedHeaderY, { width: 200 });
        doc.text('Current', 370, dedHeaderY, { width: 90, align: 'right' });
        doc.text('YTD', 460, dedHeaderY, { width: 90, align: 'right' });
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(9);

        const deductions = [
            { label: 'Garnishment (18%)', current: receipt.garnishment, ytd: null },
            { label: 'Child Support', current: receipt.childSupport, ytd: null },
            { label: 'Overpayment', current: receipt.overpaymentDeduction, ytd: receipt.ytdOverpayments },
            { label: 'Other Deductions', current: receipt.otherDeductions, ytd: null },
        ];
        // Compute YTD deductions per-line (simplified: use total YTD deductions for garnishment line)
        const ytdDedTotal = receipt.ytdDeductions;

        for (let i = 0; i < deductions.length; i++) {
            const row = deductions[i];
            const rowY = doc.y;
            doc.text(row.label, 50, rowY, { width: 200 });
            doc.text(fmtMoney(row.current), 370, rowY, { width: 90, align: 'right' });
            if (i === 0) {
                doc.text(fmtMoney(ytdDedTotal), 460, rowY, { width: 90, align: 'right' });
            } else if (row.ytd !== null) {
                doc.text(fmtMoney(row.ytd), 460, rowY, { width: 90, align: 'right' });
            } else {
                doc.text('—', 460, rowY, { width: 90, align: 'right' });
            }
            doc.moveDown(0.5);
        }
        doc.moveDown(0.5);

        // Divider
        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(0.5);

        // Net Pay
        doc.font('Helvetica-Bold').fontSize(12);
        const netY = doc.y;
        doc.text('NET PAY', 50, netY, { width: 200 });
        doc.text(fmtMoney(receipt.netPay), 370, netY, { width: 90, align: 'right' });
        doc.text(fmtMoney(receipt.ytdNet), 460, netY, { width: 90, align: 'right' });
        doc.moveDown(2);

        // Footer
        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(9).text('Nevada Best PCA, LLC', { align: 'center' });

        doc.end();
    });
}

// Add to module.exports
```

Update the `module.exports` at the bottom to include `generateReceiptPdf`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest --testPathPattern=receiptService --verbose`
Expected: PASS (all tests including new PDF test)

- [ ] **Step 5: Commit**

```bash
git add server/src/services/receiptService.js server/src/services/__tests__/receiptService.test.js
git commit -m "feat(receipts): add PDF generation with pdfkit"
```

---

## Task 5: Extend Email Service with Attachment Support

**Files:**
- Modify: `server/src/services/notificationService.js`

- [ ] **Step 1: Modify sendEmail to accept attachments**

Update `sendEmail` in `notificationService.js`:

```js
async function sendEmail(to, subject, html, text, attachments) {
    if (!isEmailConfigured()) throw new Error('Email not configured — set BREVO_API_KEY');
    const SibApiV3Sdk = require('sib-api-v3-sdk');
    const client = SibApiV3Sdk.ApiClient.instance;
    client.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.sender = {
        name: process.env.EMAIL_FROM_NAME || 'NV Best PCA',
        email: process.env.EMAIL_FROM || 'noreply@nvbestpca.com',
    };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;
    if (text) sendSmtpEmail.textContent = text;
    if (attachments && attachments.length > 0) {
        sendSmtpEmail.attachment = attachments.map(a => ({
            content: a.content, // base64 string
            name: a.name,
        }));
    }
    return apiInstance.sendTransacEmail(sendSmtpEmail);
}
```

- [ ] **Step 2: Verify existing tests still pass (if any) and server starts**

Run: `cd server && npm test`
Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
git add server/src/services/notificationService.js
git commit -m "feat(receipts): extend sendEmail with attachment support"
```

---

## Task 6: Payroll Profile Controller + Routes

**Files:**
- Create: `server/src/controllers/payrollProfileController.js`
- Modify: `server/src/routes/api.js`

- [ ] **Step 1: Create controller**

```js
// server/src/controllers/payrollProfileController.js
const prisma = require('../lib/prisma');
const { encrypt, decrypt, maskSSN, maskEIN } = require('../services/encryptionService');
const audit = require('../services/auditService');

async function getPayrollProfile(req, res) {
    const { employeeId } = req.params;
    const profile = await prisma.payrollProfile.findUnique({
        where: { employeeId: Number(employeeId) },
    });
    if (!profile) return res.json(null);
    res.json({
        ...profile,
        ssn: maskSSN(decrypt(profile.ssn)),
        ein: maskEIN(decrypt(profile.ein)),
        hourlyRate: Number(profile.hourlyRate),
        childSupportAmount: Number(profile.childSupportAmount),
        overpaymentBalance: Number(profile.overpaymentBalance),
        ytdGrossOverride: profile.ytdGrossOverride ? Number(profile.ytdGrossOverride) : null,
        ytdDeductionsOverride: profile.ytdDeductionsOverride ? Number(profile.ytdDeductionsOverride) : null,
        ytdNetOverride: profile.ytdNetOverride ? Number(profile.ytdNetOverride) : null,
        ytdOverpaymentOverride: profile.ytdOverpaymentOverride ? Number(profile.ytdOverpaymentOverride) : null,
    });
}

async function revealSensitiveField(req, res) {
    const { employeeId } = req.params;
    const { field } = req.query; // 'ssn' or 'ein'
    if (!['ssn', 'ein'].includes(field)) return res.status(400).json({ error: 'Invalid field' });
    const profile = await prisma.payrollProfile.findUnique({
        where: { employeeId: Number(employeeId) },
    });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json({ value: decrypt(profile[field]) });
}

async function upsertPayrollProfile(req, res) {
    const { employeeId } = req.params;
    const empId = Number(employeeId);
    const data = { ...req.body };

    if (data.ssn !== undefined) data.ssn = encrypt(data.ssn);
    if (data.ein !== undefined) data.ein = encrypt(data.ein);
    if (data.hourlyRate !== undefined) data.hourlyRate = Number(data.hourlyRate);
    if (data.childSupportAmount !== undefined) data.childSupportAmount = Number(data.childSupportAmount);
    if (data.overpaymentBalance !== undefined) data.overpaymentBalance = Number(data.overpaymentBalance);

    const existing = await prisma.payrollProfile.findUnique({ where: { employeeId: empId } });

    let profile;
    if (existing) {
        profile = await prisma.payrollProfile.update({
            where: { employeeId: empId },
            data,
        });
        audit.logAction(req.user.id, req.user.name, req.user.role, 'UPDATE', 'PayrollProfile', profile.id, `Employee #${empId}`, [], {});
    } else {
        profile = await prisma.payrollProfile.create({
            data: { employeeId: empId, ...data },
        });
        audit.logAction(req.user.id, req.user.name, req.user.role, 'CREATE', 'PayrollProfile', profile.id, `Employee #${empId}`, [], {});
    }

    res.json({
        ...profile,
        ssn: maskSSN(decrypt(profile.ssn)),
        ein: maskEIN(decrypt(profile.ein)),
        hourlyRate: Number(profile.hourlyRate),
        childSupportAmount: Number(profile.childSupportAmount),
        overpaymentBalance: Number(profile.overpaymentBalance),
    });
}

module.exports = { getPayrollProfile, upsertPayrollProfile, revealSensitiveField };
```

- [ ] **Step 2: Register routes in api.js**

Add to `server/src/routes/api.js` — import and register:

```js
const { getPayrollProfile, upsertPayrollProfile, revealSensitiveField } = require('../controllers/payrollProfileController');

// Payroll Profile routes (admin-only)
router.get('/employees/:employeeId/payroll-profile', requireRole('admin'), getPayrollProfile);
router.put('/employees/:employeeId/payroll-profile', requireRole('admin'), upsertPayrollProfile);
router.get('/employees/:employeeId/payroll-profile/reveal', requireRole('admin'), revealSensitiveField);
```

- [ ] **Step 3: Verify server starts**

Run: `cd server && node -e "require('./src/app')" && echo "OK"`
Expected: "OK" (no syntax errors)

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/payrollProfileController.js server/src/routes/api.js
git commit -m "feat(receipts): add payroll profile controller and routes"
```

---

## Task 7: Receipt Controller + Routes

**Files:**
- Create: `server/src/controllers/receiptController.js`
- Modify: `server/src/routes/api.js`

- [ ] **Step 1: Create controller**

```js
// server/src/controllers/receiptController.js
const prisma = require('../lib/prisma');
const { computeReceipt, computeYTD, getEmployeeHours, getPriorReceipts, generateReceiptPdf, snapBiweeklyPeriod } = require('../services/receiptService');
const { decrypt, maskSSN, maskEIN } = require('../services/encryptionService');
const { sendEmail } = require('../services/notificationService');
const audit = require('../services/auditService');

async function listReceipts(req, res) {
    const { status, periodStart, search } = req.query;
    const where = {};
    if (status && status !== 'all') where.status = status;
    if (periodStart) where.periodStart = new Date(periodStart);
    if (search) {
        where.employee = { name: { contains: search, mode: 'insensitive' } };
    }
    const receipts = await prisma.payReceipt.findMany({
        where,
        include: { employee: { select: { id: true, name: true, email: true } } },
        orderBy: [{ periodStart: 'desc' }, { employee: { name: 'asc' } }],
    });
    res.json(receipts.map(r => ({
        ...r,
        totalHours: Number(r.totalHours),
        hourlyRate: Number(r.hourlyRate),
        grossEarnings: Number(r.grossEarnings),
        garnishment: Number(r.garnishment),
        childSupport: Number(r.childSupport),
        overpaymentDeduction: Number(r.overpaymentDeduction),
        otherDeductions: Number(r.otherDeductions),
        netPay: Number(r.netPay),
        ytdGross: Number(r.ytdGross),
        ytdDeductions: Number(r.ytdDeductions),
        ytdOverpayments: Number(r.ytdOverpayments),
        ytdNet: Number(r.ytdNet),
    })));
}

async function previewReceipts(req, res) {
    const { periodStart, periodEnd } = req.body;
    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    const profiles = await prisma.payrollProfile.findMany({
        include: { employee: { select: { id: true, name: true, email: true, active: true } } },
    });
    const activeProfiles = profiles.filter(p => p.employee.active);

    const previews = [];
    for (const profile of activeProfiles) {
        const hours = await getEmployeeHours(profile.employeeId, profile.employee.name, start, end);
        const computed = computeReceipt({
            totalHours: hours,
            hourlyRate: Number(profile.hourlyRate),
            garnishmentActive: profile.garnishmentActive,
            childSupportActive: profile.childSupportActive,
            childSupportAmount: Number(profile.childSupportAmount),
            overpaymentDeduction: Number(profile.overpaymentBalance) > 0 ? Number(profile.overpaymentBalance) : 0,
            otherDeductions: 0,
        });
        previews.push({
            employeeId: profile.employeeId,
            employeeName: profile.employee.name,
            employeeEmail: profile.employee.email,
            totalHours: hours,
            hourlyRate: Number(profile.hourlyRate),
            ...computed,
            overpaymentBalance: Number(profile.overpaymentBalance),
            hasEmail: !!profile.employee.email,
        });
    }
    res.json(previews);
}

async function generateReceipts(req, res) {
    const { periodStart, periodEnd, payDate, receipts: receiptInputs, sendEmail: shouldSend } = req.body;
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const payDt = new Date(payDate);

    const created = [];
    for (const input of receiptInputs) {
        const profile = await prisma.payrollProfile.findUnique({
            where: { employeeId: input.employeeId },
            include: { employee: { select: { id: true, name: true, email: true, address: true } } },
        });
        if (!profile) continue;

        const computed = computeReceipt({
            totalHours: input.totalHours,
            hourlyRate: input.hourlyRate,
            garnishmentActive: profile.garnishmentActive,
            childSupportActive: profile.childSupportActive,
            childSupportAmount: Number(profile.childSupportAmount),
            overpaymentDeduction: input.overpaymentDeduction || 0,
            otherDeductions: input.otherDeductions || 0,
        });

        const priorReceipts = await getPriorReceipts(input.employeeId, start);
        const overrides = {
            ytdGrossOverride: profile.ytdGrossOverride ? Number(profile.ytdGrossOverride) : 0,
            ytdDeductionsOverride: profile.ytdDeductionsOverride ? Number(profile.ytdDeductionsOverride) : 0,
            ytdNetOverride: profile.ytdNetOverride ? Number(profile.ytdNetOverride) : 0,
            ytdOverpaymentOverride: profile.ytdOverpaymentOverride ? Number(profile.ytdOverpaymentOverride) : 0,
        };
        const ytd = computeYTD(priorReceipts, computed, overrides);

        const receipt = await prisma.payReceipt.upsert({
            where: { employeeId_periodStart: { employeeId: input.employeeId, periodStart: start } },
            create: {
                employeeId: input.employeeId,
                periodStart: start,
                periodEnd: end,
                payDate: payDt,
                totalHours: input.totalHours,
                hourlyRate: input.hourlyRate,
                grossEarnings: computed.grossEarnings,
                garnishment: computed.garnishment,
                childSupport: computed.childSupport,
                overpaymentDeduction: computed.overpaymentDeduction,
                otherDeductions: computed.otherDeductions,
                netPay: computed.netPay,
                ...ytd,
                classification: profile.classification,
                status: shouldSend ? 'sent' : 'draft',
                notes: input.notes || '',
            },
            update: {
                periodEnd: end,
                payDate: payDt,
                totalHours: input.totalHours,
                hourlyRate: input.hourlyRate,
                grossEarnings: computed.grossEarnings,
                garnishment: computed.garnishment,
                childSupport: computed.childSupport,
                overpaymentDeduction: computed.overpaymentDeduction,
                otherDeductions: computed.otherDeductions,
                netPay: computed.netPay,
                ...ytd,
                classification: profile.classification,
                status: shouldSend ? 'sent' : 'draft',
                notes: input.notes || '',
            },
        });

        // Deduct overpayment from balance
        if (Math.abs(computed.overpaymentDeduction) > 0) {
            await prisma.payrollProfile.update({
                where: { employeeId: input.employeeId },
                data: { overpaymentBalance: { decrement: Math.abs(computed.overpaymentDeduction) } },
            });
        }

        if (shouldSend && profile.employee.email) {
            try {
                await sendReceiptEmail(receipt, profile);
                await prisma.payReceipt.update({
                    where: { id: receipt.id },
                    data: { emailSentAt: new Date() },
                });
            } catch (err) {
                console.error(`Failed to email receipt to ${profile.employee.email}:`, err.message);
            }
        }

        created.push(receipt);
        audit.logAction(req.user.id, req.user.name, req.user.role, 'CREATE', 'PayReceipt', receipt.id, profile.employee.name, [], {});
    }

    res.json(created);
}

async function updateReceipt(req, res) {
    const { id } = req.params;
    const receipt = await prisma.payReceipt.findUnique({ where: { id: Number(id) } });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    if (receipt.status !== 'draft') return res.status(400).json({ error: 'Only draft receipts can be edited' });

    const data = req.body;
    const updated = await prisma.payReceipt.update({ where: { id: Number(id) }, data });
    audit.logAction(req.user.id, req.user.name, req.user.role, 'UPDATE', 'PayReceipt', updated.id, '', [], {});
    res.json(updated);
}

async function finalizeReceipts(req, res) {
    const { ids } = req.body;
    await prisma.payReceipt.updateMany({
        where: { id: { in: ids.map(Number) }, status: 'draft' },
        data: { status: 'finalized' },
    });
    res.json({ success: true });
}

async function sendReceipts(req, res) {
    const { ids } = req.body;
    const receipts = await prisma.payReceipt.findMany({
        where: { id: { in: ids.map(Number) }, status: { in: ['finalized', 'sent'] } },
        include: { employee: { select: { id: true, name: true, email: true, address: true } } },
    });

    const results = [];
    for (const receipt of receipts) {
        const profile = await prisma.payrollProfile.findUnique({ where: { employeeId: receipt.employeeId } });
        if (!receipt.employee.email) {
            results.push({ id: receipt.id, success: false, reason: 'No email' });
            continue;
        }
        try {
            await sendReceiptEmail(receipt, { ...profile, employee: receipt.employee });
            await prisma.payReceipt.update({
                where: { id: receipt.id },
                data: { status: 'sent', emailSentAt: new Date() },
            });
            results.push({ id: receipt.id, success: true });
        } catch (err) {
            results.push({ id: receipt.id, success: false, reason: err.message });
        }
    }
    res.json(results);
}

async function downloadReceiptPdf(req, res) {
    const { id } = req.params;
    const receipt = await prisma.payReceipt.findUnique({
        where: { id: Number(id) },
        include: { employee: { select: { id: true, name: true, email: true, address: true } } },
    });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    const profile = await prisma.payrollProfile.findUnique({ where: { employeeId: receipt.employeeId } });

    const pdfData = {
        employee: receipt.employee,
        ssn: profile ? maskSSN(decrypt(profile.ssn)) : '',
        ein: profile ? maskEIN(decrypt(profile.ein)) : '',
        accountNumber: profile ? profile.accountNumber : '',
        classification: receipt.classification,
        periodStart: receipt.periodStart,
        periodEnd: receipt.periodEnd,
        payDate: receipt.payDate,
        totalHours: Number(receipt.totalHours),
        hourlyRate: Number(receipt.hourlyRate),
        grossEarnings: Number(receipt.grossEarnings),
        garnishment: Number(receipt.garnishment),
        childSupport: Number(receipt.childSupport),
        overpaymentDeduction: Number(receipt.overpaymentDeduction),
        otherDeductions: Number(receipt.otherDeductions),
        netPay: Number(receipt.netPay),
        ytdGross: Number(receipt.ytdGross),
        ytdDeductions: Number(receipt.ytdDeductions),
        ytdOverpayments: Number(receipt.ytdOverpayments),
        ytdNet: Number(receipt.ytdNet),
    };

    const buffer = await generateReceiptPdf(pdfData);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="paystub-${receipt.employee.name.replace(/\s+/g, '-')}-${receipt.periodStart.toISOString().slice(0, 10)}.pdf"`);
    res.send(buffer);
}

async function sendReceiptEmail(receipt, profile) {
    const pdfData = {
        employee: profile.employee,
        ssn: maskSSN(decrypt(profile.ssn || '')),
        ein: maskEIN(decrypt(profile.ein || '')),
        accountNumber: profile.accountNumber || '',
        classification: receipt.classification,
        periodStart: receipt.periodStart,
        periodEnd: receipt.periodEnd,
        payDate: receipt.payDate,
        totalHours: Number(receipt.totalHours),
        hourlyRate: Number(receipt.hourlyRate),
        grossEarnings: Number(receipt.grossEarnings),
        garnishment: Number(receipt.garnishment),
        childSupport: Number(receipt.childSupport),
        overpaymentDeduction: Number(receipt.overpaymentDeduction),
        otherDeductions: Number(receipt.otherDeductions),
        netPay: Number(receipt.netPay),
        ytdGross: Number(receipt.ytdGross),
        ytdDeductions: Number(receipt.ytdDeductions),
        ytdOverpayments: Number(receipt.ytdOverpayments),
        ytdNet: Number(receipt.ytdNet),
    };
    const buffer = await generateReceiptPdf(pdfData);

    const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const periodLabel = `${fmtDate(receipt.periodStart)} - ${fmtDate(receipt.periodEnd)}`;
    const name = profile.employee.name;

    const text = `Hi ${name},\n\nWe've attached your paystub for this pay period ${periodLabel}\nThank you for being a part of our team!\n\nNevada Best PCA, LLC\n`;
    const html = `<p>Hi ${name},</p><p>We've attached your paystub for this pay period ${periodLabel}<br>Thank you for being a part of our team!</p><p>Nevada Best PCA, LLC</p>`;

    await sendEmail(
        profile.employee.email,
        'Nevada Best PCA / Payroll services',
        html,
        text,
        [{ content: buffer.toString('base64'), name: `paystub-${name.replace(/\s+/g, '-')}-${receipt.periodStart.toISOString().slice(0, 10)}.pdf` }]
    );
}

module.exports = { listReceipts, previewReceipts, generateReceipts, updateReceipt, finalizeReceipts, sendReceipts, downloadReceiptPdf };
```

- [ ] **Step 2: Register routes in api.js**

Add to `server/src/routes/api.js`:

```js
const { listReceipts, previewReceipts, generateReceipts, updateReceipt, finalizeReceipts, sendReceipts, downloadReceiptPdf } = require('../controllers/receiptController');

// Receipts routes (admin-only)
router.get('/receipts', requireRole('admin'), listReceipts);
router.post('/receipts/preview', requireRole('admin'), previewReceipts);
router.post('/receipts/generate', requireRole('admin'), generateReceipts);
router.patch('/receipts/:id', requireRole('admin'), updateReceipt);
router.post('/receipts/finalize', requireRole('admin'), finalizeReceipts);
router.post('/receipts/send', requireRole('admin'), sendReceipts);
router.get('/receipts/:id/pdf', requireRole('admin'), downloadReceiptPdf);
```

- [ ] **Step 3: Verify server starts**

Run: `cd server && node -e "require('./src/app')" && echo "OK"`
Expected: "OK"

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/receiptController.js server/src/routes/api.js
git commit -m "feat(receipts): add receipt controller with CRUD, PDF, and email endpoints"
```

---

## Task 8: Frontend API Functions

**Files:**
- Modify: `client/src/api.js`

- [ ] **Step 1: Add receipt + payroll profile API functions**

Add to `client/src/api.js`:

```js
// ── Receipts ──
export const getReceipts        = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/receipts${qs ? '?' + qs : ''}`);
};
export const previewReceipts    = (data) => request('/receipts/preview', { method: 'POST', body: JSON.stringify(data) });
export const generateReceipts   = (data) => request('/receipts/generate', { method: 'POST', body: JSON.stringify(data) });
export const updateReceipt      = (id, data) => request(`/receipts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const finalizeReceipts   = (ids) => request('/receipts/finalize', { method: 'POST', body: JSON.stringify({ ids }) });
export const sendReceipts       = (ids) => request('/receipts/send', { method: 'POST', body: JSON.stringify({ ids }) });
export const downloadReceiptPdf = (id) =>
    fetch(`${BASE}/receipts/${id}/pdf`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
    });

// ── Payroll Profile ──
export const getPayrollProfile       = (employeeId) => request(`/employees/${employeeId}/payroll-profile`);
export const upsertPayrollProfile    = (employeeId, data) => request(`/employees/${employeeId}/payroll-profile`, { method: 'PUT', body: JSON.stringify(data) });
export const revealPayrollField      = (employeeId, field) => request(`/employees/${employeeId}/payroll-profile/reveal?field=${field}`);
```

- [ ] **Step 2: Verify client builds**

Run: `cd client && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add client/src/api.js
git commit -m "feat(receipts): add frontend API functions for receipts and payroll profiles"
```

---

## Task 9: Payroll Tab on Employee Detail Page

**Files:**
- Create: `client/src/pages/employee-tabs/PayrollTab.jsx`
- Modify: `client/src/pages/EmployeeDetailPage.jsx`

- [ ] **Step 1: Create the PayrollTab component**

```jsx
// client/src/pages/employee-tabs/PayrollTab.jsx
import { useState, useEffect, useCallback } from 'react';
import * as api from '../../api';
import Icons from '../../components/common/Icons';
import { useToast } from '../../hooks/useToast';

export default function PayrollTab({ employeeId }) {
    const { showToast } = useToast();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({});
    const [revealedFields, setRevealedFields] = useState({});

    const fetchProfile = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getPayrollProfile(employeeId);
            setProfile(data);
            if (data) setForm(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [employeeId]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    const handleSave = async () => {
        try {
            const payload = { ...form };
            // Only send ssn/ein if changed (not masked)
            if (payload.ssn && payload.ssn.includes('*')) delete payload.ssn;
            if (payload.ein && payload.ein.includes('*')) delete payload.ein;
            delete payload.id;
            delete payload.employeeId;
            delete payload.createdAt;
            delete payload.updatedAt;
            const updated = await api.upsertPayrollProfile(employeeId, payload);
            setProfile(updated);
            setForm(updated);
            setEditing(false);
            showToast('Payroll profile saved', 'success');
        } catch (err) {
            showToast('Failed to save', 'error');
        }
    };

    const handleReveal = async (field) => {
        try {
            const { value } = await api.revealPayrollField(employeeId, field);
            setRevealedFields(prev => ({ ...prev, [field]: value }));
        } catch (err) {
            showToast('Failed to reveal', 'error');
        }
    };

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    if (loading) return <div className="activity-drawer__loading">Loading...</div>;

    if (!profile && !editing) {
        return (
            <div className="empty-state">
                <div className="empty-state__icon">{Icons.dollarSign}</div>
                <div className="empty-state__title">No payroll profile</div>
                <div className="empty-state__desc">Set up payroll details for this employee.</div>
                <button className="btn btn--primary" onClick={() => { setEditing(true); setForm({ hourlyRate: 0, classification: 'W2', ssn: '', ein: '', accountNumber: '', garnishmentActive: false, childSupportActive: false, childSupportAmount: 0, overpaymentBalance: 0 }); }}>
                    {Icons.plus} Create Profile
                </button>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Payroll Profile</h3>
                {!editing && (
                    <button className="btn btn--outline btn--sm" onClick={() => setEditing(true)}>
                        {Icons.edit} Edit
                    </button>
                )}
            </div>

            <div className="form-grid-2">
                <div className="form-group">
                    <label>Hourly Rate ($)</label>
                    <input type="number" step="0.01" value={form.hourlyRate || ''} onChange={e => handleChange('hourlyRate', e.target.value)} disabled={!editing} />
                </div>
                <div className="form-group">
                    <label>Classification</label>
                    <select value={form.classification || 'W2'} onChange={e => handleChange('classification', e.target.value)} disabled={!editing}>
                        <option value="W2">W2</option>
                        <option value="1099">1099</option>
                    </select>
                </div>
            </div>

            <div className="form-grid-2">
                <div className="form-group">
                    <label>SSN</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="text" value={editing ? form.ssn : (revealedFields.ssn || profile?.ssn || '')} onChange={e => handleChange('ssn', e.target.value)} disabled={!editing} />
                        {!editing && <button className="btn btn--ghost btn--xs" onClick={() => handleReveal('ssn')}>{Icons.eye}</button>}
                    </div>
                </div>
                <div className="form-group">
                    <label>EIN</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="text" value={editing ? form.ein : (revealedFields.ein || profile?.ein || '')} onChange={e => handleChange('ein', e.target.value)} disabled={!editing} />
                        {!editing && <button className="btn btn--ghost btn--xs" onClick={() => handleReveal('ein')}>{Icons.eye}</button>}
                    </div>
                </div>
            </div>

            <div className="form-group">
                <label>Account Number</label>
                <input type="text" value={form.accountNumber || ''} onChange={e => handleChange('accountNumber', e.target.value)} disabled={!editing} />
            </div>

            <h4 style={{ fontSize: 13, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>Deductions</h4>
            <div className="form-grid-2">
                <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={form.garnishmentActive || false} onChange={e => handleChange('garnishmentActive', e.target.checked)} disabled={!editing} />
                        Garnishment (18%)
                    </label>
                </div>
                <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={form.childSupportActive || false} onChange={e => handleChange('childSupportActive', e.target.checked)} disabled={!editing} />
                        Child Support
                    </label>
                    {form.childSupportActive && (
                        <input type="number" step="0.01" placeholder="Amount per period" value={form.childSupportAmount || ''} onChange={e => handleChange('childSupportAmount', e.target.value)} disabled={!editing} style={{ marginTop: 4 }} />
                    )}
                </div>
            </div>

            <div className="form-group">
                <label>Overpayment Balance ($)</label>
                <input type="number" step="0.01" value={form.overpaymentBalance || ''} onChange={e => handleChange('overpaymentBalance', e.target.value)} disabled={!editing} />
            </div>

            {editing && (
                <div className="form-actions">
                    <button className="btn btn--outline" onClick={() => { setEditing(false); setForm(profile || {}); }}>Cancel</button>
                    <button className="btn btn--primary" onClick={handleSave}>Save</button>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Add Payroll tab to EmployeeDetailPage**

In `client/src/pages/EmployeeDetailPage.jsx`:

1. Import at top:
```jsx
import PayrollTab from './employee-tabs/PayrollTab';
```

2. Add to TABS array (after 'schedule', before 'activity'):
```jsx
{ key: 'payroll', label: 'Payroll', icon: 'dollarSign' },
```

3. Add tab content rendering (in the `cp-tab-content` div):
```jsx
{activeTab === 'payroll' && <PayrollTab employeeId={employee.id} />}
```

4. Gate the tab visibility to admin only — wrap the tab button render with a condition: only show the 'payroll' tab if `isAdmin` is true. Import `useAuth` if not already imported.

- [ ] **Step 3: Verify client builds**

Run: `cd client && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/employee-tabs/PayrollTab.jsx client/src/pages/EmployeeDetailPage.jsx
git commit -m "feat(receipts): add Payroll tab to Employee Detail page"
```

---

## Task 10: Receipts Page (Frontend)

**Files:**
- Create: `client/src/pages/ReceiptsPage.jsx`
- Modify: `client/src/components/layout/Sidebar.jsx`
- Modify: `client/src/App.jsx` (or main router file)

- [ ] **Step 1: Create ReceiptsPage**

```jsx
// client/src/pages/ReceiptsPage.jsx
import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import { useToast } from '../hooks/useToast';
import Modal from '../components/common/Modal';

function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function fmtMoney(n) {
    const abs = Math.abs(Number(n));
    const formatted = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return Number(n) < 0 ? `-${formatted}` : formatted;
}

function snapToSunday(dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export default function ReceiptsPage() {
    const { showToast } = useToast();
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [showGenerate, setShowGenerate] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());

    const fetchReceipts = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter !== 'all') params.status = statusFilter;
            if (search.trim()) params.search = search.trim();
            const data = await api.getReceipts(params);
            setReceipts(data);
        } catch (err) {
            showToast('Failed to load receipts', 'error');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, search, showToast]);

    useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

    const handleFinalize = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) return;
        try {
            await api.finalizeReceipts(ids);
            showToast(`${ids.length} receipt(s) finalized`, 'success');
            setSelectedIds(new Set());
            fetchReceipts();
        } catch (err) {
            showToast('Failed to finalize', 'error');
        }
    };

    const handleSend = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) return;
        try {
            const results = await api.sendReceipts(ids);
            const sent = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            showToast(`${sent} sent${failed ? `, ${failed} failed` : ''}`, sent > 0 ? 'success' : 'error');
            setSelectedIds(new Set());
            fetchReceipts();
        } catch (err) {
            showToast('Failed to send', 'error');
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const statusBadge = (status) => {
        const colors = { draft: 'ts-badge--draft', finalized: 'ts-badge--submitted', sent: 'ts-badge--accepted' };
        return <span className={`ts-badge ${colors[status] || ''}`}>{status}</span>;
    };

    return (
        <>
            <div className="page-hero">
                <div className="page-hero__left">
                    <div className="page-hero__icon">{Icons.dollarSign}</div>
                    <div>
                        <div className="page-hero__title">Receipts</div>
                        <div className="page-hero__subtitle">Pay stubs for bi-weekly periods</div>
                    </div>
                </div>
                <div className="page-hero__right">
                    <input className="page-hero__search" placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} />
                    <button className="btn btn--primary" onClick={() => setShowGenerate(true)}>{Icons.plus} Generate Receipts</button>
                </div>
            </div>

            <div className="filter-bar">
                {['all', 'draft', 'finalized', 'sent'].map(f => (
                    <button key={f} className={`filter-btn ${statusFilter === f ? 'filter-btn--active' : ''}`} onClick={() => setStatusFilter(f)}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            {selectedIds.size > 0 && (
                <div className="table-toolbar">
                    <div className="table-toolbar__left">
                        <span className="table-toolbar__selected">{selectedIds.size} selected</span>
                        <button className="btn btn--outline btn--sm" onClick={handleFinalize}>Finalize</button>
                        <button className="btn btn--primary btn--sm" onClick={handleSend}>Send</button>
                    </div>
                </div>
            )}

            <div className="sheet-card">
                <div className="table-scroll">
                    <table className="data-table data-table--dark-header">
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}></th>
                                <th>Employee</th>
                                <th>Period</th>
                                <th>Gross</th>
                                <th>Deductions</th>
                                <th>Net Pay</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32 }}>Loading...</td></tr>}
                            {!loading && receipts.length === 0 && (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'hsl(var(--muted-foreground))' }}>No receipts found</td></tr>
                            )}
                            {receipts.map(r => (
                                <tr key={r.id}>
                                    <td><input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                                    <td style={{ fontWeight: 500 }}>{r.employee?.name}</td>
                                    <td>{fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}</td>
                                    <td>{fmtMoney(r.grossEarnings)}</td>
                                    <td>{fmtMoney(r.garnishment + r.childSupport + r.overpaymentDeduction + r.otherDeductions)}</td>
                                    <td style={{ fontWeight: 600 }}>{fmtMoney(r.netPay)}</td>
                                    <td>{statusBadge(r.status)}</td>
                                    <td>
                                        <button className="btn btn--ghost btn--xs" title="Download PDF" onClick={async () => {
                                            const blob = await api.downloadReceiptPdf(r.id);
                                            const url = URL.createObjectURL(blob);
                                            window.open(url, '_blank');
                                        }}>
                                            {Icons.download}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showGenerate && <GenerateReceiptsModal onClose={() => { setShowGenerate(false); fetchReceipts(); }} />}
        </>
    );
}

function GenerateReceiptsModal({ onClose }) {
    const { showToast } = useToast();
    const [periodStart, setPeriodStart] = useState('');
    const [periodEnd, setPeriodEnd] = useState('');
    const [payDate, setPayDate] = useState('');
    const [previews, setPreviews] = useState([]);
    const [overrides, setOverrides] = useState({});
    const [sendOnGenerate, setSendOnGenerate] = useState(true);
    const [generating, setGenerating] = useState(false);

    const handlePeriodChange = (val) => {
        const sunday = snapToSunday(val);
        setPeriodStart(sunday);
        setPeriodEnd(addDays(sunday, 13));
    };

    const handlePreview = async () => {
        if (!periodStart || !periodEnd) return;
        try {
            const data = await api.previewReceipts({ periodStart, periodEnd });
            setPreviews(data);
        } catch (err) {
            showToast('Failed to load preview', 'error');
        }
    };

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const receiptInputs = previews.map(p => ({
                employeeId: p.employeeId,
                totalHours: overrides[p.employeeId]?.totalHours ?? p.totalHours,
                hourlyRate: overrides[p.employeeId]?.hourlyRate ?? p.hourlyRate,
                overpaymentDeduction: overrides[p.employeeId]?.overpaymentDeduction ?? (p.overpaymentBalance > 0 ? p.overpaymentBalance : 0),
                otherDeductions: overrides[p.employeeId]?.otherDeductions ?? 0,
                notes: overrides[p.employeeId]?.notes ?? '',
            }));
            await api.generateReceipts({
                periodStart,
                periodEnd,
                payDate,
                receipts: receiptInputs,
                sendEmail: sendOnGenerate,
            });
            showToast(`${receiptInputs.length} receipt(s) generated${sendOnGenerate ? ' and sent' : ''}`, 'success');
            onClose();
        } catch (err) {
            showToast('Failed to generate', 'error');
        } finally {
            setGenerating(false);
        }
    };

    const updateOverride = (employeeId, field, value) => {
        setOverrides(prev => ({
            ...prev,
            [employeeId]: { ...prev[employeeId], [field]: value },
        }));
    };

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">Generate Receipts</h2>
            <div className="form-grid-2" style={{ marginBottom: 16 }}>
                <div className="form-group">
                    <label>Period Start (Sunday)</label>
                    <input type="date" value={periodStart} onChange={e => handlePeriodChange(e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Period End (Saturday)</label>
                    <input type="date" value={periodEnd} disabled />
                </div>
            </div>
            <div className="form-grid-2" style={{ marginBottom: 16 }}>
                <div className="form-group">
                    <label>Pay Date</label>
                    <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button className="btn btn--outline" onClick={handlePreview} disabled={!periodStart}>Preview Employees</button>
                </div>
            </div>

            {previews.length > 0 && (
                <>
                    <div className="table-scroll" style={{ maxHeight: 400, marginBottom: 16 }}>
                        <table className="data-table data-table--compact">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Hours</th>
                                    <th>Rate</th>
                                    <th>Gross</th>
                                    <th>Deductions</th>
                                    <th>Net</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previews.map(p => (
                                    <tr key={p.employeeId}>
                                        <td style={{ fontWeight: 500 }}>
                                            {p.employeeName}
                                            {!p.hasEmail && <span style={{ color: 'hsl(var(--warning))', fontSize: 11, marginLeft: 6 }}>No email</span>}
                                            {p.overpaymentBalance > 0 && <span style={{ color: 'hsl(var(--destructive))', fontSize: 11, marginLeft: 6 }}>Owes {fmtMoney(p.overpaymentBalance)}</span>}
                                        </td>
                                        <td>
                                            <input type="number" step="0.25" style={{ width: 70 }} value={overrides[p.employeeId]?.totalHours ?? p.totalHours} onChange={e => updateOverride(p.employeeId, 'totalHours', Number(e.target.value))} />
                                        </td>
                                        <td>{fmtMoney(p.hourlyRate)}</td>
                                        <td>{fmtMoney(p.grossEarnings)}</td>
                                        <td>{fmtMoney(p.garnishment + p.childSupport + p.overpaymentDeduction + p.otherDeductions)}</td>
                                        <td style={{ fontWeight: 600 }}>{fmtMoney(p.netPay)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13 }}>
                        <input type="checkbox" checked={sendOnGenerate} onChange={e => setSendOnGenerate(e.target.checked)} />
                        Email receipts to employees immediately
                    </label>

                    <div className="form-actions">
                        <button className="btn btn--outline" onClick={onClose}>Cancel</button>
                        <button className="btn btn--primary" onClick={handleGenerate} disabled={generating || !payDate}>
                            {generating ? 'Generating...' : `Generate ${previews.length} Receipt(s)`}
                        </button>
                    </div>
                </>
            )}
        </Modal>
    );
}
```

- [ ] **Step 2: Add sidebar nav item**

In `client/src/components/layout/Sidebar.jsx`, add after the payroll button (around line 109), inside the `{isStaff && (` block:

```jsx
{isAdmin && (
    <button className={`sidebar__nav-item ${activePage === 'receipts' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/receipts')} title="Receipts">
        {Icons.fileText} Receipts
    </button>
)}
```

- [ ] **Step 3: Add route**

In the router configuration (App.jsx or wherever routes are defined), add:

```jsx
<Route path="/receipts" element={<PrivateRoute><ReceiptsPage /></PrivateRoute>} />
```

Import `ReceiptsPage` at the top of the file.

- [ ] **Step 4: Verify client builds**

Run: `cd client && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/ReceiptsPage.jsx client/src/components/layout/Sidebar.jsx client/src/App.jsx
git commit -m "feat(receipts): add Receipts page with generation modal and sidebar nav"
```

---

## Task 11: End-to-End Verification

**Files:** None (manual testing)

- [ ] **Step 1: Run all tests**

Run: `cd server && npm test`
Expected: All tests pass

- [ ] **Step 2: Build client**

Run: `cd client && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Start dev servers and verify**

Run: `cd server && npm run dev` (terminal 1)
Run: `cd client && npm run dev` (terminal 2)

Verify:
1. Receipts page loads at `/receipts` (admin only)
2. PCA users do NOT see Receipts in sidebar
3. Employee Detail → Payroll tab shows profile form (admin only)
4. Generate Receipts modal loads preview data
5. PDF download works
6. Receipt status transitions (draft → finalized → sent)

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(receipts): address issues found during E2E verification"
```
