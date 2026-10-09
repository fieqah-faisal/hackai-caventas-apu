import { iconMarkup, type IconName } from "./registry";
import { cx } from "@/lib/types";

export type { IconName };

/**
 * CoreUI Icons Free (cil-*) rendered inline with `currentColor`.
 * Sizes: 20 for navigation, 24 for primary workflow / empty states.
 * Never render below 18px. Pair with a visible label; decorative-only icons
 * pass `decorative` (aria-hidden). Standalone meaningful icons pass `title`,
 * which becomes the accessible name via aria-label.
 *
 * CoreUI exports full <path> markup (not a bare `d` string), so we inject the
 * sanitised inner markup. The source is a trusted compile-time constant from
 * @coreui/icons, never user input.
 */
export function Icon({
  name,
  size = 20,
  title,
  decorative = true,
  className,
}: {
  name: IconName;
  size?: 18 | 20 | 24 | 28 | 32;
  title?: string;
  decorative?: boolean;
  className?: string;
}) {
  const labelled = !decorative && !!title;
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={cx("inline-block shrink-0", className)}
      fill="currentColor"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: iconMarkup(name) }}
    />
  );
}