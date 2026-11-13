/**
 * Small, dependency-free syntax highlighter for code blocks.
 * One generic scanner driven by per-language definitions (keywords, comments, strings…) — good
 * enough for diagrams and slides, and it handles multi-line comments/strings across lines.
 */
export type TokenType =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'function'
  | 'type'
  | 'literal'
  | 'property'
  | 'tag'
  | 'attr'
  | 'punct';

export interface Token {
  text: string;
  type: TokenType;
}

interface LangDef {
  label: string;
  keywords?: string;
  literals?: string;
  types?: string;
  lineComment?: string[];
  blockComment?: Array<[string, string]>;
  /** String delimiters; multi-char ones (""" ''') are tried first. Backtick strings may span lines. */
  strings?: string[];
  caseInsensitive?: boolean;
  /** Capitalised identifiers are types (C-like languages). */
  capitalTypes?: boolean;
  /** `$name` variables (shell, PHP). */
  dollarVars?: boolean;
  /** `@decorator` / annotations. */
  decorators?: boolean;
  /** `key:` before a colon is a property (JSON, YAML, CSS). */
  colonKeys?: boolean;
  markup?: boolean;
}

const C_COMMENTS = { lineComment: ['//'], blockComment: [['/*', '*/']] as Array<[string, string]> };

const LANGS: Record<string, LangDef> = {
  plain: { label: 'Plain text' },
  javascript: {
    label: 'JavaScript',
    ...C_COMMENTS,
    keywords:
      'async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield',
    literals: 'true false null undefined NaN Infinity',
    strings: ['`', '"', "'"],
    capitalTypes: true,
    decorators: true,
  },
  typescript: {
    label: 'TypeScript',
    ...C_COMMENTS,
    keywords:
      'abstract as async await break case catch class const continue declare default delete do else enum export extends finally for from function get if implements import in infer instanceof interface keyof let namespace new of private protected public readonly return satisfies set static super switch this throw try type typeof var void while yield',
    literals: 'true false null undefined NaN Infinity',
    types: 'string number boolean any unknown never object void bigint symbol',
    strings: ['`', '"', "'"],
    capitalTypes: true,
    decorators: true,
  },
  python: {
    label: 'Python',
    lineComment: ['#'],
    keywords:
      'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case',
    literals: 'True False None self cls',
    types: 'int float str bool list dict set tuple bytes object',
    strings: ['"""', "'''", '"', "'"],
    capitalTypes: true,
    decorators: true,
  },
  java: {
    label: 'Java',
    ...C_COMMENTS,
    keywords:
      'abstract assert break case catch class continue default do else enum extends final finally for if implements import instanceof interface native new package private protected public return static super switch synchronized this throw throws transient try var void volatile while record sealed permits yield',
    literals: 'true false null',
    types: 'int long short byte char boolean float double',
    strings: ['"""', '"', "'"],
    capitalTypes: true,
    decorators: true,
  },
  csharp: {
    label: 'C#',
    ...C_COMMENTS,
    keywords:
      'abstract as async await base break case catch class const continue default delegate do else enum event explicit extern finally fixed for foreach get if implicit in interface internal is lock namespace new operator out override params private protected public readonly record ref return sealed set sizeof static struct switch this throw try typeof using var virtual void volatile while yield',
    literals: 'true false null',
    types: 'int long short byte char bool float double decimal string object dynamic',
    strings: ['"', "'"],
    capitalTypes: true,
    decorators: false,
  },
  cpp: {
    label: 'C / C++',
    ...C_COMMENTS,
    keywords:
      'auto break case catch class const constexpr continue default delete do else enum explicit extern for friend goto if inline namespace new noexcept operator private protected public return sizeof static struct switch template this throw try typedef typename union using virtual void volatile while #include #define #ifndef #ifdef #endif #pragma',
    literals: 'true false nullptr NULL',
    types: 'int long short char bool float double unsigned signed size_t std string vector',
    strings: ['"', "'"],
    capitalTypes: true,
  },
  go: {
    label: 'Go',
    ...C_COMMENTS,
    keywords: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
    literals: 'true false nil iota',
    types: 'int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 string bool byte rune error any',
    strings: ['`', '"', "'"],
    capitalTypes: true,
  },
  rust: {
    label: 'Rust',
    ...C_COMMENTS,
    keywords: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while',
    literals: 'true false None Some Ok Err',
    types: 'i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box',
    strings: ['"', "'"],
    capitalTypes: true,
  },
  kotlin: {
    label: 'Kotlin',
    ...C_COMMENTS,
    keywords: 'as break class companion continue data do else enum for fun if import in interface is object open override package private protected public return sealed suspend this throw try typealias val var when while',
    literals: 'true false null',
    strings: ['"""', '"', "'"],
    capitalTypes: true,
    decorators: true,
  },
  php: {
    label: 'PHP',
    lineComment: ['//', '#'],
    blockComment: [['/*', '*/']],
    keywords: 'abstract and array as break case catch class clone const continue declare default do echo else elseif extends final finally fn for foreach function global if implements include interface namespace new or private protected public require return static switch throw trait try use var while yield',
    literals: 'true false null TRUE FALSE NULL',
    strings: ['"', "'"],
    dollarVars: true,
    capitalTypes: true,
  },
  ruby: {
    label: 'Ruby',
    lineComment: ['#'],
    keywords: 'alias and begin break case class def defined? do else elsif end ensure for if in module next not or redo rescue retry return self super then unless until when while yield attr_accessor require',
    literals: 'true false nil',
    strings: ['"', "'"],
    capitalTypes: true,
  },
  sql: {
    label: 'SQL',
    lineComment: ['--'],
    blockComment: [['/*', '*/']],
    keywords:
      'select from where and or not insert into values update set delete create table alter drop index view primary key foreign references join inner left right outer full on group by order having limit offset as distinct union all exists in is like between case when then else end begin commit rollback transaction with returning default unique check constraint cascade asc desc count sum avg min max',
    literals: 'null true false',
    types: 'int integer bigint smallint serial varchar char text boolean date timestamp timestamptz decimal numeric float real uuid json jsonb',
    strings: ["'", '"'],
    caseInsensitive: true,
  },
  json: { label: 'JSON', literals: 'true false null', strings: ['"'], colonKeys: true },
  yaml: { label: 'YAML', lineComment: ['#'], literals: 'true false null yes no on off', strings: ['"', "'"], colonKeys: true },
  html: { label: 'HTML / XML', markup: true },
  css: {
    label: 'CSS',
    blockComment: [['/*', '*/']],
    keywords: '@media @import @keyframes @font-face @supports !important',
    strings: ['"', "'"],
    colonKeys: true,
  },
  bash: {
    label: 'Shell / Bash',
    lineComment: ['#'],
    keywords: 'if then else elif fi for while until do done case esac function in return export local readonly echo cd exit sudo source set unset shift',
    strings: ['"', "'"],
    dollarVars: true,
  },
};

