import { describe, it, expect } from 'vitest';
import { computeFitScale } from '../utils/pdfFit';

describe('computeFitScale', () => {
    it('scales a 612px letter page to a ~850px container (minus padding)', () => {
        // (850 - 48) / 612 = 1.310...
        expect(computeFitScale(850, 612)).toBeCloseTo(1.310, 2);
    });
    it('clamps to max 3 for a tiny page in a huge container', () => {
        expect(computeFitScale(5000, 100)).toBe(3);
    });
    it('clamps to min 0.5 for a huge page in a tiny container', () => {
        expect(computeFitScale(100, 5000)).toBe(0.5);
    });
    it('returns 1 when container width is unknown (0)', () => {
        expect(computeFitScale(0, 612)).toBe(1);
    });
    it('returns 1 when page width is invalid', () => {
        expect(computeFitScale(850, 0)).toBe(1);
    });
});
