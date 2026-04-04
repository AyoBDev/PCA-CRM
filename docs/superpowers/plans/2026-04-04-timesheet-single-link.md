# Timesheet Single-Link Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two-link timesheet signing with a single combined link, add submit gating on completeness, and add PDF export for admin.

**Architecture:** Modify the signing controller to generate one "combined" token. Rewrite the SigningFormPage to show both PCA and client fields in one form with highlighted required sections. Add a PDF export endpoint using pdfkit.

**Tech Stack:** Express.js, Prisma, React, pdfkit (new dependency)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `server/src/controllers/signingController.js` | Modify | Single token generation, combined submit handler |
| `server/src/controllers/timesheetController.js` | Modify | Add `exportTimesheetPdf` function |
| `server/src/routes/api.js` | Modify | Add PDF export route, import new function |
| `client/src/pages/SigningFormPage.jsx` | Rewrite | Combined PCA+client form with highlighted sections, submit gating |
| `client/src/pages/TimesheetFormPage.jsx` | Modify | Single-link share modal, export PDF button |
| `client/src/api.js` | Modify | Add `exportTimesheetPdf` function |
| `client/src/index.css` | Modify | Add highlighted section styles for signing form |

---

### Task 1: Backend — Single Token Generation

**Files:**
- Modify: `server/src/controllers/signingController.js:5-37`

- [ ] **Step 1: Update `generateSigningLinks` to create one combined token**

Replace lines 5-37 of `server/src/controllers/signingController.js` with:

```javascript
async function generateSigningLinks(req, res, next) {
    try {
        const timesheetId = Number(req.params.id);
        const ts = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
        if (!ts) return res.status(404).json({ error: 'Timesheet not found' });

        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

        // Invalidate any existing unused tokens for this timesheet
        await prisma.signingToken.updateMany({
            where: { timesheetId, usedAt: null },
            data: { usedAt: new Date() },
        });

        const token = crypto.randomUUID();

        await prisma.signingToken.create({
            data: { token, timesheetId, role: 'combined', expiresAt },
        });

        const origin = `${req.protocol}://${req.get('host')}`;
        res.json({
            link: `${origin}/sign/${token}`,
            expiresAt,
        });
    } catch (err) { next(err); }
}
```

- [ ] **Step 2: Verify the server starts without errors**

Run: `cd server && node -e "require('./src/controllers/signingController')"`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/signingController.js
git commit -m "feat: generate single combined signing token instead of two"
```

---

### Task 2: Backend — Combined Submit Handler

**Files:**
- Modify: `server/src/controllers/signingController.js:66-152`

- [ ] **Step 1: Replace the role-based submit logic with a combined handler**

Replace the `submitSigningForm` function (lines 67-152) with:

```javascript
async function submitSigningForm(req, res, next) {
    try {
        const { token } = req.params;
        const record = await prisma.signingToken.findUnique({
            where: { token },
            include: { timesheet: { include: { entries: { orderBy: { dayOfWeek: 'asc' } } } } },
        });

        if (!record) return res.status(404).json({ error: 'Invalid link' });
        if (record.usedAt) return res.status(410).json({ error: 'This link has already been used' });
        if (new Date() > record.expiresAt) return res.status(410).json({ error: 'This link has expired' });

        const { entries, pcaFullName, pcaSignature, recipientName, recipientSignature, completionDate } = req.body;

        // Update all entries: activities, times, PCA initials, client initials
        if (entries && Array.isArray(entries)) {
            for (const entry of entries) {
                const existing = record.timesheet.entries.find(e => e.id === entry.id);
                if (!existing) continue;

                const adlHours = computeHours(entry.adlTimeIn, entry.adlTimeOut);
                const iadlHours = computeHours(entry.iadlTimeIn, entry.iadlTimeOut);

                await prisma.timesheetEntry.update({
                    where: { id: entry.id },
                    data: {
                        dateOfService: entry.dateOfService || existing.dateOfService,
                        adlActivities: typeof entry.adlActivities === 'string' ? entry.adlActivities : JSON.stringify(entry.adlActivities || {}),
                        adlTimeIn: entry.adlTimeIn || null,
                        adlTimeOut: entry.adlTimeOut || null,
                        adlHours,
                        adlPcaInitials: (entry.adlPcaInitials || '').trim(),
                        adlClientInitials: (entry.adlClientInitials || '').trim(),
                        iadlActivities: typeof entry.iadlActivities === 'string' ? entry.iadlActivities : JSON.stringify(entry.iadlActivities || {}),
                        iadlTimeIn: entry.iadlTimeIn || null,
                        iadlTimeOut: entry.iadlTimeOut || null,
                        iadlHours,
                        iadlPcaInitials: (entry.iadlPcaInitials || '').trim(),
                        iadlClientInitials: (entry.iadlClientInitials || '').trim(),
                    },
                });
            }
        }

        // Recalculate totals
        const allEntries = await prisma.timesheetEntry.findMany({ where: { timesheetId: record.timesheetId } });
        const totalPasHours = allEntries.reduce((s, e) => s + e.adlHours, 0);
        const totalHmHours = allEntries.reduce((s, e) => s + e.iadlHours, 0);

        // Update timesheet with all signature data + mark submitted
        await prisma.timesheet.update({
            where: { id: record.timesheetId },
            data: {
                totalPasHours,
                totalHmHours,
                totalHours: totalPasHours + totalHmHours,
                pcaFullName: pcaFullName || '',
                pcaSignature: pcaSignature || '',
                recipientName: recipientName || '',
                recipientSignature: recipientSignature || '',
                completionDate: completionDate || '',
                status: 'submitted',
                submittedAt: new Date(),
            },
        });

        // Mark token as used
        await prisma.signingToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

        res.json({ success: true });
    } catch (err) { next(err); }
}
```

