# Arrow binding (connectors)

Arrows and lines can be **attached to shapes**. When an end is attached, moving, resizing,
rotating or flipping the shape drags that end along, so diagrams stay connected without
re-drawing arrows. Other tools call this *connectors*, *sticky arrows* or *glue*; Excalidraw
calls it *arrow binding*, and SketchBoard's files are compatible with it.

```
 ┌────────┐            ╭──────╮                    ┌────────┐
 │ Client │──────────▶ │ API  │     move "API" →   │ Client │──╮
 └────────┘            ╰──────╯                    └────────┘  │
                                                               ╰──▶ ╭──────╮
                                                                    │ API  │
                                                                    ╰──────╯
```

## Using it

| You want to… | Do this |
|---|---|
| Connect two shapes | Pick the arrow (`A`) or line (`L`) tool and drag from one shape to another. The shape under the pointer gets a blue outline: that's what the end will attach to. |
| Aim at the middle of a shape | Start or finish the arrow **well inside** the shape. The end then always points at the shape's centre and slides around its edge as things move, taking the shortest way. |
| Pin an end to one spot | Finish the arrow **on or near the edge** (within about 12 px on screen). The end stays on that spot of the shape: for example, the right-hand middle. |
| Re-attach or detach an end | Select the arrow and drag its end onto another shape, or into empty space to free it. |
| Draw without attaching | Hold **Ctrl** (⌘ on Mac) while you draw or drag an end. |
| Move an arrow on its own | Drag the arrow. Ends that land on a shape attach to it; ends left in empty space come free. |
| Move shapes and arrows together | Select them together (box-select or Shift+click) and drag: everything moves as one. |

Arrows can attach to rectangles, diamonds, ellipses, gallery shapes (stars, callouts, flowchart
symbols…), images, text, tables and code blocks. They don't attach to lines, ink, frames or to
the text inside a shape (they attach to the shape itself).

Bends and curves are kept: if you curved an arrow by dragging its middle dot, only its two
ends follow the shapes, and the bends in between stay where you put them.

## How it works

### What is stored

Each arrow / line end may carry a binding (`web/src/core/types.ts`):

```ts
interface ArrowBinding {
  elementId: string;   // the shape this end is attached to
  anchor: Point;       // where on that shape, as fractions of its own (unrotated) box
}

interface LinearElement {
  // …points, arrowheads…
  startBinding?: ArrowBinding;
  endBinding?: ArrowBinding;
}
```

The anchor is **relative to the shape's box**: `{x: 0.5, y: 0.5}` is the centre and
`{x: 1, y: 0.5}` the middle of the right edge. Because it's relative, it survives the shape
moving, resizing and turning. The shape itself stores nothing; arrows point at shapes, never
the other way round, so a shape can have any number of arrows without its own data changing.

### Attaching an end

When you release the pointer (`LinearTool` / `SelectionTool` → `Editor.bindArrow`):

1. Find the topmost shape whose outline contains the end, with a 12 px (screen) tolerance:
   `bindableAt` in `web/src/elements/binding.ts`.
2. Work out the anchor with `anchorFor`. If the end is in the inner area of the shape
   (more than 22 % in from every edge), the anchor is the centre. Otherwise it's the exact spot,
   clamped to the box.
3. Snap the end onto the outline, as below.

### Keeping it attached

`Editor` listens to every local scene change. When any element changes, it looks for arrows
bound to it (`arrowsBoundTo`) and recomputes their bound ends (`boundArrowGeometry`):

```
target   = anchorPoint(shape, anchor)       // anchor → world point (rotation included)
from     = the other end (straight arrow) or the nearest bend (curved / elbow arrow)
end      = edgePoint(shape, from, target)   // walk from → target until we hit the outline,
                                            // then step back BIND_GAP (4 px)
```

`edgePoint` uses a binary search along the segment with an exact inside-test per shape kind:
a box for rectangles, `x² + y² ≤ 1` for ellipses and `|x| + |y| ≤ 1` for diamonds, all in the
shape's own turned frame. If the arrow starts inside the shape (overlapping shapes), there's no
outline to stop at, so it goes to the anchor itself.

The arrow updates happen **in the same change** as the shape's, so they share one undo step,
autosave and collaboration message. Undo puts both back together. During collaboration, the
person who moved the shape sends the arrow's new position too; other people's apps don't need
to recompute anything.

### When things are copied, deleted or imported

| Situation | Behaviour |
|---|---|
| Shape deleted | The arrow keeps its binding but stops following. Undo the delete and it's attached again. |
| Shape and arrow duplicated / copied together | The copy attaches to the copied shape (`remapCopies`). |
| Arrow copied on its own | Its copy is free (no binding to the original shape). |
| Excalidraw export | Written as Excalidraw's `startBinding` / `endBinding` plus the shape's `boundElements`; a pinned spot is written as `fixedPoint`. Shapes Excalidraw doesn't have natively (tables, code, gallery shapes) are exported free. |
| Excalidraw import | Bindings to shapes that came across are kept; `fixedPoint` becomes a pinned anchor, anything else aims at the centre. |

## Code map

| File | What's there |
|---|---|
| `web/src/elements/binding.ts` | Pure geometry: `canBindTo`, `bindableAt`, `anchorFor`, `anchorPoint`, `insideShape`, `edgePoint`, `boundArrowGeometry`, `arrowsBoundTo` |
| `web/src/editor/Editor.ts` | `syncArrows` (scene-change hook), `bindArrow`, `rebindMoved`, the blue target outline (`drawBindingHint`) |
| `web/src/tools/creationTools.ts` | `LinearTool`: target highlight while drawing, attaches both ends on release |
| `web/src/tools/SelectionTool.ts` | Dragging an end frees it, then re-attaches it on release; moving arrows re-checks their free ends |
| `web/src/elements/structure.ts` | `remapCopies` keeps copies attached to copied shapes |
| `web/src/persistence/excalidraw.ts` | Excalidraw `startBinding` / `endBinding` / `boundElements` mapping |
| `web/src/__tests__/binding.test.ts` | Tests: following a moved shape, anchors, outlines of each shape kind, deleted shapes, copies, Excalidraw round-trip |

## Design choices

- **Anchors instead of "focus + gap".** Excalidraw stores a focus value that describes the
  arrow's angle relative to the shape. A box-relative anchor is simpler to reason about, easy to
  pin (any spot on the edge) and stays stable when a shape is resized or rotated.
- **Recompute on change, not on render.** Bound ends are written to the arrow when a shape
  changes, so export, print, collaboration and files always see the real geometry. They never
  depend on a renderer that knows about bindings.
- **One-way links.** Only arrows store bindings, so moving a shape never rewrites the shape for
  every arrow attached to it, and two people editing different arrows on the same shape don't
  conflict.
