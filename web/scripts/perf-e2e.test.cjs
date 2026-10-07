const assert = require("node:assert/strict")
const test = require("node:test")
const vm = require("node:vm")
const { startFrameMeasurement, stopFrameMeasurement, assertBudgets } = require("./perf-e2e.cjs")

function browserFrames() {
  let nextId = 0
  const callbacks = new Map()
  const window = {
    requestAnimationFrame(callback) {
      callbacks.set(++nextId, callback)
      return nextId
    },
    cancelAnimationFrame(id) {
      callbacks.delete(id)
    },
  }
  return {
    window,
    start: () => vm.runInNewContext(`(${startFrameMeasurement})()`, { window }),
    stop: () => vm.runInNewContext(`(${stopFrameMeasurement})()`, { window }),
    tick(timestamp) {
      const frame = [...callbacks.values()]
      callbacks.clear()
      for (const callback of frame) callback(timestamp)
    },
    pending: () => callbacks.size,
  }
}

function metrics(raf) {
  return { raf, sidebar: { layoutCount: 1, recalcStyleCount: 1 }, consoleErrors: [] }
}

test("measures browser frames independently of sparse or multiple application callbacks", () => {
  const browser = browserFrames()
  const originalRaf = browser.window.requestAnimationFrame
  browser.start()
  for (let frame = 0; frame <= 80; frame++) {
    if (frame % 5 === 0) {
      browser.window.requestAnimationFrame(() => {})
      browser.window.requestAnimationFrame(() => {})
    }
    browser.tick(frame * 16)
  }
  const raf = browser.stop()
  assert.equal(browser.window.requestAnimationFrame, originalRaf)
  assert.equal(raf.frameCount, 80)
  assert.equal(raf.minIntervalMs, 16)
  assert.equal(raf.p95IntervalMs, 16)
  assert.equal(raf.longFrameCount, 0)
  assert.doesNotThrow(() => assertBudgets(metrics(raf)))
  assert.equal(browser.pending(), 0)
})

test("rejects real long frames even when the p95 remains within budget", () => {
  const browser = browserFrames()
  browser.start()
  let timestamp = 0
  browser.tick(timestamp)
  for (let frame = 1; frame <= 80; frame++) {
    timestamp += frame % 20 === 0 && frame < 80 ? 96 : 16
    browser.tick(timestamp)
  }
  const raf = browser.stop()
  assert.equal(raf.p95IntervalMs, 16)
  assert.equal(raf.longFrameCount, 3)
  assert.throws(() => assertBudgets(metrics(raf)), /long frames 3 > 2/)
})

test("rejects an empty measurement and cancels its pending frame", () => {
  const browser = browserFrames()
  browser.start()
  const raf = browser.stop()
  assert.throws(() => assertBudgets(metrics(raf)), /captured no frames/)
  assert.equal(browser.pending(), 0)
})
