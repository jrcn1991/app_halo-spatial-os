/// <reference types="vite/client" />

import type { HaloApi } from '@shared/ipc-contract'

declare global {
  interface Window {
    halo: HaloApi
  }
}

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
