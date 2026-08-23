import { canSeeAccount } from "./access";
import { getAccount, orders, tickets } from "./dataset";
import { documents } from "./documents";
import { inferSeverity, slaStatus } from "./policy";
import { SNAPSHOT, hoursBetween, parseIst, SNAPSHOT_LABEL } from "./time";
import type { Session, Ticket } from "./types";

export type IssueCategory = "recurring" | "product" | "sla" | "orders" | "cross_customer";

export type OpsIssue = {
  id: string;
  category: IssueCategory;
  severity: "critical" | "watch" | "info";
  title: string;
  whyItMatters: string;
  tickets: string[];
  accounts: string[];
  orders?: string[];
  suggestedAction: string;
};

function inScope(session: Session | undefined, accountId: string): boolean {
  return !session || canSeeAccount(session, accountId);
}

function topicOf(ticket: Ticket): { key: string; label: string } {
  const text = `${ticket.subject} ${ticket.description}`.toLowerCase();
  if (/bulk|csv|upload/.test(text)) return { key: "bulk-upload", label: "Bulk upload / CSV failures" };
  if (/api key|credential|exposure|security/.test(text)) return { key: "security", label: "Credential / security incidents" };
  if (/shipment creation|http 500|outage/.test(text)) return { key: "outage", label: "Shipment-creation outages" };
  if (/swiftship|webhook|still shows booked/.test(text)) return { key: "pickup-status", label: "Pickup status mismatches" };
  if (/billing/.test(text)) return { key: "billing", label: "Billing / account administration" };
  if (/cancel/.test(text)) return { key: "cancellation", label: "Cancellation questions" };
  return { key: `subject:${ticket.subject.toLowerCase()}`, label: ticket.subject };
}

const WEAK_MARKERS = new Set([
  "pickup",
  "large",
  "delay",
  "issue",
  "status",
  "known",
  "after",
  "before",
  "still",
  "shows",
  "booked",
  "failures",
  "failure",
  "opened",
  "investigating",
]);

function knownIssueHits(ticket: Ticket) {
  const hay = `${ticket.subject} ${ticket.description}`.toLowerCase();
  return documents.filter((chunk) => {
    if (!/KI-\d+/i.test(`${chunk.section} ${chunk.text}`)) return false;
    if (/resolved/i.test(chunk.section)) return false;
    const markers = chunk.section
      .toLowerCase()
      .replace(/ki-\d+/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !WEAK_MARKERS.has(w));
    return markers.filter((word) => hay.includes(word)).length >= 1;
  });
}