export const CODE_LANGUAGES = Object.entries(LANGS).map(([id, d]) => ({ id, label: d.label }));
export const isCodeLanguage = (id: unknown): id is string => typeof id === 'string' && id in LANGS;
export const languageLabel = (id: string) => LANGS[id]?.label ?? 'Plain text';

const wordSet = (s: string | undefined, ci: boolean) => new Set((s ?? '').split(/\s+/).filter(Boolean).map((w) => (ci ? w.toLowerCase() : w)));
const compiled = new Map<string, { kw: Set<string>; lit: Set<string>; ty: Set<string> }>();
function sets(lang: string, d: LangDef) {
  let c = compiled.get(lang);
  if (!c) {
    const ci = !!d.caseInsensitive;
    c = { kw: wordSet(d.keywords, ci), lit: wordSet(d.literals, ci), ty: wordSet(d.types, ci) };
    compiled.set(lang, c);
  }
  return c;
}

const IDENT_CSS = /[A-Za-z_@-][\w-]*/y;
const IDENT_CPP = /[A-Za-z_#][\w]*/y;
const IDENT_RUBY = /[A-Za-z_][\w]*[?!]?/y;
const IDENT_PLAIN = /[A-Za-z_$][\w$]*/y;
const NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)[a-zA-Z%]*/y;

/** Splits code into lines of highlighted tokens. */
export function highlight(code: string, lang: string): Token[][] {
  const d = LANGS[lang] ?? LANGS.plain;
  const tokens: Token[] = d.markup ? scanMarkup(code) : scanCode(code, lang, d);
  // split tokens on newlines into lines
  const lines: Token[][] = [[]];
  for (const t of tokens) {
    const parts = t.text.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ text: p, type: t.type });
    });
  }
  return lines;
}

