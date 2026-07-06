/// <reference types="vite/client" />

declare module "ketcher-standalone/dist/jsNoRender" {
  import type { StructService, StructServiceOptions } from "ketcher-core"

  export class StandaloneStructServiceProvider {
    createStructService(options: StructServiceOptions): StructService
  }
}
