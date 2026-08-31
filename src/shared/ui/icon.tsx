import type { ReactNode } from "react";

export type IconName =
  | "ticket"
  | "mic"
  | "masks"
  | "clapper"
  | "tent"
  | "trophy"
  | "presentation"
  | "balloon"
  | "calendar"
  | "clock"
  | "timer"
  | "pin"
  | "bell"
  | "heart"
  | "plus"
  | "minus"
  | "upload"
  | "link"
  | "bold"
  | "list"
  | "ordered-list"
  | "edit"
  | "trash";

const paths: Record<IconName, ReactNode> = {
  ticket: (
    <>
      <path d="M3 8.5V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a2 2 0 0 0 0 3.5V13a2 2 0 0 0 0 3.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a2 2 0 0 0 0-3.5v-2a2 2 0 0 0 0-3.5Z" />
      <path d="M14 5v14" strokeDasharray="2 2" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </>
  ),
  masks: (
    <>
      <path d="M3 5c2 0 3.5 1.3 3.5 3.5 0 3-1.5 4-1.5 6.5A3 3 0 0 0 8 18" />
      <path d="M21 5c-2 0-3.5 1.3-3.5 3.5 0 3 1.5 4 1.5 6.5a3 3 0 0 1-3 3" />
      <path d="M9 19.5c1.2.8 2.8.8 4 0" />
    </>
  ),
  clapper: (
    <>
      <path d="M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <path d="M4 8 6.5 3h3L7 8M10 8l2.5-5h3L13 8M16 8l2.5-5H20" />
    </>
  ),
  tent: (
    <>
      <path d="M6 21V3" />
      <path d="M6 4h12l-3.5 4L18 12H6" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4.5A1.5 1.5 0 0 0 3 6.5c0 2 1.5 3.5 4 3.7M17 5h2.5A1.5 1.5 0 0 1 21 6.5c0 2-1.5 3.5-4 3.7" />
      <path d="M12 14v3M8.5 20.5h7l-1-3.5h-5l-1 3.5Z" />
    </>
  ),
  presentation: (
    <>
      <rect x="4" y="4" width="16" height="11" rx="1.5" />
      <path d="M12 15v6M8.5 21h7M9 9h6M9 12h3" />
    </>
  ),
  balloon: (
    <>
      <path d="M12 3a5 5 0 0 0-5 5c0 3.5 5 8 5 8s5-4.5 5-8a5 5 0 0 0-5-5Z" />
      <path d="m10.5 16 1.5 2 1.5-2M12 18c-2 1-3 2-3 3M12 18c2 1 3 2 3 3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="1.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 13V9m0 4 3 2M9 2h6M12 2v3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9.5a6 6 0 0 1 12 0v4.2c0 .8.3 1.6.9 2.2l.6.6H4.5l.6-.6a3.1 3.1 0 0 0 .9-2.2V9.5Z" />
      <path d="M9.5 19.5a2.5 2.5 0 0 0 5 0" />
    </>
  ),
  heart: <path d="M20.5 8.5c0 5.2-8.5 10-8.5 10s-8.5-4.8-8.5-10A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8.5 2.5Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  link: <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />,
  bold: <path d="M7 4h6a4 4 0 0 1 0 8H7V4Zm0 8h7a4 4 0 0 1 0 8H7v-8Z" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  "ordered-list": <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M3.5 10h2M3 14h3l-3 4h3" />,
  edit: <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
};

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
