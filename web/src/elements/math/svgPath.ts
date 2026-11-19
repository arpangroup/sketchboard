/**
 * Moves and scales SVG path data ("M10 20 l5 5 …") by x' = x·sx + tx, y' = y·sy + ty, so a path
 * drawn in its own viewBox can be stored in the formula's coordinates. Relative commands only scale.
 */
export function transformPath(d: string, sx: number, sy: number, tx: number, ty: number): string {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: string[] = [];
  const r = (v: number) => String(Math.round(v * 1000) / 1000);
  let i = 0;
  let cmd = '';
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i++];
      out.push(cmd);
      if (cmd === 'z' || cmd === 'Z') continue;
    } else if (!cmd) {
      i++; // stray number
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const X = (v: number) => r(rel ? v * sx : v * sx + tx);
    const Y = (v: number) => r(rel ? v * sy : v * sy + ty);
    // one set of arguments; numbers that follow repeat the command
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
      case 'T':
        out.push(X(num()), Y(num()));
        break;
      case 'H':
        out.push(X(num()));
        break;
      case 'V':
        out.push(Y(num()));
        break;
      case 'C':
        out.push(X(num()), Y(num()), X(num()), Y(num()), X(num()), Y(num()));
        break;
      case 'S':
      case 'Q':
        out.push(X(num()), Y(num()), X(num()), Y(num()));
        break;
      case 'A': {
        const rx = num();
        const ry = num();
        out.push(r(Math.abs(rx * sx)), r(Math.abs(ry * sy)), r(num()), r(num()), r(num()), X(num()), Y(num()));
        break;
      }
      case 'Z':
        break;
      default:
        i++;
    }
    if (tokens[i] !== undefined && !/[a-zA-Z]/.test(tokens[i]) && (cmd === 'M' || cmd === 'm')) {
      // numbers after a moveto are line-tos
      cmd = cmd === 'M' ? 'L' : 'l';
      out.push(cmd);
    } else if (tokens[i] !== undefined && !/[a-zA-Z]/.test(tokens[i])) {
      out.push(cmd);
    }
  }
  return out.join(' ').replace(/ (?=[a-zA-Z])/g, '').replace(/([a-zA-Z]) /g, '$1');
}