function scanCode(src: string, lang: string, d: LangDef): Token[] {
  const out: Token[] = [];
  const { kw, lit, ty } = sets(lang, d);
  const ci = !!d.caseInsensitive;
  const push = (text: string, type: TokenType) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ text, type });
  };
  const strings = [...(d.strings ?? [])].sort((a, b) => b.length - a.length);
  let i = 0;
  const n = src.length;
  const startsWith = (s: string) => src.startsWith(s, i);
  const prevChar = () => (i > 0 ? src[i - 1] : '');

  outer: while (i < n) {
    const ch = src[i];
    // block comments
    for (const [open, close] of d.blockComment ?? []) {
      if (startsWith(open)) {
        const end = src.indexOf(close, i + open.length);
        const stop = end < 0 ? n : end + close.length;
        push(src.slice(i, stop), 'comment');
        i = stop;
        continue outer;
      }
    }
    // line comments (not inside words, e.g. "a#b" in bash stays plain)
    for (const lc of d.lineComment ?? []) {
      if (startsWith(lc) && (lc !== '#' || !/[\w$]/.test(prevChar()))) {
        let end = src.indexOf('\n', i);
        if (end < 0) end = n;
        push(src.slice(i, end), 'comment');
        i = end;
        continue outer;
      }
    }
    // strings
    for (const q of strings) {
      if (startsWith(q)) {
        const multiline = q.length === 3 || q === '`';
        let j = i + q.length;
        while (j < n) {
          if (src[j] === '\\') {
            j += 2;
            continue;
          }
          if (src.startsWith(q, j)) {
            j += q.length;
            break;
          }
          if (src[j] === '\n' && !multiline) break;
          j++;
        }
        const text = src.slice(i, Math.min(j, n));
        i = Math.min(j, n);
        // "key": in JSON / YAML → property
        if (d.colonKeys && /^\s*:/.test(src.slice(i, i + 20))) push(text, 'property');
        else push(text, 'string');
        continue outer;
      }
    }
    // numbers (not glued to an identifier)
    if (/[\d.]/.test(ch) && !/[\w$]/.test(prevChar())) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(src);
      if (m && m[0] && /\d/.test(m[0])) {
        push(m[0], 'number');
        i += m[0].length;
        continue;
      }
    }
    // CSS hex colours
    if (lang === 'css' && ch === '#' && /[\da-fA-F]/.test(src[i + 1] ?? '')) {
      const m = /#[\da-fA-F]{3,8}/y;
      m.lastIndex = i;
      const r = m.exec(src);
      if (r) {
        push(r[0], 'number');
        i += r[0].length;
        continue;
      }
    }
    // $variables
    if (d.dollarVars && ch === '$') {
      const m = /\$(\{[^}\n]*\}|[\w]+|.)/y;
      m.lastIndex = i;
      const r = m.exec(src);
      if (r) {
        push(r[0], 'type');
        i += r[0].length;
        continue;
      }
    }
    // @decorators / annotations
    if (d.decorators && ch === '@' && /[A-Za-z_]/.test(src[i + 1] ?? '')) {
      IDENT_PLAIN.lastIndex = i + 1;
      const r = IDENT_PLAIN.exec(src);
      if (r) {
        push('@' + r[0], 'function');
        i += r[0].length + 1;
        continue;
      }
    }
    // identifiers / keywords
    if (/[A-Za-z_$#@-]/.test(ch)) {
      const re = lang === 'css' ? IDENT_CSS : lang === 'cpp' ? IDENT_CPP : lang === 'ruby' ? IDENT_RUBY : IDENT_PLAIN;
      re.lastIndex = i;
      const r = re.exec(src);
      if (r && r[0]) {
        const w = r[0];
        const key = ci ? w.toLowerCase() : w;
        const after = src.slice(i + w.length).match(/^\s*(.)/)?.[1];
        let type: TokenType = 'plain';
        if (kw.has(key)) type = 'keyword';
        else if (lit.has(key)) type = 'literal';
        else if (ty.has(key)) type = 'type';
        else if (d.colonKeys && after === ':' && lang !== 'json') type = 'property';
        else if (after === '(') type = 'function';
        else if (d.capitalTypes && /^[A-Z][a-z0-9]/.test(w)) type = 'type';
        push(w, type);
        i += w.length;
        continue;
      }
    }
    push(ch, /\s/.test(ch) ? 'plain' : /[A-Za-z0-9]/.test(ch) ? 'plain' : 'punct');
    i++;
  }
  return out;
}

function scanMarkup(src: string): Token[] {
  const out: Token[] = [];
  const push = (text: string, type: TokenType) => text && out.push({ text, type });
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i);
      const stop = end < 0 ? src.length : end + 3;
      push(src.slice(i, stop), 'comment');
      i = stop;
      continue;
    }
    if (src[i] === '<' && /[A-Za-z/!?]/.test(src[i + 1] ?? '')) {
      const m = /<\/?[!?]?[\w:.-]*/y;
      m.lastIndex = i;
      const tag = m.exec(src)![0];
      push(tag.match(/^<\/?[!?]?/)![0], 'punct');
      push(tag.replace(/^<\/?[!?]?/, ''), 'tag');
      i += tag.length;
      // attributes until '>'
      while (i < src.length && src[i] !== '>') {
        const c = src[i];
        if (c === '"' || c === "'") {
          const end = src.indexOf(c, i + 1);
          const stop = end < 0 ? src.length : end + 1;
          push(src.slice(i, stop), 'string');
          i = stop;
        } else if (/[\w:@.-]/.test(c)) {
          const a = /[\w:@.-]+/y;
          a.lastIndex = i;
          const name = a.exec(src)![0];
          push(name, 'attr');
          i += name.length;
        } else {
          push(c, /\s/.test(c) ? 'plain' : 'punct');
          i++;
        }
      }
      if (src[i] === '>') {
        push('>', 'punct');
        i++;
      }
      continue;
    }
    const next = src.indexOf('<', i + 1);
    const stop = next < 0 ? src.length : next;
    push(src.slice(i, stop), 'plain');
    i = stop;
  }
  return out;
}
