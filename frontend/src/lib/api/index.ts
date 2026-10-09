/**
 * Provider selection. The mode is chosen ONCE per application run from
 * VITE_DATA_MODE and never switched or mixed at runtime. Default is fixture.
 */
import { FixtureProvider } from "./fixtureProvider";
import { RealProvider } from "./realProvider";
import type { DataProvider, ProviderMode } from "./provider";

export function resolveMode(): ProviderMode {
  return import.meta.env.VITE_DATA_MODE === "api" ? "api" : "fixture";
}

let singleton: DataProvider | null = null;

export function getProvider(): DataProvider {
  if (singleton) return singleton;
  singleton = resolveMode() === "api" ? new RealProvider() : new FixtureProvider();
  return singleton;
}

export * from "./provider";