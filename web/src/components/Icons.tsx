// One custom icon set (plan, section 5): 16 px, 1.5 px strokes, round caps and joins, drawn in currentColor,
// so an icon always takes its control's text colour and with it that colour's checked contrast. No icon font,
// no library: each icon is a few strokes on a 16 px grid, kept inside a 1.5 px margin.
import type { ReactNode, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children" | "viewBox"> {
  /** Accessible name. Without one the icon is decorative (hidden from assistive technology) and its control
   *  carries the label. */
  title?: string;
  size?: number;
}

function Icon({ title, size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** The probe: a ring with crosshair ticks and its centre. */
export function ProbeIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="8" cy="8" r="4.25" />
      <path d="M8 1.5v2.25M8 12.25v2.25M1.5 8h2.25M12.25 8h2.25M8 8h.01" />
    </Icon>
  );
}

/** A map pin. */
export function PinIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8 14.5S3.25 10.25 3.25 6.5a4.75 4.75 0 0 1 9.5 0C12.75 10.25 8 14.5 8 14.5Z" />
      <circle cx="8" cy="6.5" r="1.75" />
    </Icon>
  );
}

/** Stacked layers. */
export function LayersIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8 1.75 14.25 5 8 8.25 1.75 5Z" />
      <path d="M1.75 8 8 11.25 14.25 8" />
      <path d="M1.75 11 8 14.25 14.25 11" />
    </Icon>
  );
}

/** Two points side by side: arrows in opposite directions. */
export function CompareIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2 5.25h10M9.5 2.75 12 5.25 9.5 7.75" />
      <path d="M14 10.75H4M6.5 8.25 4 10.75l2.5 2.5" />
    </Icon>
  );
}

/** The cited brief: a page with a folded corner and two lines. */
export function BriefIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9.25 1.75H4.25a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V4.75Z" />
      <path d="M9.25 1.75v3h3.5M5.75 8.5h4.5M5.75 11h4.5" />
    </Icon>
  );
}

/** Share: an arrow leaving a tray. */
export function ShareIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8 10V1.75M5.25 4.5 8 1.75l2.75 2.75" />
      <path d="M3.75 7.5v5.75a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1V7.5" />
    </Icon>
  );
}

/** Sound: a speaker with two waves. */
export function SoundIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M1.75 6.25v3.5h2.5L8 12.75V3.25L4.25 6.25Z" />
      <path d="M10.75 6a3 3 0 0 1 0 4M12.75 4a5.75 5.75 0 0 1 0 8" />
    </Icon>
  );
}

/** Time: a clock face. */
export function TimeIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.5V8l2.5 1.5" />
    </Icon>
  );
}

/** The field notebook: a bound book with its spine and rings. */
export function NotebookIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="1.75" width="9.75" height="12.5" rx="1" />
      <path d="M6.25 1.75v12.5M2 4.75h2.75M2 8h2.75M2 11.25h2.75" />
    </Icon>
  );
}

/** Keyboard shortcuts. */
export function KeyboardIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="1.25" y="3.75" width="13.5" height="8.5" rx="1.25" />
      <path d="M4 6.5h.01M6.67 6.5h.01M9.33 6.5h.01M12 6.5h.01M5 9.5h6" />
    </Icon>
  );
}

/** Close. */
export function CloseIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.75 3.75l8.5 8.5M12.25 3.75l-8.5 8.5" />
    </Icon>
  );
}

const CHEVRON_TURN = { right: 0, down: 90, left: 180, up: 270 } as const;

/** A chevron, pointing right unless told otherwise. The turn is drawn inside the icon, so a class on the
 *  icon (such as group-open:rotate-90) can still rotate it. */
export function ChevronIcon({ dir = "right", ...p }: IconProps & { dir?: keyof typeof CHEVRON_TURN }) {
  return (
    <Icon {...p}>
      <path d="M6 3.5 10.5 8 6 12.5" transform={CHEVRON_TURN[dir] ? `rotate(${CHEVRON_TURN[dir]} 8 8)` : undefined} />
    </Icon>
  );
}

/** Search (the command palette). */
export function SearchIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="7" cy="7" r="4.75" />
      <path d="M10.5 10.5 14 14" />
    </Icon>
  );
}

/** The light theme: a sun. */
export function SunIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
    </Icon>
  );
}

/** The dark theme: a crescent moon. */
export function MoonIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M13.25 9.75A5.75 5.75 0 1 1 6.25 2.75a4.5 4.5 0 0 0 7 7Z" />
    </Icon>
  );
}

/** A dossier: a folder with its tab. */
export function DossierIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M1.75 4.25a1 1 0 0 1 1-1h3.5l1.5 1.75h5.5a1 1 0 0 1 1 1v6.75a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1Z" />
    </Icon>
  );
}

/** A list of tests: three rows, each with its marker. */
export function TestsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2.25 4h.01M2.25 8h.01M2.25 12h.01M5.25 4h8.5M5.25 8h8.5M5.25 12h8.5" />
    </Icon>
  );
}

/** Zoom: the four corners of a frame (which part of the plane is in view). */
export function ZoomIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2.25 5.75v-3.5h3.5M10.25 2.25h3.5v3.5M13.75 10.25v3.5h-3.5M5.75 13.75h-3.5v-3.5" />
    </Icon>
  );
}

/** Select an area: a marquee, drawn as a rectangle broken at its corners and edges. */
export function SelectIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2.25 4.25v-2h2M7 2.25h2M11.75 2.25h2v2M13.75 7v2M13.75 11.75v2h-2M9 13.75H7M4.25 13.75h-2v-2M2.25 9V7" />
    </Icon>
  );
}

/** Menu: three lines, for the plane's tools folded into one button on a phone. */
export function MenuIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2.75 4h10.5M2.75 8h10.5M2.75 12h10.5" />
    </Icon>
  );
}

/** The whole set by name, for the shortcut sheet and for the test that holds every icon to the spec. */
export const ICONS = {
  menu: MenuIcon,
  zoom: ZoomIcon,
  select: SelectIcon,
  dossier: DossierIcon,
  tests: TestsIcon,
  probe: ProbeIcon,
  pin: PinIcon,
  layers: LayersIcon,
  compare: CompareIcon,
  brief: BriefIcon,
  share: ShareIcon,
  sound: SoundIcon,
  time: TimeIcon,
  notebook: NotebookIcon,
  keyboard: KeyboardIcon,
  close: CloseIcon,
  chevron: ChevronIcon,
  search: SearchIcon,
  sun: SunIcon,
  moon: MoonIcon,
} as const;
