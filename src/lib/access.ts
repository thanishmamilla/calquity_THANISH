import { getAccount, getOrder, getTicket } from "./dataset";
import type { Account, Order, Session, Ticket } from "./types";

export function canSeeAccount(session: Session, accountId: string): boolean {
  if (session.allowedAccounts === "*") return true;
  return session.allowedAccounts.includes(accountId);
}

export function denyOtherAccount(session: Session, accountId: string) {
  if (session.role === "customer") {
    return {
      error: "not_found",
      message: "No matching record was found on your account.",
    };
  }
  return {
    error: "access_denied",
    message:
      session.role === "csm"
        ? "This account is not on your CSM book. You can only access assigned customers."
        : "Not authorised for this account.",
    requestedAccountId: accountId,
  };
}

function hideForeignRecord(kind: "order" | "ticket", id: string) {
  return {
    error: "not_found",
    message: `Unknown ${kind} ${id}.`,
  };
}

export function visibleAccount(session: Session, accountId?: string): Account | ReturnType<typeof denyOtherAccount> | { error: string } {
  if (session.role === "customer") {
    if (accountId && session.accountId && accountId !== session.accountId) {
      return { error: "not_found", message: "No matching record was found on your account." };
    }
  }
  const id = session.role === "customer" ? session.accountId : accountId ?? session.accountId;
  if (!id) return { error: "account_required", message: "Specify an account_id." };
  if (!canSeeAccount(session, id)) return denyOtherAccount(session, id);
  const account = getAccount(id);
  if (!account) return { error: "not_found", message: `Unknown account ${id}.` };
  return account;
}

export function visibleOrder(session: Session, orderId: string): Order | { error: string; message: string } {
  const order = getOrder(orderId);
  if (!order) return hideForeignRecord("order", orderId);
  if (!canSeeAccount(session, order.accountId)) {
    return session.role === "customer"
      ? hideForeignRecord("order", orderId)
      : denyOtherAccount(session, order.accountId);
  }
  return order;
}

export function visibleTicket(session: Session, ticketId: string): Ticket | { error: string; message: string } {
  const ticket = getTicket(ticketId);
  if (!ticket) return hideForeignRecord("ticket", ticketId);
  if (!canSeeAccount(session, ticket.accountId)) {
    return session.role === "customer"
      ? hideForeignRecord("ticket", ticketId)
      : denyOtherAccount(session, ticket.accountId);
  }
  return ticket;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !("error" in value);
}
