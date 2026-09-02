import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import { extractFormFields } from '../utils/pdfFormFields';
import PdfFormField from '../components/pdf/PdfFormField';

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

async function pdfWithFontSizes() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    const form = doc.getForm();

    // FA-24-style auto-size field: /DA carries an explicit "0 Tf".
    const auto = form.createTextField('autoField');
    auto.addToPage(page, { x: 20, y: 150, width: 100, height: 20 });
    auto.setFontSize(0);

    // Explicit fixed-size field.
    const explicit = form.createTextField('explicitField');
    explicit.addToPage(page, { x: 20, y: 100, width: 100, height: 20 });
    explicit.setFontSize(10);

    // pdf-lib's save() by default regenerates each field's appearance stream
    // (and, for an auto-size "0 Tf" field, computes and writes back a real
    // point size instead of leaving "0"). Skip that so the synthesized "0 Tf"
    // DA — the FA-24 case this feature targets — survives the round trip.
    return doc.save({ updateFieldAppearances: false });
}

describe('extractFormFields text field font size (/DA parsing)', () => {
    it('reports fontSize: 0 for an auto-size field (DA "0 Tf")', async () => {
        const fields = await extractFormFields(await pdfWithFontSizes());
        const auto = fields.find(f => f.name === 'autoField');
        expect(auto).toBeTruthy();
        expect(auto.type).toBe('text');
        expect(auto.fontSize).toBe(0);
    });

    it('reports the explicit point size for a fixed-size field (DA "10 Tf")', async () => {
        const fields = await extractFormFields(await pdfWithFontSizes());
        const explicit = fields.find(f => f.name === 'explicitField');
        expect(explicit).toBeTruthy();
        expect(explicit.type).toBe('text');
        expect(explicit.fontSize).toBe(10);
    });

    it('does not add fontSize to non-text fields', async () => {
        const fields = await extractFormFields(await pdfWithRadio());
        const checkboxLike = fields.filter(f => f.type !== 'text');
        expect(checkboxLike.length).toBeGreaterThan(0);
        checkboxLike.forEach(f => expect(f.fontSize).toBeUndefined());
    });
});

describe('PdfFormField font size rendering', () => {
    const baseField = {
        name: 'f',
        type: 'text',
        multiline: false,
        rect: { x: 0, y: 0, width: 200, height: 40 },
        readOnly: false,
    };
    // pageHeight = 100 so pdfRectToScreen's top-flip math doesn't matter here;
    // we only assert on the resulting fontSize.
    const pageHeight = 100;

    it('uses fontSize * zoom for an explicit-size field', () => {
        const field = { ...baseField, fontSize: 10 };
        const zoom = 1.5;
        const { container } = render(
            <PdfFormField field={field} pageHeight={pageHeight} zoom={zoom} value="" onChange={() => {}} />
        );
        const input = container.querySelector('input');
        expect(input.style.fontSize).toBe(`${10 * zoom}px`);
    });

    it('uses ~height*0.8 for an auto-size (fontSize: 0) field', () => {
        const field = { ...baseField, fontSize: 0 };
        const zoom = 1;
        const { container } = render(
            <PdfFormField field={field} pageHeight={pageHeight} zoom={zoom} value="" onChange={() => {}} />
        );
        const input = container.querySelector('input');
        // pos.height = rect.height * zoom = 40 (not clamped, since >= 14)
        expect(input.style.fontSize).toBe(`${40 * 0.8}px`);
    });

    it('caps the font size for narrow boxes (e.g. a date Month box) so digits do not clip', () => {
        const narrowField = { ...baseField, rect: { x: 0, y: 0, width: 18, height: 20 }, fontSize: 0 };
        const zoom = 1;
        const { container } = render(
            <PdfFormField field={narrowField} pageHeight={pageHeight} zoom={zoom} value="08" onChange={() => {}} />
        );
        const input = container.querySelector('input');
        // pos.height = 20 (>= 14, unclamped); auto renderFont = 20*0.8 = 16.
        // Narrow cap: min(renderFont, max(6, pos.height*0.6)) = min(16, 12) = 12.
        expect(input.style.fontSize).toBe('12px');
    });
});

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
