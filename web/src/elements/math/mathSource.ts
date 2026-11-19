/**
 * Reading LaTeX the way people paste it: from Markdown ("$$ … $$" blocks, maybe inside a ``` fence),
 * from papers ("\[ … \]", "\begin{equation} … \end{equation}") or just a bare formula.
 * Pure string handling, no rendering.
 */

/** Strips a surrounding Markdown code fence (```latex … ```), if there is one. */
function unfence(src: string): string {
  const m = src.trim().match(/^```[\w-]*\s*\n([\s\S]*?)\n?```\s*$/);
  return m ? m[1] : src;
}

/** Environments that already are display maths and are handed to KaTeX whole. */
const ENVIRONMENTS = 'equation|align|gather|multline|eqnarray|alignat|flalign|split|cases|matrix|pmatrix|bmatrix';

/**
 * The equations in `src`, each one display-mode LaTeX for KaTeX:
 *  - every "$$ … $$", "\[ … \]" and "\begin{equation} … \end{equation}" block, in order;
 *  - with none of those: "$ … $" / "\( … \)" around the whole text, or else the whole text as one formula.
 * Text between blocks (prose around the formulae) is left out.
 */
export function mathBlocks(src: string): string[] {
  const text = unfence(src.replace(/\r\n?/g, '\n'));
  const re = new RegExp(
    String.raw`\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|(\\begin\{(${ENVIRONMENTS})(\*?)\}[\s\S]*?\\end\{\4\5\})`,
    'g',
  );
  const blocks: string[] = [];
  for (const m of text.matchAll(re)) {
    const body = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (body) blocks.push(unwrapEquation(body));
  }
  if (blocks.length) return blocks;
  const whole = text.trim();
  const inline = whole.match(/^\$([^$][\s\S]*?)\$$/) ?? whole.match(/^\\\(([\s\S]*?)\\\)$/);
  const body = (inline ? inline[1] : whole).trim();
  return body ? [unwrapEquation(body)] : [];
}

/** KaTeX has no numbered "equation" environment: show its contents (aligned if it uses "&"). */
function unwrapEquation(body: string): string {
  const m = body.match(/^\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}$/);
  if (!m) return body;
  const inner = m[1].trim();
  return /&|\\\\/.test(inner) ? `\\begin{aligned}${inner}\\end{aligned}` : inner;
}

/** Commands that only appear in maths — enough to treat pasted text as a formula. */
const MATH_COMMANDS =
  /\\(frac|dfrac|tfrac|sqrt|sum|prod|int|oint|lim|left|right|alpha|beta|gamma|delta|theta|lambda|mu|sigma|pi|omega|infty|partial|nabla|cdot|times|leq|geq|neq|approx|mathbb|mathbf|mathrm|binom|ln|log|sin|cos|tan|exp)\b/;

/**
 * Whether pasted text is maths to render rather than words to show: "$$ … $$" / "\[ … \]" blocks,
 * a maths environment, a whole "$ … $", or a short formula made of LaTeX commands with no sentences.
 */
export function looksLikeLatex(text: string): boolean {
  const t = unfence(text).trim();
  if (!t || t.length > 20_000) return false;
  if (/\$\$[\s\S]+?\$\$/.test(t) || /\\\[[\s\S]+?\\\]/.test(t)) return true;
  if (new RegExp(String.raw`\\begin\{(${ENVIRONMENTS})\*?\}`).test(t)) return true;
  if (/^\$[^$\n][^$]*\$$/.test(t) && MATH_COMMANDS.test(t)) return true;
  // a bare formula: maths commands, few plain words
  const words = t.replace(/\\[a-zA-Z]+|\{[^}]*\}/g, ' ').match(/[a-zA-Z]{4,}/g) ?? [];
  return MATH_COMMANDS.test(t) && words.length <= 2 && !/[.!?]\s+[A-Z]/.test(t);
}

/** Source to start editing with: what the user wrote, else a sample. */
export const SAMPLE_LATEX = String.raw`$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$`;
