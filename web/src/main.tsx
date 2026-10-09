import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app/App"
import "./app/shell.css"
import "./app/canvas.css"
import "./app/panels.css"
import "./app/workbench.css"
import "./app/windowToolbar.css"
import "./app/tokens.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
