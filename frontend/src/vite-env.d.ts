/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Data provider mode: "fixture" (synthetic demo) or "api" (live FastAPI). */
  readonly VITE_DATA_MODE?: "fixture" | "api";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}