- [ ] **Step 2: Keep the `computeHours` helper — make sure it uses 15-min rounding**

Replace the existing `computeHours` function at the bottom of `signingController.js` with the version that uses 15-min rounding (matching `timesheetController.js`):

```javascript
function roundTo15(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    let rounded;
    if (m <= 7) rounded = 0;
    else if (m <= 22) rounded = 15;
    else if (m <= 37) rounded = 30;
    else if (m <= 52) rounded = 45;
    else { return `${String(h + 1).padStart(2, '0')}:00`; }
    return `${String(h).padStart(2, '0')}:${String(rounded).padStart(2, '0')}`;
}

function computeHours(timeIn, timeOut) {
    if (!timeIn || !timeOut) return 0;
    const roundedIn = roundTo15(timeIn);
    const roundedOut = roundTo15(timeOut);
    const [hIn, mIn] = roundedIn.split(':').map(Number);
    const [hOut, mOut] = roundedOut.split(':').map(Number);
    const diff = (hOut * 60 + mOut) - (hIn * 60 + mIn);
    return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}
```

- [ ] **Step 3: Verify the server starts without errors**

Run: `cd server && node -e "require('./src/controllers/signingController')"`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/signingController.js
git commit -m "feat: combined submit handler saves PCA + client data in one request"
```

---

### Task 3: Backend — PDF Export Endpoint

**Files:**
- Modify: `server/src/controllers/timesheetController.js`
- Modify: `server/src/routes/api.js`

- [ ] **Step 1: Install pdfkit**

```bash
cd server && npm install pdfkit
```

- [ ] **Step 2: Add `exportTimesheetPdf` function to `timesheetController.js`**

Add the following at the end of `timesheetController.js`, before the `module.exports`:

```javascript
// ── PDF Export ─────────────────────────────────────────
const PDFDocument = require('pdfkit');

