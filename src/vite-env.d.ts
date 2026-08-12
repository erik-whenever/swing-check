/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/info" />

interface ImportMetaEnv {
  /**
   * `<package version>+<git sha>`, injected by vite.config.ts. Recorded in the shaft
   * dataset manifest so an exported set names the build that selected its frames.
   */
  readonly VITE_APP_VERSION?: string;
}
