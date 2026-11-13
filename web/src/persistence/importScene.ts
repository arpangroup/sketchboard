import type { SceneData } from '../core/types';
import { fromExcalidraw, isExcalidrawData } from './excalidraw';
import { parseScene } from './serialization';

export type SceneFormat = 'sketchboard' | 'excalidraw';

export interface ImportedScene {
  scene: SceneData;
  format: SceneFormat;
  /** Anything that couldn't be carried over exactly (shown to the user). */
  notes: string[];
}

/** File extensions the Open dialog, drag & drop and the installed app accept as drawings. */
export const SCENE_FILE_ACCEPT = '.sketchboard,.excalidraw,.json,application/json,application/vnd.excalidraw+json';

export const isSceneFile = (f: Pick<File, 'name' | 'type'>) =>
  /\.(sketchboard|excalidraw|json)$/i.test(f.name) || /json/.test(f.type);

/**
 * Single entry point for every drawing that comes from outside (file, drop, launch queue):
 * detects the format, converts foreign formats and validates the result.
 */
export function parseAnyScene(raw: unknown): ImportedScene {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('This file is not a drawing (invalid JSON)');
    }
  }
  if (isExcalidrawData(data)) {
    const { scene, notes } = fromExcalidraw(data);
    return { scene: parseScene(scene), format: 'excalidraw', notes };
  }
  return { scene: parseScene(data), format: 'sketchboard', notes: [] };
}

/** Toast text after opening a file. */
export function describeImport(name: string, r: ImportedScene): string {
  const what = r.format === 'excalidraw' ? `Imported Excalidraw drawing ${name}` : `Opened ${name}`;
  return r.notes.length ? `${what} — ${r.notes.join('; ')}` : what;
}
