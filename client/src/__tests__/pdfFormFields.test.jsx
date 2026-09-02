import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { extractFormFields } from '../utils/pdfFormFields';

async function pdfWithRadio() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    const form = doc.getForm();
    const rg = form.createRadioGroup('choice');
    rg.addOptionToPage('Yes', page, { x: 20, y: 150, width: 12, height: 12 });
    rg.addOptionToPage('No', page, { x: 60, y: 150, width: 12, height: 12 });
    rg.select('Yes');
    const tf = form.createTextField('name');
    tf.setText('hi');
    tf.addToPage(page, { x: 20, y: 100, width: 100, height: 16 });
    return doc.save();
}

async function pdfWithThreeWayRadio() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    const form = doc.getForm();
    const rg = form.createRadioGroup('answer');
    // Three distinct export names, added in a specific order — this is the
    // scenario that breaks a "raw widget index into exportValues" mapping
    // whenever pdf-lib's getOnValues()/getExportValues() alignment doesn't
    // match the widget insertion order 1:1 (e.g. a widget with no on-value
    // present between selectable options, per pdf-lib's own getSelected()
    // implementation which this fix mirrors exactly).
    rg.addOptionToPage('Yes', page, { x: 20, y: 150, width: 12, height: 12 });
    rg.addOptionToPage('No', page, { x: 60, y: 150, width: 12, height: 12 });
    rg.addOptionToPage('Maybe', page, { x: 100, y: 150, width: 12, height: 12 });
    rg.select('Maybe');
    return doc.save();
}

describe('extractFormFields radio widgets', () => {
    it('emits one radio-option entry per widget with its optionValue', async () => {
        const fields = await extractFormFields(await pdfWithRadio());
        const radios = fields.filter(f => f.type === 'radio-option' && f.name === 'choice');
        expect(radios.length).toBe(2);
        const opts = radios.map(r => r.optionValue).sort();
        expect(opts).toEqual(['No', 'Yes']);
        // each carries the group's selected value
        expect(radios.every(r => r.value === 'Yes')).toBe(true);
        // each has its own distinct rect
        expect(radios[0].rect.x).not.toBe(radios[1].rect.x);
    });

    it('still emits text fields normally', async () => {
        const fields = await extractFormFields(await pdfWithRadio());
        const text = fields.find(f => f.type === 'text' && f.name === 'name');
        expect(text).toBeTruthy();
        expect(text.value).toBe('hi');
    });

    it('maps each widget in a 3-way group to its own distinct export value, not a raw index into exportValues', async () => {
        const fields = await extractFormFields(await pdfWithThreeWayRadio());
        const radios = fields.filter(f => f.type === 'radio-option' && f.name === 'answer');
        expect(radios.length).toBe(3);

        // Every widget must resolve to a real, distinct option name — never
        // borrowing the export value that belongs to a different widget's
        // position in the group (the off-by-one/misalignment bug this fixes).
        const opts = radios.map(r => r.optionValue).sort();
        expect(opts).toEqual(['Maybe', 'No', 'Yes']);
        expect(new Set(opts).size).toBe(3);

        // Each widget still carries its own distinct rect.
        const xs = radios.map(r => r.rect.x);
        expect(new Set(xs).size).toBe(3);

        // The group's selected value ("Maybe") is reported on every widget,
        // and the widget whose optionValue is "Maybe" is the one at x=100
        // (the third option added) — confirming optionValue is tied to the
        // correct underlying widget, not just plucked from exportValues by
        // raw enumeration order.
        expect(radios.every(r => r.value === 'Maybe')).toBe(true);
        const maybeWidget = radios.find(r => r.optionValue === 'Maybe');
        expect(Math.abs(maybeWidget.rect.x - 100)).toBeLessThan(1);
    });
});
