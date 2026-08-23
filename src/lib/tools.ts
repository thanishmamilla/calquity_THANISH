import { stageAction } from "./actions";
import { canSeeAccount, visibleAccount, visibleOrder, visibleTicket } from "./access";
import { accounts, getAccount, orders, tickets } from "./dataset";
import { listDesk } from "./desk";
import { searchDocuments } from "./documents";
import { cancellationDecision, creditDecision, inferSeverity, slaStatus } from "./policy";
import { SNAPSHOT_LABEL } from "./time";
import type { ActionType, PendingAction, Session, TicketStatus, ToolStep } from "./types";

function preview(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

function publicAccount(accountId: string) {
  const account = getAccount(accountId);
  if (!account) return { accountId };
  return {
    accountId: account.accountId,
    accountName: account.accountName,
    plan: account.plan,
    csm: account.csm,
    hasCustomContract: Boolean(account.contractFile),
  };
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  session: Session,
): Promise<{ result: unknown; step: ToolStep; pendingAction?: PendingAction }> {
  if (name === "search_documents") {
    const query = String(args.query ?? "");
    const hits = searchDocuments(query, session).map(
      ({ chunk, score }) => ({
        source: chunk.file,
        title: chunk.title,
        section: chunk.section,
        status: chunk.status,
        kind: chunk.kind,
        authority: chunk.authority,
        applicability: chunk.accountId
          ? `Customer agreement for ${chunk.accountId} only`
          : "General ParcelPilot source",
        guidance:
          chunk.status === "deprecated"
            ? "DEPRECATED. Do not use for a live decision unless the user asked for historical policy."
            : chunk.kind === "contract"
              ? "Highest authority for this account. Overrides general policy and SOP where they conflict."
              : "Current general source. A signed customer agreement still wins if it conflicts.",
        excerpt: chunk.text,
        score: Number(score.toFixed(2)),
      }),
    );
    const result = {
      snapshot: SNAPSHOT_LABEL,
      hits,
      note: "Ranked by relevance and source authority. Contracts outrank current policy/SOP, which outrank the product guide. Deprecated policy and old tickets are not equal sources.",
    };
    return {
      result,
      step: {
        tool: name,
        label: "1 · Document search",
        args,
        resultPreview: hits.length
          ? hits.map((h) => h.section).join(" · ")
          : "No matching passages",
      },
    };
  }

  if (name === "lookup_data") {
    const action = String(args.action ?? "lookup");
    const orderId = args.order_id ? String(args.order_id) : undefined;
    const ticketId = args.ticket_id ? String(args.ticket_id) : undefined;
    const requestedAccount = args.account_id ? String(args.account_id) : undefined;

    if (action === "list_accounts") {
      if (session.role === "customer") {
        const result = { error: "access_denied", message: "Customers cannot list other accounts." };
        return { result, step: { tool: name, label: "2 · Data lookup", args, resultPreview: preview(result) } };
      }
      const result = accounts
        .filter((a) => canSeeAccount(session, a.accountId))
        .map((a) => publicAccount(a.accountId));
      return { result, step: { tool: name, label: "2 · List accounts", args, resultPreview: `${result.length} accounts` } };
    }

    if (action === "get_account") {
      const account = visibleAccount(session, requestedAccount);
      return {
        result: account,
        step: { tool: name, label: "2 · Account lookup", args, resultPreview: preview(account) },
      };
    }

    if (action === "list_orders" || action === "list_tickets") {
      const account = visibleAccount(session, requestedAccount);
      if ("error" in account) {
        return { result: account, step: { tool: name, label: "2 · Data lookup", args, resultPreview: preview(account) } };
      }
      if (action === "list_orders") {
        const rows = orders
          .filter((o) => o.accountId === account.accountId)
          .map((o) => ({ ...o, account: publicAccount(o.accountId) }));
        return { result: rows, step: { tool: name, label: "2 · Order list", args, resultPreview: `${rows.length} orders` } };
      }
      const rows = tickets
        .filter((t) => t.accountId === account.accountId)
        .map((t) => ({
          ...t,
          account: publicAccount(t.accountId),
          trust:
            t.historicalResolution
              ? "Historical resolution is context only and may be incorrect. Do not treat it as policy."
              : "Open ticket. Not a policy source.",
        }));
        return { result: rows, step: { tool: name, label: "2 · Ticket list", args, resultPreview: `${rows.length} tickets` } };
    }

    if (orderId && (action === "get_order" || action === "lookup" || action === "cancellation" || action === "service_credit")) {
      const order = visibleOrder(session, orderId);
      if ("error" in order) {
        return { result: order, step: { tool: name, label: "2 · Order lookup", args, resultPreview: preview(order) } };
      }
      const account = getAccount(order.accountId)!;
      const payload: Record<string, unknown> = {
        snapshot: SNAPSHOT_LABEL,
        order,
        account: publicAccount(account.accountId),
      };
      if (action === "cancellation" || action === "lookup") {
        payload.cancellation = cancellationDecision(order, account);
      }
      if (action === "service_credit" || action === "lookup") {
        payload.serviceCredit = creditDecision(order, account);
      }
      return {
        result: payload,
        step: {
          tool: name,
          label:
            action === "cancellation"
              ? `2 · Cancellation calc ${orderId}`
              : action === "service_credit"
                ? `2 · Credit calc ${orderId}`
                : `2 · Order lookup ${orderId}`,
          args,
          resultPreview: `${order.orderId} ${order.status}`,
        },
      };
    }

    if (ticketId && (action === "get_ticket" || action === "sla" || action === "lookup")) {
      const ticket = visibleTicket(session, ticketId);
      if ("error" in ticket) {
        return { result: ticket, step: { tool: name, label: "2 · Ticket lookup", args, resultPreview: preview(ticket) } };
      }
      const result = {
        snapshot: SNAPSHOT_LABEL,
        ticket: {
          ...ticket,
          inferredSeverity: inferSeverity(ticket),
          trust: ticket.historicalResolution
            ? "Historical resolution is context only and may be incorrect."
            : "Open ticket.",
        },
        account: publicAccount(ticket.accountId),
        sla: slaStatus(ticket),
      };
      return {
        result,
        step: { tool: name, label: `2 · Ticket lookup ${ticketId}`, args, resultPreview: ticket.subject },
      };
    }

    if (action === "list_escalations" || action === "list_followups" || action === "list_desk") {
      if (session.role === "customer") {
        const result = { error: "access_denied", message: "Customers cannot list the internal desk." };
        return { result, step: { tool: name, label: "2 · Data lookup", args, resultPreview: preview(result) } };
      }
      const desk = listDesk(session);
      const result =
        action === "list_escalations"
          ? desk.escalations
          : action === "list_followups"
            ? desk.followUps
            : desk;
      return {
        result,
        step: { tool: name, label: "2 · Desk lookup", args, resultPreview: preview(result) },
      };
    }

    const result = {
      error: "bad_request",
      message:
        "Provide action plus an identifier. Actions: get_account, get_order, get_ticket, list_orders, list_tickets, list_accounts, cancellation, service_credit, sla, list_escalations, list_followups, list_desk.",
    };
    return { result, step: { tool: name, label: "2 · Data lookup", args, resultPreview: preview(result) } };
  }

  if (name === "propose_action") {
    const type = String(args.action_type ?? "create_escalation") as ActionType;
    const summary = String(args.summary ?? "Support follow-up");
    const reason = String(args.reason ?? "");
    const ticketId = args.ticket_id ? String(args.ticket_id) : undefined;
    const orderId = args.order_id ? String(args.order_id) : undefined;
    const priority = args.priority ? (String(args.priority) as PendingAction["priority"]) : undefined;
    const assignedTo = args.assigned_to ? String(args.assigned_to) : undefined;
    const ticketStatus = args.ticket_status ? (String(args.ticket_status) as TicketStatus) : undefined;

    let accountId = session.accountId;
    if (ticketId) {
      const ticket = visibleTicket(session, ticketId);
      if ("error" in ticket) {
        return { result: ticket, step: { tool: name, label: "3 · State change", args, resultPreview: preview(ticket) } };
      }
      accountId = ticket.accountId;
    } else if (orderId) {
      const order = visibleOrder(session, orderId);
      if ("error" in order) {
        return { result: order, step: { tool: name, label: "3 · State change", args, resultPreview: preview(order) } };
      }
      accountId = order.accountId;
    } else if (session.role !== "customer" && args.account_id) {
      const requested = String(args.account_id);
      if (!canSeeAccount(session, requested)) {
        const denied = { error: "access_denied", message: "This account is outside your role scope." };
        return { result: denied, step: { tool: name, label: "3 · State change", args, resultPreview: preview(denied) } };
      }
      accountId = requested;
    }

    if (!accountId) {
      const result = { error: "account_required", message: "Cannot stage an action without an account." };
      return { result, step: { tool: name, label: "3 · State change", args, resultPreview: preview(result) } };
    }

    const pendingAction = stageAction(session.userId, {
      type,
      summary,
      reason,
      priority,
      ticketId,
      orderId,
      accountId,
      assignedTo,
      ticketStatus,
    });

    const result = {
      status: "awaiting_confirmation",
      written: false,
      message:
        "PREPARED ONLY. Do not claim this was created. Ask the user to reply confirm or cancel. Nothing has been written to the desk yet.",
      pendingAction,
    };
    return {
      result,
      pendingAction,
      step: {
        tool: name,
        label:
          type === "create_escalation"
            ? "3 · Create escalation (confirm)"
            : type === "update_ticket"
              ? "3 · Update ticket (confirm)"
              : "3 · Create follow-up (confirm)",
        args,
        resultPreview: pendingAction.summary,
      },
    };
  }

  const result = { error: "unknown_tool", message: `No tool named ${name}` };
  return { result, step: { tool: name, label: name, args, resultPreview: preview(result) } };
}
