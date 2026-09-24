/* Line icons for the builder toolbar (24px grid, stroke-based,
   inherit currentColor). Kept local so no icon package is added. */

import type { BlockType } from "../schema";

const PATHS: Record<BlockType | "variables" | "undo" | "redo", string> = {
  heading: "M6 4v16M18 4v16M6 12h12",
  text: "M4 6h16M4 12h16M4 18h10",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1 1 0 1 0 0-.01",
  button: "M3 8h18v8H3zM8 12h8",
  divider: "M3 12h18M7 7h10M7 17h10",
  spacer: "M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4",
  columns: "M4 5h7v14H4zM13 5h7v14h-7z",
  social: "M16 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1",
  footer: "M4 4h16v16H4zM4 15h16M8 18h8",
  variables: "M8 4c-2 0-3 1-3 3v2c0 1.5-1 2.5-2 3 1 .5 2 1.5 2 3v2c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2c0 1.5 1 2.5 2 3-1 .5-2 1.5-2 3v2c0 2-1 3-3 3M10 9l4 6M14 9l-4 6",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  redo: "M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3",
};

export function Icon({
  name,
  size = 18,
}: {
  name: keyof typeof PATHS;
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
