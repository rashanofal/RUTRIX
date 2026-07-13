/** Sidebar mark — PNG with generous left padding; wide container avoids clipping motion lines */
const MARK_V = "14";

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