async function exportTimesheetPdf(req, res, next) {
    try {
        const id = Number(req.params.id);
        const ts = await prisma.timesheet.findUnique({
            where: { id },
            include: {
                client: true,
                entries: { orderBy: { dayOfWeek: 'asc' } },
            },
        });
        if (!ts) return res.status(404).json({ error: 'Timesheet not found' });

        const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: 30, bottom: 30, left: 30, right: 30 } });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="timesheet-${ts.id}.pdf"`);
        doc.pipe(res);

        const pageW = doc.page.width - 60; // minus margins
        const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

        // ── Header ──
        doc.fontSize(14).font('Helvetica-Bold').text('NV BEST PCA', { align: 'center' });
        doc.fontSize(10).font('Helvetica').text('PCA Service Delivery Record', { align: 'center' });
        doc.moveDown(0.3);

        // Client info row
        const weekStart = new Date(ts.weekStart);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const fmtD = (d) => d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'UTC' });

        doc.fontSize(8).font('Helvetica');
        const infoY = doc.y;
        doc.text(`Client: ${ts.client?.clientName || ''}`, 30, infoY);
        doc.text(`Medicaid ID: ${ts.client?.medicaidId || ''}`, 200, infoY);
        doc.text(`PCA: ${ts.pcaName || ''}`, 400, infoY);
        doc.text(`Week: ${fmtD(weekStart)} - ${fmtD(weekEnd)}`, 580, infoY);
        doc.moveDown(0.8);

        // ── Activity Grid ──
        const labelW = 130;
        const dayW = (pageW - labelW) / 7;
        let gridY = doc.y;

        const drawRow = (label, values, opts = {}) => {
            const { bold, bg, height } = { bold: false, bg: null, height: 14, ...opts };
            if (bg) {
                doc.save().rect(30, gridY, pageW, height).fill(bg).restore();
            }
            doc.fontSize(7).font(bold ? 'Helvetica-Bold' : 'Helvetica');
            doc.fillColor('#000');
            doc.text(label, 32, gridY + 2, { width: labelW - 4 });
            for (let i = 0; i < 7; i++) {
                const val = values[i] || '';
                const x = 30 + labelW + (i * dayW);
                doc.text(String(val), x + 2, gridY + 2, { width: dayW - 4, align: 'center' });
            }
            gridY += height;
            // Draw horizontal line
            doc.save().moveTo(30, gridY).lineTo(30 + pageW, gridY).lineWidth(0.3).stroke('#ccc').restore();
        };

        // Day header row
        drawRow('', dayNames.map((d, i) => {
            const e = ts.entries[i];
            const dateStr = e?.dateOfService ? new Date(e.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '';
            return `${d} ${dateStr}`;
        }), { bold: true, bg: '#e8e8e8' });

        // ADL section header
        drawRow("Activities of Daily Living — ADL's (PAS)", Array(7).fill(''), { bold: true, bg: '#f0f0f0' });

        const adlActivities = ['Bathing', 'Dressing', 'Grooming', 'Continence', 'Toileting', 'Ambulation/Mobility', 'Cane, Walker W/Chair', 'Transfer', 'Exer./Passive Range of Motion'];
        for (const act of adlActivities) {
            const vals = ts.entries.map((e) => {
                const activities = JSON.parse(e.adlActivities || '{}');
                return activities[act] ? '\u2713' : '';
            });
            drawRow(act, vals);
        }

        // ADL time/hours/initials rows
        drawRow('Time In', ts.entries.map((e) => e.adlTimeIn || ''), { bg: '#f8f8f8' });
        drawRow('Time Out', ts.entries.map((e) => e.adlTimeOut || ''));
        drawRow('Hours', ts.entries.map((e) => e.adlHours > 0 ? e.adlHours.toFixed(2) : ''), { bold: true });
        drawRow('PCA Initials', ts.entries.map((e) => e.adlPcaInitials || ''), { bg: '#e8f0ff' });
        drawRow('Client Initials', ts.entries.map((e) => e.adlClientInitials || ''), { bg: '#e8ffe8' });

        gridY += 6;

        // IADL section header
        drawRow("IADL's Instrumental Activities of Daily Living (HM)", Array(7).fill(''), { bold: true, bg: '#f0f0f0' });

        const iadlActivities = ['Light Housekeeping', 'Medication Reminders', 'Laundry', 'Shopping', 'Meal Preparation B.L.D.', 'Eating/Feeding'];
        for (const act of iadlActivities) {
            const vals = ts.entries.map((e) => {
                const activities = JSON.parse(e.iadlActivities || '{}');
                return activities[act] ? '\u2713' : '';
            });
            drawRow(act, vals);
        }

        // IADL time/hours/initials rows
        drawRow('Time In', ts.entries.map((e) => e.iadlTimeIn || ''), { bg: '#f8f8f8' });
        drawRow('Time Out', ts.entries.map((e) => e.iadlTimeOut || ''));
        drawRow('Hours', ts.entries.map((e) => e.iadlHours > 0 ? e.iadlHours.toFixed(2) : ''), { bold: true });
        drawRow('PCA Initials', ts.entries.map((e) => e.iadlPcaInitials || ''), { bg: '#e8f0ff' });
        drawRow('Client Initials', ts.entries.map((e) => e.iadlClientInitials || ''), { bg: '#e8ffe8' });

        gridY += 10;

        // ── Totals ──
        doc.y = gridY;
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text(`Total PAS Hours: ${ts.totalPasHours.toFixed(2)}     Total HM Hours: ${ts.totalHmHours.toFixed(2)}     Total Hours: ${ts.totalHours.toFixed(2)}`, 30, gridY);
        gridY += 20;

        // ── Signatures ──
        doc.y = gridY;
        doc.fontSize(8).font('Helvetica');

        const sigH = 40;
        const sigW = 200;

        // PCA signature
        doc.text('PCA Name: ' + (ts.pcaFullName || ''), 30, gridY);
        gridY += 12;
        if (ts.pcaSignature) {
            try { doc.image(ts.pcaSignature, 30, gridY, { width: sigW, height: sigH }); } catch (_) { /* skip invalid sig */ }
        }
        doc.text('PCA Signature', 30, gridY + sigH + 2);

        // Client signature
        const sigCol2 = 300;
        doc.text('Recipient Name: ' + (ts.recipientName || ''), sigCol2, gridY - 12);
        if (ts.recipientSignature) {
            try { doc.image(ts.recipientSignature, sigCol2, gridY, { width: sigW, height: sigH }); } catch (_) { /* skip invalid sig */ }
        }
        doc.text('Recipient / Responsible Party Signature', sigCol2, gridY + sigH + 2);

        // Supervisor
        const sigCol3 = 560;
        doc.text('Supervisor: ' + (ts.supervisorName || 'Sona Hakobyan'), sigCol3, gridY - 12);
        if (ts.supervisorSignature) {
            try { doc.image(ts.supervisorSignature, sigCol3, gridY, { width: sigW, height: sigH }); } catch (_) { /* skip invalid sig */ }
        }
        doc.text('Supervisor Signature', sigCol3, gridY + sigH + 2);

        if (ts.completionDate) {
            doc.text(`Date: ${ts.completionDate}`, 30, gridY + sigH + 16);
        }

        doc.end();
    } catch (err) { next(err); }
}
```

