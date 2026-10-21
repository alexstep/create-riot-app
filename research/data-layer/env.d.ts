/// <reference types="vite/client" />

declare const BUILD_HASH: string
declare const PRECACHE_JSON: string

declare module '*.riot' {
  import type { RiotComponentWrapper } from 'riot'
  const component: RiotComponentWrapper
  export default component
}

declare module 'rollup-plugin-riot' {
  export default function riot(): {
    transform?: (this: unknown, code: string, id: string) =>
      | Promise<{ code?: string } | string | null | undefined>
      | { code?: string }
      | string
      | null
      | undefined
  }
}
