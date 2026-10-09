/**
 * CoreUI Icons Free (cil-* linear family) — curated local registry.
 *
 * We import ONLY the specific named exports Caventas uses, so the bundler
 * tree-shakes the rest of the ~1,600-icon set. The icon artwork is CC BY 4.0
 * (see /about for attribution). Each export is a CoreUI tuple
 * ["<w h>", "<svg path data>"]; we read [1] for the path and render it with
 * `currentColor` fill in a 0 0 512 512 viewBox.
 *
 * One family per surface: everything here is cil-* linear. Do not mix other
 * icon families on the same surface.
 */
import {
  cilApplicationsSettings,
  cilArrowRight,
  cilBan,
  cilBell,
  cilBook,
  cilChartLine,
  cilCheckCircle,
  cilChevronRight,
  cilClock,
  cilCloudDownload,
  cilDescription,
  cilEnvelopeClosed,
  cilFile,
  cilFolderOpen,
  cilHistory,
  cilInfo,
  cilLan,
  cilLaptop,
  cilList,
  cilMagnifyingGlass,
  cilMenu,
  cilNotes,
  cilPlus,
  cilReload,
  cilStorage,
  cilSettings,
  cilShieldAlt,
  cilSitemap,
  cilSync,
  cilTask,
  cilUser,
  cilWarning,
  cilX,
} from "@coreui/icons";

/** Semantic icon name -> CoreUI path data. */
export const ICONS = {
  // navigation
  dashboard: cilChartLine,
  cases: cilFolderOpen,
  approvals: cilTask,
  guidance: cilBook,
  reports: cilDescription,
  activity: cilHistory,
  settings: cilSettings,
  // workspace tabs / concepts
  evidence: cilList,
  timeline: cilClock,
  analysis: cilSitemap,
  responsePlan: cilApplicationsSettings,
  humanDecision: cilTask,
  report: cilDescription,
  // entity / evidence categories
  endpoint: cilLaptop,
  identity: cilUser,
  network: cilLan,
  email: cilEnvelopeClosed,
  file: cilFile,
  application: cilStorage,
  // status
  warning: cilWarning,
  success: cilCheckCircle,
  blocked: cilBan,
  running: cilSync,
  info: cilInfo,
  // actions / chrome
  search: cilMagnifyingGlass,
  bell: cilBell,
  plus: cilPlus,
  arrowRight: cilArrowRight,
  chevronRight: cilChevronRight,
  menu: cilMenu,
  close: cilX,
  reload: cilReload,
  download: cilCloudDownload,
  shield: cilShieldAlt,
  note: cilNotes,
} as const;

export type IconName = keyof typeof ICONS;

/**
 * Extract the inner SVG markup from a CoreUI icon tuple.
 *
 * Each CoreUI export is ["<w h>", "<path .../>"] where element [1] is a full
 * SVG path element string (occasionally several). We strip CoreUI's hardcoded
 * `fill='var(--ci-primary-color, currentcolor)'` so the parent <svg>'s
 * `fill="currentColor"` drives the colour, then inject the markup as inner SVG.
 */
export function iconMarkup(name: IconName): string {
  const entry = ICONS[name] as unknown;
  const raw = Array.isArray(entry) ? String(entry[1] ?? "") : String(entry ?? "");
  return raw.replace(/\s*fill=(['"])[^'"]*\1/gi, "");
}