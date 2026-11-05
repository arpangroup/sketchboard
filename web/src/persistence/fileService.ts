import { FILE_EXTENSION, MIME_TYPE } from '../core/constants';
import type { SceneData } from '../core/types';
import { parseScene } from './serialization';

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

export function openSceneFile(): Promise<SceneData | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${FILE_EXTENSION},.json,application/json`;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(parseScene(await file.text()));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
