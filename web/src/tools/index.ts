import type { ToolType } from '../core/types';
import { EraserTool, FigureTool, HandTool, InkTool, LaserTool, LinearTool, ShapeTool, TableTool, TextTool } from './creationTools';
import { PrecisionEraserTool } from './PrecisionEraserTool';
import { SelectionTool } from './SelectionTool';
import type { Tool, ToolContext } from './Tool';

/** Factory wiring every tool to the editor context. Register new tools here. */
export function createTools(ctx: ToolContext): Map<ToolType, Tool> {
  const tools: Tool[] = [
    new SelectionTool(ctx),
    new HandTool(ctx),
    new ShapeTool(ctx, 'rectangle'),
    new ShapeTool(ctx, 'diamond'),
    new ShapeTool(ctx, 'ellipse'),
    new LinearTool(ctx, 'arrow'),
    new LinearTool(ctx, 'line'),
    new InkTool(ctx, 'freedraw'),
    new InkTool(ctx, 'highlighter'),
    new LaserTool(ctx),
    new TextTool(ctx),
    new TableTool(ctx),
    new EraserTool(ctx),
    new PrecisionEraserTool(ctx),
    new FigureTool(ctx),
  ];
  return new Map(tools.map((t) => [t.type, t]));
}

export type { Tool, ToolContext, PointerInfo } from './Tool';
