import { ShellClient, fixtureTransport } from "../shell"
import { WorkbenchShell } from "./WorkbenchShell"

const shellClient = new ShellClient(fixtureTransport)

export function App() {
  return <WorkbenchShell shellClient={shellClient} />
}
