import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { ToolbarPlacement } from "./toolbarPlacement"
import "./workbenchToolbarTooltip.css"

export function WorkbenchToolbarTooltip({
  target,
  placement,
  onDismiss,
}: {
  target: HTMLElement
  placement: ToolbarPlacement["mode"]
  onDismiss: () => void
}) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const tooltipId = useId()
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const text = target.dataset.tooltip ?? target.getAttribute("aria-label")
  const theme = target.closest(".theme-dark") ? "theme-dark" : "theme-light"

  useLayoutEffect(() => {
    setPosition(null)
    let revealed = false
    const updatePosition = () => {
      if (!revealed) return
      const tooltip = tooltipRef.current
      if (!tooltip) return
      const anchor = target.getBoundingClientRect()
      const box = tooltip.getBoundingClientRect()
      let left = anchor.left + (anchor.width - box.width) / 2
      let top = anchor.bottom + 8
      if (placement === "left") {
        left = anchor.right + 8
        top = anchor.top + (anchor.height - box.height) / 2
      } else if (placement === "right") {
        left = anchor.left - box.width - 8
        top = anchor.top + (anchor.height - box.height) / 2
      } else if (top + box.height > window.innerHeight - 8) {
        top = anchor.top - box.height - 8
      }
      setPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - box.width - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - box.height - 8)),
      })
    }
    const timer = window.setTimeout(() => {
      revealed = true
      updatePosition()
    }, 250)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [target, placement, text])

  useEffect(() => {
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss()
    }
    window.addEventListener("resize", onDismiss)
    window.addEventListener("blur", onDismiss)
    window.addEventListener("keydown", dismissOnEscape)
    return () => {
      window.removeEventListener("resize", onDismiss)
      window.removeEventListener("blur", onDismiss)
      window.removeEventListener("keydown", dismissOnEscape)
    }
  }, [onDismiss])

  useEffect(() => {
    if (!position) return
    const previousDescription = target.getAttribute("aria-describedby")
    target.setAttribute("aria-describedby", [previousDescription, tooltipId].filter(Boolean).join(" "))
    return () => {
      if (previousDescription === null) target.removeAttribute("aria-describedby")
      else target.setAttribute("aria-describedby", previousDescription)
    }
  }, [target, position, tooltipId])

  return createPortal(
    <div
      ref={tooltipRef}
      id={tooltipId}
      role="tooltip"
      className={`workbench-toolbar-tooltip ${theme}`}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
    >
      {text}
    </div>,
    document.body,
  )
}
