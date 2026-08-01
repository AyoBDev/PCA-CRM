import { describe, it, expect } from 'vitest';
import { PAYLOAD_SECTIONS, buildEntryPayload } from '../pages/PcaFormPage';

const fullEntry = {
    id: 7,
    dayOfWeek: 2,
    dateOfService: '2026-07-22',
    adlActivities: '{"Bathing":true}',
    adlTimeIn: '09:00',
    adlTimeOut: '11:00',
    adlPcaInitials: 'AB',
    adlClientInitials: 'CD',
    adlTimeBlocks: '[]',
    iadlActivities: '{"Laundry":true}',
    iadlTimeIn: '12:00',
    iadlTimeOut: '13:00',
    iadlPcaInitials: 'AB',
    iadlClientInitials: 'CD',
    iadlTimeBlocks: '[]',
    respiteActivities: '{"Supervision":true}',
    respiteTimeIn: '14:00',
    respiteTimeOut: '15:00',
    respitePcaInitials: 'AB',
    respiteClientInitials: 'CD',
    respiteTimeBlocks: '[]',
    companionActivities: '{"Companionship":true}',
    companionTimeIn: '16:00',
    companionTimeOut: '18:00',
    companionPcaInitials: 'AB',
    companionClientInitials: 'CD',
    companionTimeBlocks: '[{"in":"19:00","out":"20:00"}]',
};

describe('buildEntryPayload', () => {
    it('covers every timesheet section, including companion', () => {
        expect(PAYLOAD_SECTIONS).toContain('companion');
    });

    it('forwards companion activities, times, initials and time blocks', () => {
        const out = buildEntryPayload(fullEntry);

        expect(out.companionActivities).toBe('{"Companionship":true}');
        expect(out.companionTimeIn).toBe('16:00');
        expect(out.companionTimeOut).toBe('18:00');
        expect(out.companionPcaInitials).toBe('AB');
        expect(out.companionClientInitials).toBe('CD');
        expect(out.companionTimeBlocks).toBe('[{"in":"19:00","out":"20:00"}]');
    });

    it('still forwards the pre-existing sections unchanged', () => {
        const out = buildEntryPayload(fullEntry);

        expect(out.id).toBe(7);
        expect(out.dayOfWeek).toBe(2);
        expect(out.dateOfService).toBe('2026-07-22');
        expect(out.adlActivities).toBe('{"Bathing":true}');
        expect(out.iadlTimeIn).toBe('12:00');
        expect(out.respiteClientInitials).toBe('CD');
    });

    it('normalises empty fields to the shapes the server expects', () => {
        const out = buildEntryPayload({ id: 1, dayOfWeek: 0, dateOfService: '2026-07-20' });

        for (const sec of PAYLOAD_SECTIONS) {
            expect(out[`${sec}Activities`]).toBe('{}');
            expect(out[`${sec}TimeIn`]).toBeNull();
            expect(out[`${sec}TimeOut`]).toBeNull();
            expect(out[`${sec}PcaInitials`]).toBe('');
            expect(out[`${sec}ClientInitials`]).toBe('');
            expect(out[`${sec}TimeBlocks`]).toBe('[]');
        }
    });
});
