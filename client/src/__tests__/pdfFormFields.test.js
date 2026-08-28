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
});
