import { resolveMode } from "@/lib/api";
import type { ProviderMode } from "@/lib/api/provider";

/** The data mode this application run was started in. Stable per run. */
export function useDataMode(): ProviderMode {
  return resolveMode();
}