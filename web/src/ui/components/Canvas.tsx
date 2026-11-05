import { useEffect, useRef } from 'react';
import { useEditor } from '../EditorContext';

/** Thin React shell around the imperative canvas engine. */
export function Canvas() {
  const { editor } = useEditor();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    editor.attachCanvas(canvas);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      editor.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const onWheel = (e: WheelEvent) => editor.handleWheel(e);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const onContext = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', onContext);

    return () => {
      ro.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      editor.detachCanvas();
    };
  }, [editor]);

  return (
    <canvas
      ref={ref}
      className="sb-canvas"
      onPointerDown={(e) => {
        // An unpinned sidebar behaves like a popover: drawing on the canvas dismisses it.
        const sb = editor.getState().sidebar;
        if (sb.open && !sb.pinned) editor.setState({ sidebar: { ...sb, open: false } });
        editor.handlePointerDown(e.nativeEvent);
      }}
      onPointerMove={(e) => editor.handlePointerMove(e.nativeEvent)}
      onPointerUp={(e) => editor.handlePointerUp(e.nativeEvent)}
      onPointerCancel={(e) => editor.handlePointerUp(e.nativeEvent)}
      onLostPointerCapture={(e) => editor.handleLostCapture(e.nativeEvent)}
      onDoubleClick={(e) => editor.handleDoubleClick(e.nativeEvent)}
    />
  );
}
