import { canSeeAccount } from "./access";
import { mentionedAccountIds } from "./account-hints";
import type { DocChunk, Session } from "./types";

/**
 * Section-level index of the candidate data pack.
 * Authority: contract (100) > current policy/SOP (80) > product guide (60) > deprecated (10).
 */
export const documents: DocChunk[] = [
  {
    id: "pol3-precedence",
    file: "01_Support_Policy_v3_CURRENT.pdf",
    title: "Support Policy v3",
    section: "Scope and source precedence",
    kind: "policy",
    status: "current",
    authority: 80,
    accountId: null,
    text: "Status: CURRENT. Effective 1 May 2026. Supersedes Support Policy v2. This policy defines default support severity and response targets. A signed customer agreement may override these defaults. When sources conflict, use the signed customer agreement first, then the current support policy, then current product documentation. Historical tickets and internal notes are context only and may contain incorrect past guidance.",
  },
  {
    id: "pol3-severity",
    file: "01_Support_Policy_v3_CURRENT.pdf",
    title: "Support Policy v3",
    section: "Severity definitions",
    kind: "policy",
    status: "current",
    authority: 80,
    accountId: null,
    text: "P1 Critical: Complete production outage preventing all shipment creation for a customer, confirmed security incident or suspected credential exposure, or another event causing immediate material business risk with no workaround. P2 High: Major feature unavailable or materially degraded for a customer, but core operations remain possible or a workaround exists. P3 Normal: Minor defect, how-to question, configuration request, or issue with limited operational impact.",
  },
  {
    id: "pol3-sla",
    file: "01_Support_Policy_v3_CURRENT.pdf",
    title: "Support Policy v3",
    section: "Default first-response targets",
    kind: "policy",
    status: "current",
    authority: 80,
    accountId: null,
    text: "Default first-response targets. Enterprise: P1 30 minutes 24x7, P2 2 hours, P3 1 business day. Growth: P1 2 business hours, P2 4 business hours, P3 2 business days. Standard: P1 4 business hours, P2 1 business day, P3 2 business days.",
  },
  {
    id: "pol3-escalation",
    file: "01_Support_Policy_v3_CURRENT.pdf",
    title: "Support Policy v3",
    section: "Escalation",
    kind: "policy",
    status: "current",
    authority: 80,
    accountId: null,
    text: "P1 incidents should be escalated immediately. If a response target is already breached, the agent should clearly state the breach and recommend escalation rather than hiding uncertainty.",
  },
  {
    id: "pol2-deprecated",
    file: "02_Support_Policy_v2_DEPRECATED.pdf",
    title: "Support Policy v2",
    section: "Deprecated response targets",
    kind: "deprecated_policy",
    status: "deprecated",
    authority: 10,
    accountId: null,
    text: "Status: DEPRECATED — DO NOT USE FOR CURRENT REQUESTS. Effective 1 January 2025. Superseded by Support Policy v3 effective 1 May 2026. Older targets: Enterprise P1 1 hour, P2 4 hours, P3 2 business days. Growth P1 4 business hours, P2 1 business day, P3 3 business days. Standard P1 8 business hours, P2 2 business days, P3 3 business days. This file is intentionally retained for historical reference and must not be used as current policy.",
  },
  {
    id: "sop-cancel",
    file: "03_Cancellation_and_Service_Credit_SOP_v4.pdf",
    title: "Cancellation & Service Credit SOP v4",
    section: "Order cancellation",
    kind: "sop",
    status: "current",
    authority: 80,
    accountId: null,
    text: "Status: CURRENT. Effective 15 June 2026. DRAFT: may be cancelled with no fee. BOOKED, not yet PICKED_UP: may be cancelled. No fee within 30 minutes of booking. After 30 minutes, charge INR 250 unless a customer agreement explicitly waives the cancellation fee. PICKED_UP: do not cancel; use the return-to-origin workflow if the customer wants the parcel returned. DELIVERED: cannot be cancelled.",
  },
  {
    id: "sop-credit",
    file: "03_Cancellation_and_Service_Credit_SOP_v4.pdf",
    title: "Cancellation & Service Credit SOP v4",
    section: "Failed-pickup service credits",
    kind: "sop",
    status: "current",
    authority: 80,
    accountId: null,
    text: "Under the default policy, a customer is eligible for a service credit when the pickup is more than 2 hours past the end of the scheduled pickup window, the carrier is at fault, and there is no customer-caused issue. The default credit is the lower of INR 500 or 10% of the shipment fee. A signed customer agreement may replace the default delay threshold, credit amount, or cap.",
  },
  {
    id: "sop-approval",
    file: "03_Cancellation_and_Service_Credit_SOP_v4.pdf",
    title: "Cancellation & Service Credit SOP v4",
    section: "Approval and uncertainty",
    kind: "sop",
    status: "current",
    authority: 80,
    accountId: null,
    text: "Any individual credit above INR 1,000 requires manager approval. Do not promise a credit when carrier fault, pickup timing, or customer fault is unknown. When data conflicts, identify the conflict and request verification before a state-changing action.",
  },
  {
    id: "prod-plans",
    file: "04_Product_Operations_Guide_and_Known_Issues.pdf",
    title: "Product Operations Guide",
    section: "Plan capabilities",
    kind: "product_guide",
    status: "current",
    authority: 60,
    accountId: null,
    text: "Updated 14 August 2026. Bulk Upload: available on Growth and Enterprise. Supported file size is up to 5,000 rows per CSV. Standard: Bulk Upload is not included. Shipment status: BOOKED means the shipment is created but ParcelPilot has not yet received a pickup confirmation. PICKED_UP means carrier pickup has been confirmed.",
  },
  {
    id: "prod-ki208",
    file: "04_Product_Operations_Guide_and_Known_Issues.pdf",
    title: "Product Operations Guide",
    section: "KI-208 Bulk Upload failures on large CSVs",
    kind: "product_guide",
    status: "current",
    authority: 60,
    accountId: null,
    text: "KI-208 opened 10 August 2026. Status: Investigating. Some Growth and Enterprise customers experience intermittent failures on CSV uploads above approximately 3,000 rows, even though the supported product limit remains 5,000 rows. Workaround: split the upload into files below 3,000 rows. Individual shipment creation is unaffected.",
  },
  {
    id: "prod-ki211",
    file: "04_Product_Operations_Guide_and_Known_Issues.pdf",
    title: "Product Operations Guide",
    section: "KI-211 SwiftShip pickup webhook delay",
    kind: "product_guide",
    status: "current",
    authority: 60,
    accountId: null,
    text: "KI-211 opened 12 August 2026. Status: Monitoring. SwiftShip pickup confirmation webhooks can arrive up to 20 minutes late. A parcel may physically be collected while ParcelPilot still shows BOOKED. Before telling a customer that a pickup did not occur, verify the carrier status or wait through the known delay window.",
  },
  {
    id: "prod-ki176",
    file: "04_Product_Operations_Guide_and_Known_Issues.pdf",
    title: "Product Operations Guide",
    section: "KI-176 Address validation resolved",
    kind: "product_guide",
    status: "current",
    authority: 60,
    accountId: null,
    text: "KI-176 Address validation: Resolved 18 July 2026. Do not use this resolved issue to explain new incidents unless evidence specifically matches it.",
  },
  {
    id: "ns-sla",
    file: "05_Northstar_Logistics_Enterprise_Agreement.pdf",
    title: "Northstar Logistics Enterprise Agreement",
    section: "Support terms",
    kind: "contract",
    status: "current",
    authority: 100,
    accountId: "ACCT-001",
    text: "Account ACCT-001 Northstar Logistics. Term 1 January 2026 to 31 December 2026. Status ACTIVE. For Northstar Logistics, the following first-response targets replace ParcelPilot's standard support-policy targets: P1 15 minutes 24x7, P2 1 hour, P3 8 business hours.",
  },
  {
    id: "ns-cancel",
    file: "05_Northstar_Logistics_Enterprise_Agreement.pdf",
    title: "Northstar Logistics Enterprise Agreement",
    section: "Shipment cancellation",
    kind: "contract",
    status: "current",
    authority: 100,
    accountId: "ACCT-001",
    text: "Northstar may cancel any BOOKED shipment before pickup with no cancellation fee, regardless of how long ago the shipment was booked. Once a shipment is PICKED_UP, the standard return-to-origin process applies.",
  },
  {
    id: "ns-credit",
    file: "05_Northstar_Logistics_Enterprise_Agreement.pdf",
    title: "Northstar Logistics Enterprise Agreement",
    section: "Service credits",
    kind: "contract",
    status: "current",
    authority: 100,
    accountId: "ACCT-001",
    text: "Monthly aggregate service credits are capped at INR 5,000. Unless this agreement states otherwise, the current ParcelPilot service-credit SOP applies. Dedicated CSM: Priya Mehta.",
  },
  {
    id: "lw-sla",
    file: "06_LumenWorks_Service_Agreement.pdf",
    title: "LumenWorks Service Agreement",
    section: "Support terms",
    kind: "contract",
    status: "current",
    authority: 100,
    accountId: "ACCT-002",
    text: "Account ACCT-002 LumenWorks. Plan Growth. Term 1 March 2026 to 28 February 2027. Status ACTIVE. P1 2 business hours, P2 4 business hours, P3 2 business days. No weekend or after-hours support coverage.",
  },
  {
    id: "lw-cancel",
    file: "06_LumenWorks_Service_Agreement.pdf",
    title: "LumenWorks Service Agreement",
    section: "Cancellation terms",
    kind: "contract",
    status: "current",
    authority: 100,
    accountId: "ACCT-002",
    text: "No special cancellation-fee waiver applies. Use the current ParcelPilot Cancellation & Service Credit SOP.",
  },
  {
    id: "lw-credit",
    file: "06_LumenWorks_Service_Agreement.pdf",
    title: "LumenWorks Service Agreement",
    section: "Failed-pickup credits",
    kind: "contract",
    status: "current",
    authority: 100,
    accountId: "ACCT-002",
    text: "If a pickup is more than 4 hours past the end of the scheduled pickup window, the carrier is at fault, and the customer is not at fault, LumenWorks receives a fixed INR 300 service credit. This clause replaces the default failed-pickup credit amount and timing threshold in the SOP.",
  },
];

