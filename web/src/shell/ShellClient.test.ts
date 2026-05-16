import { describe, expect, it } from "vitest"
import { fixtureTransport, ShellClient } from "."
import type { FixtureRunData, WorkbenchSnapshotData } from "."

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

  it("returns a JSON-safe workbench.snapshot response for the fixture session", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })

    const response = await shellClient.run<WorkbenchSnapshotData>({
      command: "workbench.snapshot",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
      },
    })

    expect(response.ok).toBe(true)
    expect(response.data?.command).toBe("workbench.snapshot")
    expect(response.data?.counts.objects).toBe(2)
    expect(response.data?.workspace?.graph.node_count).toBe(2)
    expect(response.data?.profile?.point_count).toBe(2)
    expect(() => JSON.stringify(response)).not.toThrow()
  })

  it("returns invalid_input when fixture snapshot has no session", async () => {
    const shellClient = new ShellClient(fixtureTransport)

    const response = await shellClient.run({
      command: "workbench.snapshot",
      args: {},
    })

    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe("invalid_input")
    expect(response.error?.target).toBe("session_id")
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
