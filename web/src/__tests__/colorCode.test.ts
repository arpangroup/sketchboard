import { describe, expect, it } from 'vitest';
import { parseHexColor } from '../ui/colorCode';

describe('typed colour codes', () => {
  it('reads codes with or without #, in any case, short or long', () => {
    expect(parseHexColor('e1e1e1')).toBe('#e1e1e1');
    expect(parseHexColor('#E1E1E1')).toBe('#e1e1e1');
    expect(parseHexColor('  #1971C2 ')).toBe('#1971c2');
    expect(parseHexColor('abc')).toBe('#aabbcc');
    expect(parseHexColor('#fff')).toBe('#ffffff');
  });

  it('keeps transparency, drops an alpha that is fully opaque', () => {
    expect(parseHexColor('e1e1e180')).toBe('#e1e1e180');
    expect(parseHexColor('#abc8')).toBe('#aabbcc88');
    expect(parseHexColor('e1e1e1ff')).toBe('#e1e1e1');
  });

  it('rejects anything that is not a colour code', () => {
    for (const bad of ['', '#', 'e1e1e', 'e1e1e1e', 'ggg', 'red', '#12345', 'rgb(1,2,3)']) expect(parseHexColor(bad)).toBeNull();
  });
});
