import type { TrustReport } from "./trust";

export type Role = "customer" | "support" | "csm";
export type Plan = "Enterprise" | "Growth" | "Standard";
export type Severity = "P1" | "P2" | "P3";
export type OrderStatus = "DRAFT" | "BOOKED" | "PICKED_UP" | "DELIVERED";
export type TicketStatus = "open" | "closed";
export type SourceStatus = "current" | "deprecated" | "context";
export type SourceKind =
  | "contract"
  | "policy"
  | "sop"
  | "product_guide"
  | "deprecated_policy";

export type Session = {
  userId: string;
  role: Role;
  accountId: string | null;
  allowedAccounts: "*" | string[];
  displayName: string;
};

export type Account = {
  accountId: string;
  accountName: string;
  plan: Plan;
  status: "active";
  csm: string;
  contractFile: string | null;
  premiumSupport: boolean;
  notes: string;
  cancelBookedNoFee: boolean;
  weekendSupport: boolean;
  aroundTheClockP1: boolean;
  customSla: { p1Minutes: number; p2Minutes: number; p3Minutes: number } | null;
  creditOverride: {
    hoursPastWindow: number;
    amountInr: number;
  } | null;
  monthlyCreditCapInr: number | null;
};

export type Order = {
  orderId: string;
  accountId: string;
  carrier: string;
  status: OrderStatus;
  bookedAt: string;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  pickupActualAt: string | null;
  shipmentFeeInr: number;
  carrierFault: boolean;
  customerFault: boolean;
  cancellationRequestedAt: string | null;
  notes: string;
};

export type Ticket = {
  ticketId: string;
  accountId: string;
  createdAt: string;
  status: TicketStatus;
  subject: string;
  description: string;
  channel: string;
  assignedTo: string;
  lastCustomerMessageAt: string;
  historicalResolution: string | null;
};

export type DocChunk = {
  id: string;
  file: string;
  title: string;
  section: string;
  kind: SourceKind;
  status: SourceStatus;
  authority: number;
  accountId: string | null;
  text: string;
};

export type ActionType = "create_escalation" | "update_ticket" | "create_followup";

export type PendingAction = {
  id: string;
  type: ActionType;
  summary: string;
  reason: string;
  priority?: Severity;
  ticketId?: string;
  orderId?: string;
  accountId: string;
  assignedTo?: string;
  ticketStatus?: TicketStatus;
};

export type DeskRecord = {
  reference: string;
  type: ActionType;
  summary: string;
  accountId: string;
  ticketId?: string;
  orderId?: string;
  confirmedAt: string;
};

export type ToolStep = {
  tool: string;
  label: string;
  args: Record<string, unknown>;
  resultPreview: string;
  status?: "running" | "done";
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentResult = {
  reply: string;
  steps: ToolStep[];
  pendingAction: PendingAction | null;
  trust?: TrustReport;
};
