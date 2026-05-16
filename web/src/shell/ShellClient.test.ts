import { describe, expect, it } from "vitest"
import { fixtureTransport, ShellClient } from "."
import type { FixtureRunData } from "."

describe("ShellClient", () => {
  it("returns a JSON-safe fixture.run response", async () => {
    const shellClient = new ShellClient(fixtureTransport)

    const response = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })

    expect(response.ok).toBe(true)
    expect(response.data?.command).toBe("fixture.run")
    expect(response.data?.profile.id).toBe("profile-a-b-electronic")
    expect(response.data?.object_count).toBe(2)
    expect(() => JSON.stringify(response)).not.toThrow()
  })

  it("normalizes unknown commands to invalid_input responses", async () => {
    const shellClient = new ShellClient(fixtureTransport)

    const response = await shellClient.run({
      command: "missing.command",
      args: {},
    })

    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe("invalid_input")
    expect(response.error?.target).toBe("command")
    expect(() => JSON.stringify(response)).not.toThrow()
  })

})
