import { describe, expect, it } from 'vitest';
import { fileNameFor, fileNameFromTitle } from '../persistence/fileService';

describe('file names from the document title', () => {
  it('turns the title into a hyphenated file name', () => {
    expect(fileNameFromTitle('Design Social Media | Feed Generation')).toBe('Design-Social-Media-Feed-Generation');
    expect(fileNameFromTitle('  Q3 plan: v2 / final?  ')).toBe('Q3-plan-v2-final');
    expect(fileNameFromTitle('Already-hyphenated -- title')).toBe('Already-hyphenated-title');
    expect(fileNameFromTitle('Café réunion')).toBe('Café-réunion');
  });

  it('uses the title on any canvas, and falls back to "drawing" without a usable one', () => {
    expect(fileNameFromTitle(undefined)).toBe('drawing');
    expect(fileNameFromTitle('   ')).toBe('drawing');
    expect(fileNameFromTitle('|||')).toBe('drawing');
    expect(fileNameFor({ size: 'infinite', orientation: 'portrait', marginMm: 10, title: 'Whiteboard notes' })).toBe('Whiteboard-notes');
    expect(fileNameFor({ size: 'infinite', orientation: 'portrait', marginMm: 10 })).toBe('drawing');
    expect(fileNameFor({ size: 'A4', orientation: 'portrait', marginMm: 10, title: 'Team handbook' })).toBe('Team-handbook');
    expect(fileNameFor({ size: 'A4', orientation: 'portrait', marginMm: 10 })).toBe('drawing');
  });
});
