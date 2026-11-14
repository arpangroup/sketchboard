import type { HeaderFooterText, PageSection, PageSetup } from '../core/types';
import { generateId } from '../core/utils';
import { MAX_PAGES } from './pageLayout';

const EMPTY: HeaderFooterText = { left: '', center: '', right: '' };

/**
 * Pure edits of PageSetup.sections (the UI and tests go through these).
 * A new section starts with a copy of the document's default footer, ready to change,
 * and keeps the default header until it is given its own.
 */
export function addSection(setup: PageSetup, startPage: number): { setup: PageSetup; section: PageSection } {
  const taken = new Set((setup.sections ?? []).map((s) => s.startPage));
  let start = Math.max(1, Math.min(MAX_PAGES, Math.round(startPage)));
  while (taken.has(start) && start < MAX_PAGES) start++;
  const n = (setup.sections?.length ?? 0) + 1;
  const section: PageSection = {
    id: generateId(),
    startPage: start,
    title: `Section ${n}`,
    footer: { ...EMPTY, ...setup.footer },
  };
  return { setup: { ...setup, sections: sortSections([...(setup.sections ?? []), section]) }, section };
}

export function updateSection(setup: PageSetup, id: string, patch: Partial<PageSection>): PageSetup {
  const next = (setup.sections ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s));
  return { ...setup, sections: sortSections(next) };
}

export function removeSection(setup: PageSetup, id: string): PageSetup {
  const next = (setup.sections ?? []).filter((s) => s.id !== id);
  return { ...setup, sections: next.length ? next : undefined };
}

/** Give a section its own header/footer (starting from the default) or link it back to the default. */
export function setOwnArea(setup: PageSetup, id: string, area: 'header' | 'footer', own: boolean): PageSetup {
  return updateSection(setup, id, { [area]: own ? { ...EMPTY, ...setup[area] } : undefined });
}

const sortSections = (list: PageSection[]) => [...list].sort((a, b) => a.startPage - b.startPage);
