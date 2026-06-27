export function StructureUnavailableIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="11" y="11" width="26" height="26" rx="8" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.58" />
      <circle cx="19" cy="19" r="2.3" fill="currentColor" opacity="0.5" />
      <circle cx="29" cy="19" r="2.3" fill="currentColor" opacity="0.5" />
      <circle cx="19" cy="29" r="2.3" fill="currentColor" opacity="0.5" />
      <circle cx="29" cy="29" r="2.3" fill="currentColor" opacity="0.5" />
      <path d="M13.5 34.5 34.5 13.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  )
}
