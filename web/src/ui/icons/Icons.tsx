import type { ReactNode, SVGProps } from 'react';

/** Hand-tuned 24px stroke icons, slightly irregular to match the sketchy aesthetic. */
const Svg = ({ children, ...p }: SVGProps<SVGSVGElement> & { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...p}
  >
    {children}
  </svg>
);

export const Icons = {
  selection: () => (
    <Svg>
      <path d="M5 3.5l13.2 7.6-6 1.4-2.9 5.8z" />
    </Svg>
  ),
  hand: () => (
    <Svg>
      <path d="M8 13V5.5a1.5 1.5 0 013 0V12m0-1V4a1.5 1.5 0 013 0v7m0-.5V6a1.5 1.5 0 013 0v8c0 4-2.5 7-6.5 7-3 0-4.3-1.3-6-4l-2.3-3.7a1.5 1.5 0 012.5-1.6L8 13" />
    </Svg>
  ),
  rectangle: () => (
    <Svg>
      <path d="M4.2 5.1c5.3-.4 10.4-.3 15.6.1.4 4.6.3 9.2-.1 13.8-5.2.3-10.3.3-15.5-.1-.3-4.6-.3-9.2 0-13.8z" />
    </Svg>
  ),
  diamond: () => (
    <Svg>
      <path d="M12 3.2l8.7 8.9-8.8 8.7-8.6-8.8z" />
    </Svg>
  ),
  ellipse: () => (
    <Svg>
      <path d="M12 4.3c4.6-.1 8.4 3.4 8.3 7.8-.1 4.3-3.8 7.7-8.4 7.6-4.6 0-8.2-3.5-8.1-7.8.1-4.2 3.7-7.6 8.2-7.6z" />
    </Svg>
  ),
  arrow: () => (
    <Svg>
      <path d="M4.5 19.5L19 5M19 5l-7.2.6M19 5l-.4 7.2" />
    </Svg>
  ),
  line: () => (
    <Svg>
      <path d="M4.5 19.3C9.4 14.6 14.3 9.7 19.4 4.7" />
    </Svg>
  ),
  freedraw: () => (
    <Svg>
      <path d="M15.6 4.6l3.8 3.8L8.7 19.1l-4.6.8.8-4.6z" />
      <path d="M13.8 6.4l3.8 3.8" />
    </Svg>
  ),
  text: () => (
    <Svg>
      <path d="M5 6.2c4.6-.3 9.4-.3 14 0M12 6v13M9.2 19h5.6" />
    </Svg>
  ),
  eraser: () => (
    <Svg>
      <path d="M8.5 19.5h11M5.4 14.6l8.9-9.4a2 2 0 012.9 0l2.4 2.5a2 2 0 010 2.8l-8.2 8.7a2 2 0 01-1.5.6H8.3a2 2 0 01-1.4-.6l-1.5-1.6a2 2 0 010-3z" />
      <path d="M9.6 10.2l5.6 5.6" />
    </Svg>
  ),
  lock: () => (
    <Svg>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 018 0v2.5" />
    </Svg>
  ),
  unlock: () => (
    <Svg>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 017.6-1.7" />
    </Svg>
  ),
  menu: () => (
    <Svg>
      <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />
    </Svg>
  ),
  undo: () => (
    <Svg>
      <path d="M9 14L4.5 9.5 9 5" />
      <path d="M4.5 9.5H14a5.5 5.5 0 010 11h-3" />
    </Svg>
  ),
  redo: () => (
    <Svg>
      <path d="M15 14l4.5-4.5L15 5" />
      <path d="M19.5 9.5H10a5.5 5.5 0 000 11h3" />
    </Svg>
  ),
  plus: () => (
    <Svg>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  minus: () => (
    <Svg>
      <path d="M5 12h14" />
    </Svg>
  ),
  print: () => (
    <Svg>
      <path d="M7 9V3.5h10V9M7 17.5H5a2 2 0 01-2-2V11a2 2 0 012-2h14a2 2 0 012 2v4.5a2 2 0 01-2 2h-2" />
      <path d="M7 14h10v6.5H7z" />
    </Svg>
  ),
  share: () => (
    <Svg>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6M16 4.8a3.5 3.5 0 010 6.4M18.5 14.3c1.7.9 2.8 3 3 5.7" />
    </Svg>
  ),
  page: () => (
    <Svg>
      <path d="M6.5 3h7.5l4.5 4.5V21h-12z" />
      <path d="M14 3v4.5h4.5" />
    </Svg>
  ),
  close: () => (
    <Svg>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  trash: () => (
    <Svg>
      <path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </Svg>
  ),
  copy: () => (
    <Svg>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" />
    </Svg>
  ),
  front: () => (
    <Svg>
      <path d="M12 4v11M7.5 8.5L12 4l4.5 4.5M5 20h14" />
    </Svg>
  ),
  back: () => (
    <Svg>
      <path d="M12 20V9M7.5 15.5L12 20l4.5-4.5M5 4h14" />
    </Svg>
  ),
  download: () => (
    <Svg>
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14" />
    </Svg>
  ),
  folder: () => (
    <Svg>
      <path d="M3.5 6.5a2 2 0 012-2h4l2 2.5h7a2 2 0 012 2v9a2 2 0 01-2 2h-13a2 2 0 01-2-2z" />
    </Svg>
  ),
  image: () => (
    <Svg>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M20.5 16l-5-5-9 8.5" />
    </Svg>
  ),
  grid: () => (
    <Svg>
      <path d="M4 9h16M4 15h16M9 4v16M15 4v16" />
    </Svg>
  ),
  keyboard: () => (
    <Svg>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9" />
    </Svg>
  ),
  moon: () => (
    <Svg>
      <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
    </Svg>
  ),
  sun: () => (
    <Svg>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </Svg>
  ),
  highlighter: () => (
    <Svg>
      <path d="M15.5 4.5l4 4-8.5 8.5H7v-4z" />
      <path d="M7 17l-3 3h6M13.5 6.5l4 4" />
    </Svg>
  ),
  laser: () => (
    <Svg>
      <circle cx="17" cy="7" r="2.6" />
      <path d="M15 9L4.5 19.5" />
      <path d="M17 2.5v1.2M21.5 7h-1.2M20.2 3.8l-.9.9" />
    </Svg>
  ),
  more: () => (
    <Svg>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </Svg>
  ),
  shapes: () => (
    <Svg>
      <path d="M4 15c2-4 3.5-6 6-3s3 1 4.5-1" strokeDasharray="2 2.5" />
      <rect x="13.5" y="13" width="7" height="7" rx="1" />
      <circle cx="7" cy="6.5" r="3" />
    </Svg>
  ),
  stylus: () => (
    <Svg>
      <path d="M17.5 3.5l3 3L9 18l-4 1 1-4z" />
      <path d="M3 21h4" />
    </Svg>
  ),
  table: () => (
    <Svg>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10M15 9.5v10" />
    </Svg>
  ),
  pages: () => (
    <Svg>
      <rect x="4" y="3" width="9" height="12" rx="1.5" />
      <rect x="11" y="9" width="9" height="12" rx="1.5" />
    </Svg>
  ),
  chevronUp: () => (
    <Svg>
      <path d="M6 15l6-6 6 6" />
    </Svg>
  ),
  chevronDown: () => (
    <Svg>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  ),
  install: () => (
    <Svg>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M12 7v7M9 11.5l3 3 3-3M10.5 18.5h3" />
    </Svg>
  ),
  palette: () => (
    <Svg>
      <path d="M12 3.5a8.5 8.5 0 100 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.6-1.1-2.6 0-.9.7-1.5 1.7-1.5H17a3.5 3.5 0 003.5-3.5c0-4.2-3.8-7.7-8.5-7.7z" />
      <circle cx="7.8" cy="11" r="1" />
      <circle cx="10.5" cy="7.3" r="1" />
      <circle cx="15" cy="7.5" r="1" />
    </Svg>
  ),
  sidebar: () => (
    <Svg>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M14.5 4.5v15" />
    </Svg>
  ),
  search: () => (
    <Svg>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </Svg>
  ),
  library: () => (
    <Svg>
      <path d="M5 4.5v15M9.5 4.5v15M14 5.5l4.5 13.5" />
    </Svg>
  ),
  chat: () => (
    <Svg>
      <path d="M20 11.5c0 4-3.6 7-8 7-1.2 0-2.3-.2-3.3-.6L4 19.5l1.3-3.8C4.5 14.5 4 13 4 11.5c0-4 3.6-7 8-7s8 3 8 7z" />
    </Svg>
  ),
  presentation: () => (
    <Svg>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M12 16v4M8.5 20h7M10 8l4 2-4 2z" />
    </Svg>
  ),
  pin: () => (
    <Svg>
      <path d="M9 4h6l-1 6 3.5 3.5h-11L10 10z" />
      <path d="M12 13.5V20" />
    </Svg>
  ),
  pinOff: () => (
    <Svg>
      <path d="M9 4h6l-1 6 3.5 3.5h-11L10 10z" />
      <path d="M12 13.5V20M4 4l16 16" />
    </Svg>
  ),
  send: () => (
    <Svg>
      <path d="M4 12l16-7.5L13.5 20l-2-6.5z" />
    </Svg>
  ),
  fit: () => (
    <Svg>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </Svg>
  ),
  cloud: () => (
    <Svg>
      <path d="M7 18.5h10.5a4 4 0 00.6-7.95A6 6 0 006.3 9.2 4.7 4.7 0 007 18.5z" />
      <path d="M12 16v-5m-2.3 2.2L12 11l2.3 2.2" />
    </Svg>
  ),
  link: () => (
    <Svg>
      <path d="M10 14a4.2 4.2 0 006 .2l2.8-2.8a4.2 4.2 0 00-6-6L11.5 6.6" />
      <path d="M14 10a4.2 4.2 0 00-6-.2l-2.8 2.8a4.2 4.2 0 006 6l1.2-1.2" />
    </Svg>
  ),
  pencil: () => (
    <Svg>
      <path d="M4.5 19.5l1-4.2L15.8 5a1.9 1.9 0 012.7 0l.5.5a1.9 1.9 0 010 2.7L8.7 18.5z" />
      <path d="M13.8 7l3.2 3.2" />
    </Svg>
  ),
  external: () => (
    <Svg>
      <path d="M14 4.5h5.5V10M19.2 4.8L11 13" />
      <path d="M17 13.5v5a1.5 1.5 0 01-1.5 1.5h-10A1.5 1.5 0 014 18.5v-10A1.5 1.5 0 015.5 7h5" />
    </Svg>
  ),
  refresh: () => (
    <Svg>
      <path d="M19.5 12a7.5 7.5 0 11-2.2-5.3M19.5 4.5v4.2h-4.2" />
    </Svg>
  ),
  rotateCw: () => (
    <Svg>
      <path d="M19.5 12a7.5 7.5 0 11-2.2-5.3" />
      <path d="M19.8 4.5v4.3h-4.3" />
    </Svg>
  ),
  rotateCcw: () => (
    <Svg>
      <path d="M4.5 12a7.5 7.5 0 102.2-5.3" />
      <path d="M4.2 4.5v4.3h4.3" />
    </Svg>
  ),
  code: () => (
    <Svg>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 10l-2.5 2.5 2.5 2.5M14.5 10l2.5 2.5-2.5 2.5" />
    </Svg>
  ),
  precisionEraser: () => (
    <Svg>
      <path d="M14.5 4.5l5 5-7.3 7.3a2 2 0 01-2.8 0l-2.2-2.2a2 2 0 010-2.8z" />
      <circle cx="6" cy="18.5" r="2.2" />
      <path d="M11 20h9" strokeDasharray="1.5 2.5" />
    </Svg>
  ),
  libraryAdd: () => (
    <Svg>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8.5v7M8.5 12h7" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icons;
