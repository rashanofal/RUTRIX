/** Inline RUTRIX mark — scales cleanly in the sidebar without PNG crop/clipping issues */
export default function RutrixMarkIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="rutrix-mark-grad" x1="18%" y1="8%" x2="88%" y2="92%">
          <stop offset="0%" stopColor="#7dffc8" />
          <stop offset="42%" stopColor="#3dffa8" />
          <stop offset="100%" stopColor="#128a58" />
        </linearGradient>
      </defs>
      <g transform="translate(88, 72) scale(0.68)">
        <path
          fill="url(#rutrix-mark-grad)"
          d="M118 96 L248 96 L318 168 L318 228 L268 228 L268 196 L168 196 L168 416 L118 416 Z"
        />
        <path
          fill="url(#rutrix-mark-grad)"
          d="M268 228 L318 228 L398 416 L342 416 L278 284 L268 284 Z"
        />
        <path fill="#9dffda" opacity="0.9" d="M118 96 L168 96 L168 196 L118 196 Z" />
      </g>
    </svg>
  );
}
