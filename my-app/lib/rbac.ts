import type { AccountType } from "./onboarding";

export type RbacRole = AccountType;

export type RbacPermission =
  | "admin:read"
  | "admin:write"
  | "member:read"
  | "member:write"
  | "salon:read"
  | "salon:write";

export interface RbacActor {
  userId: string;
  accountType: RbacRole | null;
  isAdmin: boolean;
}

export function canUsePermission(actor: RbacActor, permission: RbacPermission) {
  if (permission === "admin:read" || permission === "admin:write") {
    return actor.accountType === "admin";
  }

  if (permission === "member:read") {
    return actor.accountType === "member" || actor.accountType === "admin";
  }

  if (permission === "member:write") {
    return actor.accountType === "member";
  }

  if (permission === "salon:read") {
    return actor.accountType === "salon_owner" || actor.accountType === "admin";
  }

  if (permission === "salon:write") {
    return actor.accountType === "salon_owner";
  }

  return false;
}

export function getRoleHomeHref(accountType: RbacRole | null) {
  if (accountType === "admin") {
    return "/admin/stats";
  }

  if (accountType === "salon_owner") {
    return "/salon/customers";
  }

  if (accountType === "member") {
    return "/mypage";
  }

  return "/onboarding";
}
