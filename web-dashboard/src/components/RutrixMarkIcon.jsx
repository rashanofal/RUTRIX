/** Sidebar mark — official motion-line R from brand assets */
const MARK_V = "13";

export default function RutrixMarkIcon({ className = "" }) {
  return (
    <span className="rutrix-logo__mark-wrap" aria-hidden>
      <img
        className={["rutrix-logo__img", "rutrix-logo__mark", className].filter(Boolean).join(" ")}
        src={`/brand/logo-mark.png?v=${MARK_V}`}
        alt=""
        decoding="async"
      />
    </span>
  );
}
