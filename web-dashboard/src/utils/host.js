export function isProductionHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  if (h.includes("hf.space")) return true;
  if (h === "localhost" || h === "127.0.0.1") return false;
  if (/^192\.168\./.test(h) || /^10\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    return false;
  }
  return true;
}
