import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { fillFormFields } from '../utils/pdfSave';

async function makeFillablePdf() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    const form = doc.getForm();
    const field = form.createTextField('date');
    field.setText('2025-01-01');
    field.addToPage(page, { x: 20, y: 150, width: 120, height: 20 });
    return doc.save();
}

describe('fillFormFields', () => {
    it('keeps fields live and applies new value by default (no flatten)', async () => {
        const bytes = await makeFillablePdf();
        const out = await fillFormFields(bytes, { date: '2026-01-01' });
        const reloaded = await PDFDocument.load(out);
        const names = reloaded.getForm().getFields().map(f => f.getName());
        expect(names).toContain('date');
        expect(reloaded.getForm().getTextField('date').getText()).toBe('2026-01-01');
    });

    it('flattens fields away when flatten:true', async () => {
        const bytes = await makeFillablePdf();
        const out = await fillFormFields(bytes, { date: '2026-01-01' }, { flatten: true });
        const reloaded = await PDFDocument.load(out);
        expect(reloaded.getForm().getFields().length).toBe(0);
    });
});
