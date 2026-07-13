/** Sidebar mark — use the official cropped PNG, not a hand-drawn SVG. */
const MARK_V = "15";

export default function RutrixMarkIcon({ className = "" }) {
  return (
    <img
      className={["rutrix-logo__img", "rutrix-logo__mark", className].filter(Boolean).join(" ")}
      src={`/brand/logo-mark.png?v=${MARK_V}`}
      alt=""
      decoding="async"
    />
  );
}