export function detectIssues(session?: Session): { snapshot: string; issues: OpsIssue[] } {
  const scopedTickets = tickets.filter((t) => inScope(session, t.accountId));
  const open = scopedTickets.filter((t) => t.status === "open");
  const issues: OpsIssue[] = [];

  const clusters = new Map<string, Ticket[]>();
  for (const ticket of scopedTickets) {
    const topic = topicOf(ticket);
    const list = clusters.get(topic.key) ?? [];
    list.push(ticket);
    clusters.set(topic.key, list);
  }

  for (const [key, group] of clusters) {
    if (group.length < 2) continue;
    const accounts = [...new Set(group.map((t) => t.accountId))];
    issues.push({
      id: `recurring-${key}`,
      category: "recurring",
      severity: group.some((t) => inferSeverity(t) === "P1") ? "critical" : "watch",
      title: `${group.length} tickets on “${topicOf(group[0]).label}”`,
      whyItMatters:
        "Similar wording across tickets is a signal to treat this as one incident, not isolated how-tos.",
      tickets: group.map((t) => t.ticketId),
      accounts,
      suggestedAction:
        accounts.length > 1
          ? "Brief the team once, then reply from the current product/policy source — not from the oldest ticket."
          : "Check whether this is a repeat of a known product issue before writing a new explanation.",
    });
    if (accounts.length > 1) {
      issues.push({
        id: `cross-${key}`,
        category: "cross_customer",
        severity: "watch",
        title: `“${topicOf(group[0]).label}” is hitting ${accounts.length} customers`,
        whyItMatters: "A pattern that crosses accounts is usually a product or carrier issue, not one tenant’s setup.",
        tickets: group.map((t) => t.ticketId),
        accounts,
        suggestedAction: "Coordinate one workaround and keep each customer’s contract out of the shared reply.",
      });
    }
  }

  const productGroups = new Map<string, { tickets: Ticket[]; label: string }>();
  for (const ticket of scopedTickets) {
    for (const chunk of knownIssueHits(ticket)) {
      const current = productGroups.get(chunk.id) ?? { tickets: [], label: chunk.section };
      if (!current.tickets.some((t) => t.ticketId === ticket.ticketId)) current.tickets.push(ticket);
      productGroups.set(chunk.id, current);
    }
  }
  for (const [id, group] of productGroups) {
    if (group.tickets.length < 1) continue;
    issues.push({
      id: `product-${id}`,
      category: "product",
      severity: "watch",
      title: `Tickets matching ${group.label}`,
      whyItMatters:
        "Several records line up with a current product known issue. Reusing an old ticket’s answer here is how wrong limits get restated.",
      tickets: group.tickets.map((t) => t.ticketId),
      accounts: [...new Set(group.tickets.map((t) => t.accountId))],
      suggestedAction: "Use the current product guide / known-issue text. Historical resolutions stay context only.",
    });
  }

  const slaRows = open
    .map((ticket) => ({ ticket, sla: slaStatus(ticket), severity: inferSeverity(ticket) }))
    .filter((row) => "breached" in row.sla);

  const breached = slaRows.filter((row) => "breached" in row.sla && row.sla.breached);
  if (breached.length) {
    issues.push({
      id: "sla-breach",
      category: "sla",
      severity: "critical",
      title: `${breached.length} ticket(s) already past first-response SLA`,
      whyItMatters: "A breached target has to be stated. Hiding it is worse than an honest escalation.",
      tickets: breached.map((r) => r.ticket.ticketId),
      accounts: [...new Set(breached.map((r) => r.ticket.accountId))],
      suggestedAction: "Escalate now and tell the customer the first-response target was missed.",
    });
  }

  const approaching = slaRows.filter((row) => {
    if (!("breached" in row.sla) || row.sla.breached) return false;
    if (row.severity !== "P1" && row.severity !== "P2") return false;
    return (row.sla.minutesRemaining ?? Number.POSITIVE_INFINITY) <= 60;
  });
  if (approaching.length) {
    issues.push({
      id: "sla-approaching",
      category: "sla",
      severity: "watch",
      title: `${approaching.length} high-severity ticket(s) inside 60 minutes of SLA`,
      whyItMatters: "These are not late yet. They become tomorrow’s breach if the queue stays reactive.",
      tickets: approaching.map((r) => r.ticket.ticketId),
      accounts: [...new Set(approaching.map((r) => r.ticket.accountId))],
      suggestedAction: "Pick these before older P3 how-tos.",
    });
  }

  const p1s = open.filter((t) => inferSeverity(t) === "P1");
  if (p1s.length) {
    issues.push({
      id: "p1-open",
      category: "sla",
      severity: "critical",
      title: `${p1s.length} open P1 incident(s)`,
      whyItMatters: "P1 is a full shipment-creation outage or a credential exposure. A chatbot should not sit on these.",
      tickets: p1s.map((t) => t.ticketId),
      accounts: [...new Set(p1s.map((t) => t.accountId))],
      suggestedAction: "Page on-call and prepare customer comms.",
    });
  }

  const scopedOrders = orders.filter((order) => inScope(session, order.accountId));
  const latePickups = scopedOrders.filter((order) => {
    if (order.status !== "BOOKED" || order.pickupActualAt) return false;
    return hoursBetween(parseIst(order.pickupWindowEnd), SNAPSHOT) > 0;
  });
  if (latePickups.length) {
    issues.push({
      id: "orders-late-pickup",
      category: "orders",
      severity: "watch",
      title: `${latePickups.length} BOOKED order(s) already past the pickup window`,
      whyItMatters:
        "A late BOOKED row can be a failed pickup — or a delayed carrier webhook. Do not credit or close it from the status field alone.",
      tickets: [],
      orders: latePickups.map((o) => o.orderId),
      accounts: [...new Set(latePickups.map((o) => o.accountId))],
      suggestedAction: "Check carrier fault, customer fault, and the account’s credit threshold before promising money.",
    });
  }

  const oddCancels = scopedOrders.filter(
    (order) =>
      Boolean(order.cancellationRequestedAt) && (order.status === "PICKED_UP" || order.status === "DELIVERED"),
  );
  if (oddCancels.length) {
    issues.push({
      id: "orders-cancel-after-move",
      category: "orders",
      severity: "info",
      title: `${oddCancels.length} cancel request(s) after pickup or delivery`,
      whyItMatters: "Those statuses are not cancellable. Treating them as BOOKED is how the desk gives a wrong fee.",
      tickets: [],
      orders: oddCancels.map((o) => o.orderId),
      accounts: [...new Set(oddCancels.map((o) => o.accountId))],
      suggestedAction: "Use return-to-origin after pickup. Delivered shipments stay delivered.",
    });
  }

  const openAccounts = new Set(open.map((t) => t.accountId));
  if (openAccounts.size >= 3) {
    issues.push({
      id: "cross-open-book",
      category: "cross_customer",
      severity: "info",
      title: `Open tickets span ${openAccounts.size} customers`,
      whyItMatters: "The book is not one loud account. Rank by severity and remaining SLA, not by who emailed last.",
      tickets: open.map((t) => t.ticketId),
      accounts: [...openAccounts],
      suggestedAction: "Work P1 and breached SLA first, then product clusters.",
    });
  }

  const wrongClosed = scopedTickets.filter(
    (t) => t.status === "closed" && t.historicalResolution && /told customer/i.test(t.historicalResolution),
  );
  if (wrongClosed.length) {
    issues.push({
      id: "untrusted-history",
      category: "product",
      severity: "info",
      title: "Closed tickets contain incorrect past guidance",
      whyItMatters:
        `Those resolutions are why trust is a product problem. Reusing ${wrongClosed.map((t) => t.ticketId).join(", ")} would repeat a wrong answer.`,
      tickets: wrongClosed.map((t) => t.ticketId),
      accounts: [...new Set(wrongClosed.map((t) => t.accountId))],
      suggestedAction: "Cite the current contract or SOP. Mention the old ticket only as a conflict that loses.",
    });
  }

  const scoped = issues.filter((issue) => issue.tickets.length > 0 || (issue.orders?.length ?? 0) > 0);
  scoped.sort((a, b) => {
    const rank = { critical: 0, watch: 1, info: 2 };
    return rank[a.severity] - rank[b.severity];
  });

  return { snapshot: SNAPSHOT_LABEL, issues: scoped };
}

export function issueSummaryForPrompt(session?: Session): string {
  return detectIssues(session)
    .issues.map((issue) => {
      const names = issue.accounts.map((id) => getAccount(id)?.accountName ?? id).join(", ");
      const extra = issue.orders?.length ? ` orders=${issue.orders.join(",")}` : "";
      return `- ${issue.title} [${issue.severity}/${issue.category}] tickets=${issue.tickets.join(",")}${extra} accounts=${names}`;
    })
    .join("\n");
}
