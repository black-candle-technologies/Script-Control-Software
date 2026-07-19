/**
 * SCS icon set — one consistent family of 16px stroke icons drawn inline so no
 * icon dependency is needed. All icons inherit currentColor and pair with text
 * labels; none is expected to communicate alone.
 */
import type { SVGProps } from "react";

type IconName =
  | "write"
  | "outline"
  | "treatment"
  | "reference"
  | "series"
  | "breakdown"
  | "drafts"
  | "team"
  | "companion"
  | "panel-left"
  | "panel-right"
  | "search"
  | "focus"
  | "undo"
  | "redo"
  | "close"
  | "chevron-down"
  | "chevron-right"
  | "plus"
  | "menu"
  | "check"
  | "back";

const PATHS: Record<IconName, React.ReactNode> = {
  write: <><path d="M11.3 2.7a1.7 1.7 0 0 1 2.4 2.4l-7.6 7.6-3.3.9.9-3.3z" /><path d="M9.8 4.2l2.4 2.4" /></>,
  outline: <><path d="M5.5 4h8" /><path d="M5.5 8h8" /><path d="M5.5 12h8" /><circle cx="2.7" cy="4" r=".9" fill="currentColor" stroke="none" /><circle cx="2.7" cy="8" r=".9" fill="currentColor" stroke="none" /><circle cx="2.7" cy="12" r=".9" fill="currentColor" stroke="none" /></>,
  treatment: <><path d="M4 2h6l3 3v9H4z" /><path d="M10 2v3h3" /><path d="M6.2 8.5h4" /><path d="M6.2 11h4" /></>,
  reference: <><path d="M2.5 3.2A1.8 1.8 0 0 1 4.3 2H8v11H4.3a1.8 1.8 0 0 0-1.8 1V3.2z" /><path d="M13.5 3.2A1.8 1.8 0 0 0 11.7 2H8v11h3.7a1.8 1.8 0 0 1 1.8 1V3.2z" /></>,
  series: <><rect x="2" y="4.5" width="12" height="8.5" rx="1.4" /><path d="M5.5 1.8L8 4.3l2.5-2.5" /></>,
  breakdown: <><path d="M2.5 13.5v-5" /><path d="M6.5 13.5v-9" /><path d="M10.5 13.5v-6.5" /><path d="M14 13.5V4" /></>,
  drafts: <><path d="M8 4.8V8l2.3 1.4" /><path d="M2.6 6.5a5.7 5.7 0 1 1 .6 4.6" /><path d="M2.3 7.5l.5-2.6 2.5.8" /></>,
  team: <><circle cx="5.7" cy="5.6" r="2.3" /><path d="M1.8 13.4c.4-2.4 1.9-3.7 3.9-3.7s3.5 1.3 3.9 3.7" /><circle cx="11.6" cy="5.9" r="1.9" /><path d="M10.9 9.6c1.9.1 3 1.3 3.4 3.2" /></>,
  companion: <><path d="M6.5 9.5l3-3" /><path d="M7.6 4.6l1.2-1.2a2.5 2.5 0 0 1 3.6 3.6l-1.2 1.2" /><path d="M8.4 11.4l-1.2 1.2a2.5 2.5 0 0 1-3.6-3.6l1.2-1.2" /></>,
  "panel-left": <><rect x="2" y="2.8" width="12" height="10.4" rx="1.4" /><path d="M6.2 2.8v10.4" /></>,
  "panel-right": <><rect x="2" y="2.8" width="12" height="10.4" rx="1.4" /><path d="M9.8 2.8v10.4" /></>,
  search: <><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2l3.4 3.4" /></>,
  focus: <><path d="M2.5 5.5v-3h3" /><path d="M13.5 5.5v-3h-3" /><path d="M2.5 10.5v3h3" /><path d="M13.5 10.5v3h-3" /><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" /></>,
  undo: <><path d="M3 6.5h7a3.2 3.2 0 0 1 0 6.4H6" /><path d="M5.8 3.7L3 6.5l2.8 2.8" /></>,
  redo: <><path d="M13 6.5H6a3.2 3.2 0 0 0 0 6.4h4" /><path d="M10.2 3.7L13 6.5l-2.8 2.8" /></>,
  close: <><path d="M4 4l8 8" /><path d="M12 4l-8 8" /></>,
  "chevron-down": <path d="M4 6l4 4 4-4" />,
  "chevron-right": <path d="M6 4l4 4-4 4" />,
  plus: <><path d="M8 3.2v9.6" /><path d="M3.2 8h9.6" /></>,
  menu: <><circle cx="8" cy="3.4" r="1.1" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="8" cy="12.6" r="1.1" fill="currentColor" stroke="none" /></>,
  check: <path d="M3 8.5l3.2 3.2L13 4.5" />,
  back: <><path d="M9.8 3.5L5.3 8l4.5 4.5" /></>,
};

export default function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

export type { IconName };
