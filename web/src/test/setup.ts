import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"

// jsdom does not perform layout or provide ResizeObserver.
vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
