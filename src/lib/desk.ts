import { canSeeAccount } from "./access";
import { getTicket } from "./dataset";
import type { ActionType, DeskRecord, PendingAction, Session } from "./types";

export type Escalation = DeskRecord & {
  type: "create_escalation";
  priority?: string;
  reason: string;
};

export type FollowUp = DeskRecord & {
  type: "create_followup";
  reason: string;
  owner: string;
};

const escalations: Escalation[] = [];
const followUps: FollowUp[] = [];
const log: DeskRecord[] = [];
let seq = 100;

function nextRef(type: ActionType): string {
  seq += 1;
  if (type === "create_escalation") return `ESC-${seq}`;
  if (type === "create_followup") return `TSK-${seq}`;
  return `TKTUPD-${seq}`;
}

export function applyDeskAction(action: PendingAction): DeskRecord {
  const reference = nextRef(action.type);
  const confirmedAt = new Date().toISOString();
  const base: DeskRecord = {
    reference,
    type: action.type,
    summary: action.summary,
    accountId: action.accountId,
    ticketId: action.ticketId,
    orderId: action.orderId,
    confirmedAt,
  };

  if (action.ticketId) {
    const ticket = getTicket(action.ticketId);
    if (ticket) {
      if (action.type === "create_escalation") {
        ticket.assignedTo = action.assignedTo || "Escalations";
      }
      if (action.type === "update_ticket") {
        if (action.assignedTo) ticket.assignedTo = action.assignedTo;
        if (action.ticketStatus) ticket.status = action.ticketStatus;
      }
    }
  }

  if (action.type === "create_escalation") {
    escalations.unshift({
      ...base,
      type: "create_escalation",
      priority: action.priority,
      reason: action.reason,
    });
  }

  if (action.type === "create_followup") {
    followUps.unshift({
      ...base,
      type: "create_followup",
      reason: action.reason,
      owner: action.assignedTo || "unassigned",
    });
  }

  log.unshift(base);
  return base;
}

export function listDesk(session: Session) {
  const visible = (row: { accountId: string }) => canSeeAccount(session, row.accountId);
  return {
    escalations: escalations.filter(visible),
    followUps: followUps.filter(visible),
    log: log.filter(visible),
  };
}
