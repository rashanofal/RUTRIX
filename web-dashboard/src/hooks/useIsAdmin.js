import { useAuth } from "../context/AuthContext";

const ADMIN_ROLES = new Set(["owner", "admin"]);

export function useIsAdmin() {
  const { auth } = useAuth();
  return ADMIN_ROLES.has(auth?.user?.role);
}

export function useIsOwner() {
  const { auth } = useAuth();
  return auth?.user?.role === "owner";
}

export function isAdminRole(role) {
  return ADMIN_ROLES.has(role);
}

export function isOwnerRole(role) {
  return role === "owner";
}
