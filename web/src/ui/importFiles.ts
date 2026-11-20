import type { Point } from '../core/types';
import type { Editor } from '../editor/Editor';
import { isTableFileName, TABLE_FILE_ACCEPT } from '../elements/table/tableIO';
import type { LibraryStore } from '../library/LibraryStore';
import { isLibraryFileName, LIBRARY_FILE_ACCEPT } from '../library/libraryFormat';
import { describeImport, isSceneFile, parseAnyScene, SCENE_FILE_ACCEPT } from '../persistence/importScene';

/** Every kind of file SketchBoard can take in (for one "choose a file" button). */
export const ANY_IMPORT_ACCEPT = [SCENE_FILE_ACCEPT, TABLE_FILE_ACCEPT, LIBRARY_FILE_ACCEPT, 'image/*'].join(',');

/**
 * Takes in files dropped on the board or chosen in the Open dialog, by kind:
 * a library (.sketchboardlib / .excalidrawlib) → your library; a table (.csv / .tsv / .md) → a table;
 * a drawing (.sketchboard / .excalidraw) → opened; pictures → inserted. Returns false if nothing fit.
 */
export async function importFiles(editor: Editor, library: LibraryStore, files: readonly File[], at?: Point): Promise<boolean> {
  const libFile = files.find((f) => isLibraryFileName(f.name));
  if (libFile) {
    try {
      const n = library.importLibrary(await libFile.text());
      editor.toast(n ? `Added ${n} item${n === 1 ? '' : 's'} from ${libFile.name} to your library` : 'Those items are already in your library');
      editor.setState((s) => ({ sidebar: { ...s.sidebar, open: true, tab: 'library' } }));
    } catch (err) {
      editor.toast(`Could not import ${libFile.name}: ${(err as Error).message}`);
    }
    return true;
  }
  const tableFile = files.find((f) => isTableFileName(f.name));
  if (tableFile) return editor.importTableFile(tableFile, at);
  const scene = files.find(isSceneFile);
  if (scene) {
    try {
      const opened = parseAnyScene(await scene.text());
      editor.loadScene(opened.scene);
      editor.zoomToFit();
      editor.toast(describeImport(scene.name, opened));
    } catch (err) {
      editor.toast(`Could not open ${scene.name}: ${(err as Error).message}`);
    }
    return true;
  }
  if (files.some((f) => f.type.startsWith('image/'))) {
    await editor.insertImages(files, at);
    return true;
  }
  editor.toast(`SketchBoard can’t open ${files[0]?.name ?? 'that file'}`);
  return false;
}