- [ ] **Step 3: Add `exportTimesheetPdf` to the module.exports**

In `timesheetController.js`, update the `module.exports` to include `exportTimesheetPdf`:

Find the current exports line and add `exportTimesheetPdf` to it.

- [ ] **Step 4: Add the route in `api.js`**

In `server/src/routes/api.js`, update the timesheetController import (line 32-39) to include `exportTimesheetPdf`:

```javascript
const {
    listTimesheets,
    getTimesheet,
    getActivities,
    createTimesheet,
    updateTimesheet,
    submitTimesheet,
    deleteTimesheet,
    exportTimesheetPdf,
} = require('../controllers/timesheetController');
```

Add the route after line 139 (after `router.delete('/timesheets/:id', deleteTimesheet)`):

```javascript
router.get('/timesheets/:id/export-pdf', requireRole('admin'), exportTimesheetPdf);
```

- [ ] **Step 5: Verify server starts**

Run: `cd server && node -e "require('./src/routes/api')"`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/timesheetController.js server/src/routes/api.js server/package.json server/package-lock.json
git commit -m "feat: add PDF export endpoint for timesheets"
```

---

### Task 4: Frontend — Update API Layer

**Files:**
- Modify: `client/src/api.js:127-151`

- [ ] **Step 1: Update `generateSigningLinks` response and add `exportTimesheetPdf`**

In `client/src/api.js`, the signing links section (lines 127-151) should be updated. Replace:

```javascript
// Signing Links
export const generateSigningLinks = (timesheetId) =>
    request(`/timesheets/${timesheetId}/signing-links`, { method: 'POST' });
```

This stays the same (the response shape changed but the call is identical).

Add after `submitSigningForm` (after line 151):

```javascript
// Timesheet PDF Export
export const exportTimesheetPdf = (id) =>
    fetch(`${BASE}/timesheets/${id}/export-pdf`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
    });
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api.js
git commit -m "feat: add exportTimesheetPdf API call, keep signing links call"
```

---

### Task 5: Frontend — Rewrite SigningFormPage as Combined Form

**Files:**
- Rewrite: `client/src/pages/SigningFormPage.jsx`

- [ ] **Step 1: Rewrite `SigningFormPage.jsx` with the combined form**

Replace the entire contents of `client/src/pages/SigningFormPage.jsx` with:

```jsx
import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import SignaturePad from '../components/common/SignaturePad';
import { formatWeek } from '../utils/dates';

const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ADL_ACTIVITIES = ['Bathing', 'Dressing', 'Grooming', 'Continence', 'Toileting', 'Ambulation/Mobility', 'Cane, Walker W/Chair', 'Transfer', 'Exer./Passive Range of Motion'];
const IADL_ACTIVITIES = ['Light Housekeeping', 'Medication Reminders', 'Laundry', 'Shopping', 'Meal Preparation B.L.D.', 'Eating/Feeding'];

function roundTo15(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    if (m <= 7) return `${String(h).padStart(2, '0')}:00`;
    if (m <= 22) return `${String(h).padStart(2, '0')}:15`;
    if (m <= 37) return `${String(h).padStart(2, '0')}:30`;
    if (m <= 52) return `${String(h).padStart(2, '0')}:45`;
    return `${String(h + 1).padStart(2, '0')}:00`;
}

