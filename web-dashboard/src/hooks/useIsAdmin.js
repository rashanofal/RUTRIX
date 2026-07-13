import { useAuth } from "../context/AuthContext";

const ADMIN_ROLES = new Set(["owner", "admin"]);

export function useIsAdmin() {
  const { auth } = useAuth();
  return ADMIN_ROLES.has(auth?.user?.role);
}

export function isAdminRole(role) {
  return ADMIN_ROLES.has(role);
}
