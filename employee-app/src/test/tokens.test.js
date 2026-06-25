import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf8');

describe('design tokens', () => {
  const required = [
    '--primary',
    '--primary-foreground',
    '--foreground',
    '--muted-foreground',
    '--background',
    '--card',
    '--border',
    '--success',
    '--warning',
    '--destructive',
    '--radius',
    '--svc-pas',
    '--svc-homemaker',
    '--svc-respite',
    '--svc-companion',
  ];

  for (const token of required) {
    it(`defines ${token}`, () => {
      expect(css).toMatch(new RegExp(`${token}\\s*:`));
    });
  }

  it('uses HSL channel format (no hex literals) for primary', () => {
    const match = css.match(/--primary\s*:\s*([^;]+);/);
    expect(match).toBeTruthy();
    expect(match[1].trim()).toMatch(/^\d/);
  });
});