const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "is", "it",
  "do", "we", "i", "my", "our", "can", "should", "get", "me", "be", "with",
]);

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function searchDocuments(
  query: string,
  session: Session,
): Array<{ chunk: DocChunk; score: number }> {
  const q = tokens(query);
  const wantsHistory = /deprecated|v2|historical|old policy|superseded/i.test(query);

  return documents
    .filter((chunk) => !chunk.accountId || canSeeAccount(session, chunk.accountId))
    .map((chunk) => {
      const hay = tokens(`${chunk.title} ${chunk.section} ${chunk.text} ${chunk.file}`);
      let score = 0;
      for (const term of q) {
        if (hay.includes(term)) score += 3;
        if (chunk.section.toLowerCase().includes(term)) score += 2;
        if (chunk.text.toLowerCase().includes(term)) score += 1;
      }
      score += chunk.authority / 20;
      if (chunk.status === "deprecated" && !wantsHistory) score -= 25;
      const mentioned = mentionedAccountIds(query);
      if (chunk.kind === "contract" && chunk.accountId) {
        if (mentioned.length && mentioned.includes(chunk.accountId)) score += 16;
        if (mentioned.length && !mentioned.includes(chunk.accountId)) score -= 40;
        if (session.accountId && chunk.accountId === session.accountId) score += 6;
      }
      return { chunk, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