function computeHours(timeIn, timeOut) {
    if (!timeIn || !timeOut) return 0;
    const ri = roundTo15(timeIn), ro = roundTo15(timeOut);
    const [hI, mI] = ri.split(':').map(Number);
    const [hO, mO] = ro.split(':').map(Number);
    const diff = (hO * 60 + mO) - (hI * 60 + mI);
    return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

export default function SigningFormPage({ token: tokenProp }) {
    const params = useParams();
    const token = tokenProp || params.token;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [ts, setTs] = useState(null);
    const [entries, setEntries] = useState([]);
    const [pcaFullName, setPcaFullName] = useState('');
    const [pcaSig, setPcaSig] = useState('');
    const [recipientName, setRecipientName] = useState('');
    const [recipientSig, setRecipientSig] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        api.getSigningForm(token)
            .then((data) => {
                setTs(data.timesheet);
                setEntries(data.timesheet.entries || []);
                setPcaFullName(data.timesheet.pcaFullName || '');
                setPcaSig(data.timesheet.pcaSignature || '');
                setRecipientName(data.timesheet.recipientName || '');
                setRecipientSig(data.timesheet.recipientSignature || '');
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [token]);

    const updateEntry = (idx, field, value) => {
        setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
    };

    const toggleActivity = (idx, section, activityKey) => {
        setEntries((prev) => prev.map((e, i) => {
            if (i !== idx) return e;
            const activities = JSON.parse(e[`${section}Activities`] || '{}');
            return { ...e, [`${section}Activities`]: JSON.stringify({ ...activities, [activityKey]: !activities[activityKey] }) };
        }));
    };

    const adlHrs = (e) => computeHours(e.adlTimeIn, e.adlTimeOut);
    const iadlHrs = (e) => computeHours(e.iadlTimeIn, e.iadlTimeOut);
    const totalPas = entries.reduce((s, e) => s + adlHrs(e), 0);
    const totalHm = entries.reduce((s, e) => s + iadlHrs(e), 0);

    // Determine which days have activity (any checkbox checked or any time entered)
    const dayHasActivity = (e) => {
        const adlActs = JSON.parse(e.adlActivities || '{}');
        const iadlActs = JSON.parse(e.iadlActivities || '{}');
        const hasChecked = Object.values(adlActs).some(Boolean) || Object.values(iadlActs).some(Boolean);
        const hasTime = e.adlTimeIn || e.adlTimeOut || e.iadlTimeIn || e.iadlTimeOut;
        return hasChecked || hasTime;
    };

    // Completeness check for submit gating
    const missing = useMemo(() => {
        const issues = [];
        entries.forEach((e, i) => {
            if (!dayHasActivity(e)) return;
            const day = DAY_SHORT[e.dayOfWeek];
            if (!(e.adlPcaInitials || '').trim() && !(e.iadlPcaInitials || '').trim()) issues.push(`${day}: PCA initials`);
            if (!(e.adlClientInitials || '').trim() && !(e.iadlClientInitials || '').trim()) issues.push(`${day}: Client initials`);
        });
        if (!pcaFullName.trim()) issues.push('PCA full name');
        if (!pcaSig) issues.push('PCA signature');
        if (!recipientName.trim()) issues.push('Client/recipient name');
        if (!recipientSig) issues.push('Client signature');
        return issues;
    }, [entries, pcaFullName, pcaSig, recipientName, recipientSig]);

    const canSubmit = missing.length === 0;

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            await api.submitSigningForm(token, {
                entries,
                pcaFullName,
                pcaSignature: pcaSig,
                recipientName,
                recipientSignature: recipientSig,
                completionDate: today,
            });
            setSuccess(true);
        } catch (err) { setError(err.message); }
        setSubmitting(false);
    };

    if (loading) return (
        <div className="signing-page">
            <div className="signing-card"><p style={{ textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading form...</p></div>
        </div>
    );
    if (error) return (
        <div className="signing-page">
            <div className="signing-card signing-card--error">
                <div className="signing-card__icon" style={{ color: 'hsl(0 84% 60%)' }}>{Icons.alertCircle}</div>
                <h2>{error}</h2>
                <p>This signing link is no longer valid. Please request a new link from your administrator.</p>
            </div>
        </div>
    );
    if (success) return (
        <div className="signing-page">
            <div className="signing-card signing-card--success">
                <div className="signing-card__icon" style={{ color: 'hsl(142 76% 36%)' }}>{Icons.checkCircle}</div>
                <h2>Thank you!</h2>
                <p>The timesheet has been submitted successfully. You may close this page.</p>
            </div>
        </div>
    );

    const weekLabel = formatWeek(ts.weekStart.split('T')[0]);

    return (
        <div className="signing-page">
            <div className="signing-form-container">
                {/* Header */}
                <div className="signing-header">
                    <div className="signing-header__logo">{Icons.shieldCheck}</div>
                    <h1 className="signing-header__title">NV Best PCA</h1>
                    <p className="signing-header__sub">PCA Service Delivery Record</p>
                </div>

                <div className="signing-info-bar">
                    <div><strong>Client:</strong> {ts.client?.clientName}</div>
                    <div><strong>PCA:</strong> {ts.pcaName}</div>
                    <div><strong>Week:</strong> {weekLabel}</div>
                </div>

                {/* Day entries */}
                <div className="signing-entries">
                    {entries.map((entry, idx) => {
                        const dayName = DAY_SHORT[entry.dayOfWeek] || `Day ${entry.dayOfWeek}`;
                        const dateStr = entry.dateOfService ? new Date(entry.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

                        return (
                            <div key={entry.id} className="signing-day-card">
                                <div className="signing-day-card__header">{dayName} {dateStr && <span>{dateStr}</span>}</div>
                                <div className="signing-day-card__body">

                                    {/* ADL Section */}
                                    <div className="signing-section-label">ADL Activities</div>
                                    <div className="signing-activity-grid">
                                        {ADL_ACTIVITIES.map((act) => {
                                            const activities = JSON.parse(entry.adlActivities || '{}');
                                            return (
                                                <label key={act} className="signing-activity-check">
                                                    <input type="checkbox" checked={!!activities[act]} onChange={() => toggleActivity(idx, 'adl', act)} />
                                                    <span>{act}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <div className="signing-field-row">
                                        <div className="signing-field">
                                            <label>Time In</label>
                                            <input type="time" value={entry.adlTimeIn || ''} onChange={(e) => updateEntry(idx, 'adlTimeIn', e.target.value)} />
                                        </div>
                                        <div className="signing-field">
                                            <label>Time Out</label>
                                            <input type="time" value={entry.adlTimeOut || ''} onChange={(e) => updateEntry(idx, 'adlTimeOut', e.target.value)} />
                                        </div>
                                        <div className="signing-field">
                                            <label>Hours</label>
                                            <div className="signing-hours">{adlHrs(entry).toFixed(2)}</div>
                                        </div>
                                    </div>

                                    {/* IADL Section */}
                                    <div className="signing-section-label" style={{ marginTop: 12 }}>IADL Activities</div>
                                    <div className="signing-activity-grid">
                                        {IADL_ACTIVITIES.map((act) => {
                                            const activities = JSON.parse(entry.iadlActivities || '{}');
                                            return (
                                                <label key={act} className="signing-activity-check">
                                                    <input type="checkbox" checked={!!activities[act]} onChange={() => toggleActivity(idx, 'iadl', act)} />
                                                    <span>{act}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <div className="signing-field-row">
                                        <div className="signing-field">
                                            <label>Time In</label>
                                            <input type="time" value={entry.iadlTimeIn || ''} onChange={(e) => updateEntry(idx, 'iadlTimeIn', e.target.value)} />
                                        </div>
                                        <div className="signing-field">
                                            <label>Time Out</label>
                                            <input type="time" value={entry.iadlTimeOut || ''} onChange={(e) => updateEntry(idx, 'iadlTimeOut', e.target.value)} />
                                        </div>
                                        <div className="signing-field">
                                            <label>Hours</label>
                                            <div className="signing-hours">{iadlHrs(entry).toFixed(2)}</div>
                                        </div>
                                    </div>

                                    {/* PCA Initials — highlighted blue */}
                                    <div className="signing-highlight signing-highlight--pca" style={{ marginTop: 12 }}>
                                        <div className="signing-highlight__label">PCA Initials</div>
                                        <div className="signing-field-row">
                                            <div className="signing-field">
                                                <label>ADL</label>
                                                <input type="text" value={entry.adlPcaInitials || ''} onChange={(e) => updateEntry(idx, 'adlPcaInitials', e.target.value.toUpperCase())} maxLength={5} style={{ width: 80 }} />
                                            </div>
                                            <div className="signing-field">
                                                <label>IADL</label>
                                                <input type="text" value={entry.iadlPcaInitials || ''} onChange={(e) => updateEntry(idx, 'iadlPcaInitials', e.target.value.toUpperCase())} maxLength={5} style={{ width: 80 }} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Client Initials — highlighted green */}
                                    <div className="signing-highlight signing-highlight--client" style={{ marginTop: 8 }}>
                                        <div className="signing-highlight__label">{Icons.handPoint || '👉'} Hand device to client</div>
                                        <div className="signing-highlight__sublabel">Client Initials</div>
                                        <div className="signing-field-row">
                                            <div className="signing-field">
                                                <label>ADL</label>
                                                <input type="text" value={entry.adlClientInitials || ''} onChange={(e) => updateEntry(idx, 'adlClientInitials', e.target.value.toUpperCase())} maxLength={5} style={{ width: 80 }} />
                                            </div>
                                            <div className="signing-field">
                                                <label>IADL</label>
                                                <input type="text" value={entry.iadlClientInitials || ''} onChange={(e) => updateEntry(idx, 'iadlClientInitials', e.target.value.toUpperCase())} maxLength={5} style={{ width: 80 }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Totals */}
                <div className="signing-totals">
                    <div><strong>Total PAS (ADL):</strong> {totalPas.toFixed(2)} hrs</div>
                    <div><strong>Total HM (IADL):</strong> {totalHm.toFixed(2)} hrs</div>
                    <div><strong>Total Hours:</strong> {(totalPas + totalHm).toFixed(2)} hrs</div>
                </div>

                {/* PCA Signature — highlighted blue */}
                <div className="signing-highlight signing-highlight--pca signing-signature-section">
                    <div className="signing-highlight__label">PCA Signature</div>
                    <div className="form-group">
                        <label>PCA Full Name</label>
                        <input type="text" value={pcaFullName} onChange={(e) => setPcaFullName(e.target.value)} placeholder="Enter your full name" />
                    </div>
                    <SignaturePad label="PCA Signature" value={pcaSig} onChange={setPcaSig} />
                </div>

                {/* Client Signature — highlighted green */}
                <div className="signing-highlight signing-highlight--client signing-signature-section">
                    <div className="signing-highlight__label">{Icons.handPoint || '👉'} Hand device to client for signature</div>
                    <div className="form-group">
                        <label>Recipient / Responsible Party Name</label>
                        <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Enter client full name" />
                    </div>
                    <SignaturePad label="Recipient / Responsible Party Signature" value={recipientSig} onChange={setRecipientSig} />
                </div>

                {/* Missing items message */}
                {missing.length > 0 && (
                    <div className="signing-missing">
                        <strong>Missing before submit:</strong>
                        <ul>{missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
                    </div>
                )}

                {/* Submit */}
                <button
                    className={`btn ${canSubmit ? 'btn--success' : 'btn--primary'}`}
                    style={{ width: '100%', marginTop: 16, padding: '14px 0', fontSize: 16, opacity: canSubmit ? 1 : 0.5 }}
                    onClick={handleSubmit}
                    disabled={!canSubmit || submitting}
                >
                    {submitting ? 'Submitting...' : 'Submit Timesheet'}
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify client builds**

Run: `cd client && npm run build`
Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/SigningFormPage.jsx
git commit -m "feat: rewrite SigningFormPage as combined PCA+client form with submit gating"
```

---

### Task 6: Frontend — Add Highlighted Section Styles

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Add CSS for highlighted sections, activity grid, totals, missing message, and success button**

Append the following to the end of `client/src/index.css`:

```css
/* ── Signing Form — Highlighted Sections ── */
.signing-highlight {
    border-radius: 8px;
    padding: 12px;
}
.signing-highlight--pca {
    background: hsl(213 80% 95%);
    border: 2px solid hsl(213 80% 75%);
}
.signing-highlight--client {
    background: hsl(142 60% 93%);
    border: 2px solid hsl(142 60% 70%);
}
.signing-highlight__label {
    font-weight: 700;
    font-size: 14px;
    margin-bottom: 8px;
    color: hsl(var(--foreground));
}
.signing-highlight__sublabel {
    font-weight: 600;
    font-size: 12px;
    margin-bottom: 6px;
    color: hsl(var(--muted-foreground));
}
.signing-signature-section {
    margin-top: 16px;
}

/* Activity checkboxes grid */
.signing-activity-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 4px 12px;
    margin-bottom: 8px;
}
.signing-activity-check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    cursor: pointer;
}
.signing-activity-check input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
}
.signing-section-label {
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 6px;
    color: hsl(var(--foreground));
    padding-bottom: 2px;
    border-bottom: 1px solid hsl(var(--border));
}

/* Totals bar */
.signing-totals {
    display: flex;
    justify-content: space-around;
    padding: 12px;
    background: hsl(var(--muted));
    border-radius: 8px;
    margin-top: 16px;
    font-size: 14px;
}

/* Missing items warning */
.signing-missing {
    background: hsl(38 96% 92%);
    border: 1px solid hsl(38 96% 70%);
    border-radius: 8px;
    padding: 12px;
    margin-top: 16px;
    font-size: 13px;
}
.signing-missing ul {
    margin: 6px 0 0 0;
    padding-left: 20px;
}
.signing-missing li {
    margin-bottom: 2px;
}

/* Success button variant */
.btn--success {
    background: hsl(142 71% 35%);
    color: white;
    border: none;
    font-weight: 700;
}
.btn--success:hover {
    background: hsl(142 71% 30%);
}
```

- [ ] **Step 2: Verify client builds**

Run: `cd client && npm run build`
Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "feat: add CSS for highlighted signing sections and submit gating"
```

---

### Task 7: Frontend — Update Share Modal and Add Export Button

**Files:**
- Modify: `client/src/pages/TimesheetFormPage.jsx:122-127, 254-275`

- [ ] **Step 1: Update `handleShareLinks` to use single link response**

In `TimesheetFormPage.jsx`, the `handleShareLinks` function (lines 122-127) stays the same — it calls `api.generateSigningLinks(ts.id)` and stores the result. The response shape changed from `{ pcaLink, clientLink }` to `{ link }`, so we need to update the modal that displays it.

- [ ] **Step 2: Update the share modal to show one link**

Replace the share modal (lines 254-275) with:

```jsx
{shareLinkModal && (
    <Modal onClose={() => setShareLinkModal(null)}>
        <h2 className="modal__title"><span style={{ display: 'inline-block', width: 20, height: 20, verticalAlign: 'middle', marginRight: 6 }}>{Icons.share}</span>Signing Link</h2>
        <p className="modal__desc">Share this secure one-time link with the PCA. The link expires in 72 hours and can only be used once. The PCA will fill in their sections and collect the client signature on the same form.</p>
        <div className="share-link-group">
            <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block' }}>Signing Link (send to PCA)</label>
            <div className="share-link-row">
                <input type="text" readOnly value={shareLinkModal.link} className="share-link-input" />
                <button className="btn btn--outline btn--sm" onClick={() => { navigator.clipboard.writeText(shareLinkModal.link); showToast('Link copied!'); }}>{Icons.copy} Copy</button>
            </div>
        </div>
    </Modal>
)}
```

- [ ] **Step 3: Add Export PDF button in the header for submitted timesheets**

In the content header actions section (lines 198-208), add an Export PDF button when the timesheet is submitted. Replace:

```jsx
{submitted ? (
    <span className="ts-badge ts-badge--submitted">Submitted {ts.submittedAt ? new Date(ts.submittedAt).toLocaleString() : ''}</span>
) : (
```

With:

```jsx
{submitted ? (
    <>
        <span className="ts-badge ts-badge--submitted">Submitted {ts.submittedAt ? new Date(ts.submittedAt).toLocaleString() : ''}</span>
        <button className="btn btn--outline btn--sm" onClick={async () => {
            try {
                const blob = await api.exportTimesheetPdf(ts.id);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `timesheet-${ts.id}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (err) { showToast(err.message, 'error'); }
        }}>{Icons.download || '↓'} Export PDF</button>
    </>
) : (
```

- [ ] **Step 4: Verify client builds**

Run: `cd client && npm run build`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/TimesheetFormPage.jsx
git commit -m "feat: single signing link in share modal, add Export PDF button"
```

---

### Task 8: End-to-End Verification

- [ ] **Step 1: Build client and start server**

```bash
cd client && npm run build && cd ../server && node src/index.js
```

- [ ] **Step 2: Test the signing flow**

1. Log in as admin at `localhost:4000`
2. Go to Timesheets, create a new timesheet
3. Click Share — verify one link appears (not two)
4. Open the signing link in a new browser tab
5. Verify: day cards with ADL/IADL activity checkboxes, time fields, highlighted PCA initials (blue), highlighted client initials (green)
6. Fill in some activities and times for a couple of days
7. Verify submit button is disabled with missing items message
8. Fill in all required fields (PCA initials, client initials for active days, PCA name+sig, client name+sig)
9. Verify submit button turns green and becomes enabled
10. Submit and verify success screen

- [ ] **Step 3: Test PDF export**

1. Go back to the admin timesheet form for the submitted timesheet
2. Click "Export PDF"
3. Verify PDF downloads with correct layout: activity grid, times, initials, signatures

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: end-to-end verification fixes"
```
