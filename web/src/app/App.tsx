import { createConfiguredShellRuntime } from "../shell"
import { createBrowserProjectRepository } from "../repository"
import { WorkbenchShell } from "./WorkbenchShell"
import { I18nProvider } from "./i18n"

const shellRuntime = createConfiguredShellRuntime(import.meta.env)
const projectRepository = createBrowserProjectRepository()

export function App() {
  return (
    <I18nProvider>
      <WorkbenchShell
        shellClient={shellRuntime.shellClient}
        projectRepository={projectRepository}
        runtimeInfo={shellRuntime.runtimeInfo}
      />
    </I18nProvider>
  )
}
