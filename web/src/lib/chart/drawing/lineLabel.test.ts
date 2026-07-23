import { describe, expect, it } from 'vitest';
import { formatLineLabel } from './lineLabel';

describe('formatLineLabel', () => {
  it('numbers lines from 1', () => {
    expect(formatLineLabel(0)).toBe('#1');
    expect(formatLineLabel(2)).toBe('#3');
  });

  it('does not expose the drawn coordinates/dates', () => {
    expect(formatLineLabel(0)).toBe('#1');
  });
});
