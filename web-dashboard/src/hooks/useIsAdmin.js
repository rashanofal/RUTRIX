import { useAuth } from "../context/AuthContext";
import { PLATFORM_OWNER_EMAIL } from "../brand";

const ADMIN_ROLES = new Set(["owner", "admin"]);
const SUPERVISOR_ROLES = new Set(["owner", "admin", "supervisor"]);

export function useIsAdmin() {
  const { auth } = useAuth();
  return ADMIN_ROLES.has(auth?.user?.role);
}

export function useIsSupervisor() {
  const { auth } = useAuth();
  return SUPERVISOR_ROLES.has(auth?.user?.role);
}

export function useIsOwner() {
  const { auth } = useAuth();
  const email = auth?.user?.email?.trim().toLowerCase();
  return auth?.user?.role === "owner" && email === PLATFORM_OWNER_EMAIL;
}

export function isAdminRole(role) {
  return ADMIN_ROLES.has(role);
}

export function isOwnerRole(role) {
  return role === "owner";
}
