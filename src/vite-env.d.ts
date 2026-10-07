/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set by the Tauri CLI for the frontend build: "darwin", "ios", "windows", … */
  readonly TAURI_ENV_PLATFORM?: string;
}
