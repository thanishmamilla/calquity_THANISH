import { accounts } from "./dataset";
import type { Role, Session } from "./types";

export type AuthUser = {
  id: string;
  role: Role;
  displayName: string;
  accountId: string | null;
  allowedAccounts: "*" | string[];
  blurb: string;
};

export const USERS: AuthUser[] = [
  {
    id: "northstar",
    role: "customer",
    displayName: "Northstar Logistics",
    accountId: "ACCT-001",
    allowedAccounts: ["ACCT-001"],
    blurb: "Customer · this account only",
  },
  {
    id: "lumenworks",
    role: "customer",
    displayName: "LumenWorks",
    accountId: "ACCT-002",
    allowedAccounts: ["ACCT-002"],
    blurb: "Customer · this account only",
  },
  {
    id: "beacon",
    role: "customer",
    displayName: "Beacon Retail",
    accountId: "ACCT-003",
    allowedAccounts: ["ACCT-003"],
    blurb: "Customer · this account only",
  },
  {
    id: "axis",
    role: "customer",
    displayName: "Axis Labs",
    accountId: "ACCT-004",
    allowedAccounts: ["ACCT-004"],
    blurb: "Customer · this account only",
  },
  {
    id: "rohit",
    role: "support",
    displayName: "Rohit · Support",
    accountId: null,
    allowedAccounts: "*",
    blurb: "Support · every account + issues board",
  },
  {
    id: "maya",
    role: "support",
    displayName: "Maya · Support",
    accountId: null,
    allowedAccounts: "*",
    blurb: "Support · every account + issues board",
  },
  {
    id: "priya",
    role: "csm",
    displayName: "Priya Mehta · CSM",
    accountId: null,
    allowedAccounts: ["ACCT-001", "ACCT-004"],
    blurb: "CSM · Northstar and Axis Labs only",
  },
  {
    id: "arjun",
    role: "csm",
    displayName: "Arjun Rao · CSM",
    accountId: null,
    allowedAccounts: ["ACCT-002"],
    blurb: "CSM · LumenWorks only",
  },
  {
    id: "neha",
    role: "csm",
    displayName: "Neha Kapoor · CSM",
    accountId: null,
    allowedAccounts: ["ACCT-003"],
    blurb: "CSM · Beacon Retail only",
  },
];

export function isStaff(session: Session): boolean {
  return session.role === "support" || session.role === "csm";
}

export function sessionFromUser(user: AuthUser): Session {
  return {
    userId: user.id,
    role: user.role,
    accountId: user.accountId,
    allowedAccounts: user.allowedAccounts,
    displayName: user.displayName,
  };
}

export function userById(userId: string): AuthUser | undefined {
  return USERS.find((user) => user.id === userId);
}

export function publicUsers() {
  return USERS.map((user) => ({
    ...user,
    accountNames:
      user.allowedAccounts === "*"
        ? accounts.map((a) => a.accountName)
        : user.allowedAccounts.map((id) => accounts.find((a) => a.accountId === id)?.accountName ?? id),
  }));
}

export const CUSTOMERS = USERS.filter((user) => user.role === "customer");
export const SUPPORT = USERS.filter((user) => user.role === "support");
export const CSMS = USERS.filter((user) => user.role === "csm");
