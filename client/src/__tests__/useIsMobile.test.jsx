import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useIsMobile } from '../hooks/useIsMobile';

describe('useIsMobile', () => {
    let matchMediaMock;

    beforeEach(() => {
        matchMediaMock = (matches) => ({
            matches,
            addEventListener: (_, handler) => { matchMediaMock._handler = handler; },
            removeEventListener: () => {},
        });
    });

    afterEach(() => {
        matchMediaMock = null;
    });

    it('returns true when viewport is 640px or less', () => {
        window.matchMedia = () => matchMediaMock(true);
        const { result } = renderHook(() => useIsMobile());
        expect(result.current).toBe(true);
    });

    it('returns false when viewport is above 640px', () => {
        window.matchMedia = () => matchMediaMock(false);
        const { result } = renderHook(() => useIsMobile());
        expect(result.current).toBe(false);
    });
});
