import type { ToolStep } from "./types";

export function describeToolUse(name: string, args: Record<string, unknown>): string {
  if (name === "search_documents") {
    const query = String(args.query ?? "");
    if (/agreement|contract|northstar|lumenworks/i.test(query)) {
      return "Reading the customer agreement";
    }
    if (/sop|cancel|credit/i.test(query)) {
      return "Checking the applicable SOP";
    }
    if (/policy|sla|severity/i.test(query)) {
      return "Checking the current support policy";
    }
    return query ? `Searching documents for “${query.slice(0, 48)}”` : "Searching documents";
  }

  if (name === "lookup_data") {
    const action = String(args.action ?? "lookup");
    const orderId = args.order_id ? String(args.order_id) : "";
    const ticketId = args.ticket_id ? String(args.ticket_id) : "";
    if (action === "get_order" || (action === "lookup" && orderId)) return `Looking up order ${orderId}`.trim();
    if (action === "get_account") return "Identifying the customer account";
    if (action === "cancellation") return `Looking up ${orderId || "order"} and calculating cancellation`;
    if (action === "service_credit") return `Looking up ${orderId || "order"} and calculating service credit`;
    if (action === "sla" || action === "get_ticket") return `Looking up ticket ${ticketId}`.trim();
    if (action === "list_orders") return "Listing orders for the account";
    if (action === "list_tickets") return "Listing tickets for the account";
    return "Querying structured account / order / ticket data";
  }

  if (name === "propose_action") {
    const type = String(args.action_type ?? "action");
    return `Preparing a state-changing action (${type}) — not executed yet`;
  }

  return `Using ${name}`;
}

export type TrailItem = {
  key: string;
  title: string;
  done: boolean;
  detail?: string;
};

export function buildTrail(steps: ToolStep[]): TrailItem[] {
  const blob = steps.map((s) => `${s.tool} ${s.label} ${s.resultPreview} ${JSON.stringify(s.args)}`).join(" ").toLowerCase();
  const items: TrailItem[] = [
    {
      key: "order",
      title: "Look up the order",
      done: /get_order|ord-|order lookup|looking up|cancellation/.test(blob),
    },
    {
      key: "account",
      title: "Identify the customer account",
      done: /get_account|acct-|account lookup|northstar|lumenworks|beacon|axis/.test(blob),
    },
    {
      key: "agreement",
      title: "Read the customer agreement",
      done: /agreement|enterprise agreement|service agreement/.test(blob),
    },
    {
      key: "policy",
      title: "Check the applicable policy or SOP",
      done: /sop|policy|document search|search_documents|searching documents|checking the/.test(blob),
    },
    {
      key: "calc",
      title: "Perform a calculation",
      done: /cancellation|service_credit|credit calc|sla|fee/.test(blob),
    },
    {
      key: "action",
      title: "Decide whether an action is required",
      done: /propose_action|state change|escalation|follow-up|update ticket|confirm/.test(blob),
    },
  ];
  return items;
}
