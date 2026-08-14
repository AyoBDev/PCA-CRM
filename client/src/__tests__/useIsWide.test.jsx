// client/src/__tests__/useIsWide.test.jsx
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useIsWide } from '../hooks/useIsWide';

describe('useIsWide', () => {
  it('is true when window is at/above the breakpoint', () => {
    window.innerWidth = 1200;
    const { result } = renderHook(() => useIsWide(900));
    expect(result.current).toBe(true);
  });

  it('is false below the breakpoint and updates on resize', () => {
    window.innerWidth = 600;
    const { result } = renderHook(() => useIsWide(900));
    expect(result.current).toBe(false);
    act(() => { window.innerWidth = 1000; window.dispatchEvent(new Event('resize')); });
    expect(result.current).toBe(true);
  });
});
