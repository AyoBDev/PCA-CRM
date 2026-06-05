const {
    computeReceipt,
    computeYTD,
    snapBiweeklyPeriod,
    generateReceiptPdf,
} = require('../receiptService');

describe('snapBiweeklyPeriod', () => {
    test('snaps a Thursday to its containing bi-weekly Sun-Sat period', () => {
        const { periodStart, periodEnd } = snapBiweeklyPeriod(new Date('2026-06-04'));
        expect(periodStart.toISOString().slice(0, 10)).toBe('2026-05-31');  // prev Sunday (May 31)
        expect(periodEnd.toISOString().slice(0, 10)).toBe('2026-06-13');    // +13 days = Saturday
    });

    test('a Sunday returns itself as period start', () => {
        const { periodStart } = snapBiweeklyPeriod(new Date('2026-06-07'));
        expect(periodStart.toISOString().slice(0, 10)).toBe('2026-06-07');
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
        expect(result.grossEarnings).toBe(1200);
        expect(result.garnishment).toBe(-216);
        expect(result.childSupport).toBe(0);
        expect(result.overpaymentDeduction).toBe(-50);
        expect(result.netPay).toBe(934);
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
            overpaymentDeduction: 500,
            otherDeductions: 0,
        });
        expect(result.grossEarnings).toBe(100);
        expect(result.garnishment).toBe(-18);
        expect(result.overpaymentDeduction).toBe(-82);
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
        expect(ytd.ytdGross).toBe(3000);
        expect(ytd.ytdDeductions).toBe(-496);
        expect(ytd.ytdOverpayments).toBe(-50);
        expect(ytd.ytdNet).toBe(2454);
    });

    test('adds override to computed YTD', () => {
        const priorReceipts = [
            { grossEarnings: 500, garnishment: 0, childSupport: 0, otherDeductions: 0, overpaymentDeduction: 0, netPay: 500 },
        ];
        const current = { grossEarnings: 500, garnishment: 0, childSupport: 0, otherDeductions: 0, overpaymentDeduction: 0, netPay: 500 };
        const overrides = { ytdGrossOverride: 5000, ytdNetOverride: 4500 };
        const ytd = computeYTD(priorReceipts, current, overrides);
        expect(ytd.ytdGross).toBe(6000);
        expect(ytd.ytdNet).toBe(5500);
    });
});

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
        expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    });
});
