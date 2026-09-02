// client/src/__tests__/useFitToWidth.test.jsx
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useFitToWidth } from '../hooks/useFitToWidth';

// jsdom has no ResizeObserver. Stub one that records the element it
// observes and lets tests trigger a callback manually.
let observers = [];
class FakeResizeObserver {
    constructor(cb) {
        this.cb = cb;
        this.target = null;
        observers.push(this);
    }
    observe(el) { this.target = el; }
    disconnect() { this.target = null; }
    trigger(width) {
        this.cb([{ contentRect: { width }, contentBoxSize: null }]);
    }
}

function makePage(width) {
    return { getViewport: () => ({ width }) };
}

beforeEach(() => {
    observers = [];
    global.ResizeObserver = FakeResizeObserver;
});

afterEach(() => {
    delete global.ResizeObserver;
});

describe('useFitToWidth', () => {
    it('does nothing when there are no pages', () => {
        const setZoom = vi.fn();
        const containerRef = { current: { clientWidth: 850 } };
        const userZoomedRef = { current: false };
        renderHook(() => useFitToWidth(containerRef, [], userZoomedRef, setZoom));
        expect(setZoom).not.toHaveBeenCalled();
        expect(observers.length).toBe(0);
    });

    it('applies fit-to-width on initial measure once the container has a real width', () => {
        const setZoom = vi.fn();
        const containerRef = { current: { clientWidth: 850 } };
        const userZoomedRef = { current: false };
        const pages = [makePage(612)];
        renderHook(() => useFitToWidth(containerRef, pages, userZoomedRef, setZoom));
        // (850 - 48) / 612 ≈ 1.31
        expect(setZoom).toHaveBeenCalledTimes(1);
        expect(setZoom.mock.calls[0][0]).toBeCloseTo(1.310, 2);
    });

    it('does not call setZoom when the container width is 0 (not yet laid out)', () => {
        const setZoom = vi.fn();
        const containerRef = { current: { clientWidth: 0 } };
        const userZoomedRef = { current: false };
        const pages = [makePage(612)];
        renderHook(() => useFitToWidth(containerRef, pages, userZoomedRef, setZoom));
        expect(setZoom).not.toHaveBeenCalled();
    });

    it('re-fits when the ResizeObserver reports a new width', () => {
        const setZoom = vi.fn();
        const containerRef = { current: { clientWidth: 0 } };
        const userZoomedRef = { current: false };
        const pages = [makePage(612)];
        renderHook(() => useFitToWidth(containerRef, pages, userZoomedRef, setZoom));
        expect(setZoom).not.toHaveBeenCalled();

        act(() => {
            containerRef.current.clientWidth = 850;
            observers[0].trigger(850);
        });
        expect(setZoom).toHaveBeenCalledTimes(1);
        expect(setZoom.mock.calls[0][0]).toBeCloseTo(1.310, 2);

        act(() => {
            containerRef.current.clientWidth = 1200;
            observers[0].trigger(1200);
        });
        expect(setZoom).toHaveBeenCalledTimes(2);
        // (1200 - 48) / 612 ≈ 1.882, but the auto-fit is capped at the default
        // maxScale (1.5) so a portrait page doesn't balloon on a wide viewer.
        expect(setZoom.mock.calls[1][0]).toBeCloseTo(1.5, 2);
    });

    it('caps the auto-fit at the default maxScale (1.5) on a wide container', () => {
        const setZoom = vi.fn();
        const containerRef = { current: { clientWidth: 1650 } };
        const userZoomedRef = { current: false };
        const pages = [makePage(612)];
        renderHook(() => useFitToWidth(containerRef, pages, userZoomedRef, setZoom));
        // (1650 - 48) / 612 ≈ 2.62 uncapped → clamped to 1.5
        expect(setZoom).toHaveBeenCalledTimes(1);
        expect(setZoom.mock.calls[0][0]).toBeCloseTo(1.5, 2);
    });

    it('respects a custom maxScale argument', () => {
        const setZoom = vi.fn();
        const containerRef = { current: { clientWidth: 1650 } };
        const userZoomedRef = { current: false };
        const pages = [makePage(612)];
        renderHook(() => useFitToWidth(containerRef, pages, userZoomedRef, setZoom, 2));
        expect(setZoom.mock.calls[0][0]).toBeCloseTo(2, 2);
    });

    it('stops auto-fitting once the user has manually zoomed', () => {
        const setZoom = vi.fn();
        const containerRef = { current: { clientWidth: 850 } };
        const userZoomedRef = { current: true };
        const pages = [makePage(612)];
        renderHook(() => useFitToWidth(containerRef, pages, userZoomedRef, setZoom));
        expect(setZoom).not.toHaveBeenCalled();

        act(() => {
            observers[0].trigger(1200);
        });
        expect(setZoom).not.toHaveBeenCalled();
    });

    it('disconnects the observer on unmount', () => {
        const setZoom = vi.fn();
        const containerRef = { current: { clientWidth: 850 } };
        const userZoomedRef = { current: false };
        const pages = [makePage(612)];
        const { unmount } = renderHook(() => useFitToWidth(containerRef, pages, userZoomedRef, setZoom));
        const observer = observers[0];
        expect(observer.target).toBe(containerRef.current);
        unmount();
        expect(observer.target).toBeNull();
    });
});
