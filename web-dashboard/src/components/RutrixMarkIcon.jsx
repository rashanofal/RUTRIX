/** Inline motion-line R — avoids PNG crop / double-letter artifacts in the sidebar */
export default function RutrixMarkIcon({ className = "" }) {
  return (
    <svg
      className={["rutrix-logo__mark-svg", className].filter(Boolean).join(" ")}
      viewBox="-18 8 178 152"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="rutrix-rg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9dffd8" />
          <stop offset="45%" stopColor="#3dffa8" />
          <stop offset="100%" stopColor="#128a58" />
        </linearGradient>
        <linearGradient id="rutrix-rg2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7dffc8" />
          <stop offset="100%" stopColor="#1a9a62" />
        </linearGradient>
      </defs>
      <path fill="url(#rutrix-rg)" d="M0 44 L44 44 L52 52 L52 62 L42 62 L36 56 L0 56 Z" />
      <path fill="url(#rutrix-rg2)" d="M4 72 L38 72 L44 78 L44 86 L4 86 Z" />
      <path fill="url(#rutrix-rg2)" d="M-8 92 L34 92 L42 100 L42 112 L-8 112 Z" />
      <path fill="url(#rutrix-rg)" d="M44 44 L64 44 L64 148 L44 148 Z" />
      <path
        fill="url(#rutrix-rg)"
        d="M64 44 L108 44 L136 72 L136 96 L108 96 L84 96 L84 114 L136 148 L112 148 L78 114 L64 114 Z"
      />
      <path fill="#b8ffe8" opacity="0.9" d="M44 44 L64 44 L64 96 L44 96 Z" />
    </svg>
  );
}
