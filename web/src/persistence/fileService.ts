import { FILE_EXTENSION, MIME_TYPE } from '../core/constants';
import type { SceneData } from '../core/types';
import { EXCALIDRAW_EXTENSION, EXCALIDRAW_MIME, toExcalidraw } from './excalidraw';
import { type ImportedScene, parseAnyScene, SCENE_FILE_ACCEPT } from './importScene';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function saveSceneToFile(data: SceneData, name = 'drawing'): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: MIME_TYPE });
  downloadBlob(blob, `${name}${FILE_EXTENSION}`);
}

/** Saves an .excalidraw file that opens in excalidraw.com (and back in SketchBoard). */
export function saveExcalidrawFile(data: SceneData, name = 'drawing'): void {
  const ex = toExcalidraw(data.elements, data.files ?? {}, { gridEnabled: data.appState?.gridEnabled });
  downloadBlob(new Blob([JSON.stringify(ex, null, 2)], { type: EXCALIDRAW_MIME }), `${name}${EXCALIDRAW_EXTENSION}`);
}

/** Opens a .sketchboard or .excalidraw file chosen by the user. */
export function openSceneFile(): Promise<(ImportedScene & { name: string }) | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = SCENE_FILE_ACCEPT;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve({ ...parseAnyScene(await file.text()), name: file.name });
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
