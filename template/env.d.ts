/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_AVATAR_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'rollup-plugin-riot' {
  interface RiotTransformResult {
    code: string;
    map?: object | null;
  }

  interface RiotPlugin {
    transform?: (
      this: unknown,
      code: string,
      id: string,
    ) =>
      | RiotTransformResult
      | null
      | undefined
      | Promise<RiotTransformResult | null | undefined>;
  }

  export default function riot(options?: Record<string, unknown>): RiotPlugin;
}

declare module '*.riot' {
  import type { RiotComponent, RiotComponentWrapper } from 'riot';
  const component: RiotComponentWrapper<RiotComponent>;
  export default component;
}
