import { getAccount, tickets } from "./dataset";
import {
  SNAPSHOT,
  addBusinessMinutes,
  addClockMinutes,
  hoursBetween,
  minutesBetween,
  parseIst,
} from "./time";
import type { Account, Order, Severity, Ticket } from "./types";

const DEFAULT_SLA: Record<
  Account["plan"],
  { p1: number; p2: number; p3: number; p1Clock: boolean }
> = {
  Enterprise: { p1: 30, p2: 120, p3: 9 * 60, p1Clock: true },
  Growth: { p1: 2 * 60, p2: 4 * 60, p3: 2 * 9 * 60, p1Clock: false },
  Standard: { p1: 4 * 60, p2: 9 * 60, p3: 2 * 9 * 60, p1Clock: false },
};

export function inferSeverity(ticket: Ticket): Severity {
  const blob = `${ticket.subject} ${ticket.description}`.toLowerCase();
  if (
    /api key|credential|security|exposure/.test(blob) ||
    /all shipment creation|every user.*http 500|complete production outage/.test(blob)
  ) {
    return "P1";
  }
  if (/bulk upload|major|failing|unavailable|degraded/.test(blob)) return "P2";
  return "P3";
}

export function slaFor(account: Account, severity: Severity): {
  minutes: number;
  clock: "24x7" | "business";
  source: string;
} {
  if (account.customSla) {
    const map = {
      P1: account.customSla.p1Minutes,
      P2: account.customSla.p2Minutes,
      P3: account.customSla.p3Minutes,
    };
    const clock =
      severity === "P1" && account.aroundTheClockP1
        ? "24x7"
        : severity === "P2" && account.accountId === "ACCT-001"
          ? "24x7"
          : "business";
    return {
      minutes: map[severity],
      clock,
      source: `${account.accountName} agreement`,
    };
  }
  const def = DEFAULT_SLA[account.plan];
  const minutes = severity === "P1" ? def.p1 : severity === "P2" ? def.p2 : def.p3;
  const clock = severity === "P1" && def.p1Clock ? "24x7" : "business";
  return {
    minutes,
    clock,
    source: `Support Policy v3 ${account.plan} defaults`,
  };
}

export function slaStatus(ticket: Ticket) {
  const account = getAccount(ticket.accountId);
  if (!account) return { error: "Unknown account" };
  const severity = inferSeverity(ticket);
  const sla = slaFor(account, severity);
  const created = parseIst(ticket.createdAt);
  const due =
    sla.clock === "24x7"
      ? addClockMinutes(created, sla.minutes)
      : addBusinessMinutes(created, sla.minutes);
  const remainingMin = minutesBetween(SNAPSHOT, due);
  return {
    ticketId: ticket.ticketId,
    accountId: account.accountId,
    accountName: account.accountName,
    severity,
    slaMinutes: sla.minutes,
    clock: sla.clock,
    source: sla.source,
    createdAt: ticket.createdAt,
    dueAt: due.toISOString(),
    snapshot: SNAPSHOT.toISOString(),
    breached: remainingMin < 0,
    minutesPastDue: remainingMin < 0 ? Math.round(-remainingMin) : 0,
    minutesRemaining: remainingMin >= 0 ? Math.round(remainingMin) : 0,
  };
}

export function cancellationDecision(order: Order, account: Account) {
  const booked = parseIst(order.bookedAt);
  const requested = order.cancellationRequestedAt
    ? parseIst(order.cancellationRequestedAt)
    : SNAPSHOT;
  const minutesAfterBooking = Math.round(minutesBetween(booked, requested));

  if (order.status === "DELIVERED") {
    return {
      allowed: false,
      feeInr: null,
      workflow: "none",
      minutesAfterBooking,
      winningSource: "Cancellation & Service Credit SOP v4",
      rationale: "DELIVERED shipments cannot be cancelled.",
      conflicts: [],
    };
  }

  if (order.status === "PICKED_UP") {
    return {
      allowed: false,
      feeInr: null,
      workflow: "return_to_origin",
      minutesAfterBooking,
      winningSource: account.cancelBookedNoFee
        ? `${account.accountName} agreement + SOP v4`
        : "Cancellation & Service Credit SOP v4",
      rationale:
        "Shipment is already PICKED_UP. Do not cancel. Use the return-to-origin workflow.",
      conflicts: [],
    };
  }

  if (order.status === "BOOKED" || order.status === "DRAFT") {
    if (order.status === "DRAFT" || account.cancelBookedNoFee) {
      const conflicts = [];
      if (account.cancelBookedNoFee && minutesAfterBooking > 30) {
        conflicts.push(
          "SOP v4 would charge INR 250 after 30 minutes. The signed customer agreement waives that fee for BOOKED shipments before pickup.",
        );
        const stale = tickets.filter(
          (ticket) =>
            ticket.accountId === account.accountId &&
            ticket.historicalResolution &&
            /cancellation fee|250/i.test(`${ticket.subject} ${ticket.historicalResolution}`),
        );
        for (const ticket of stale) {
          conflicts.push(
            `${ticket.ticketId} told the customer: ${ticket.historicalResolution} Historical tickets are context only and are not authoritative.`,
          );
        }
      }
      return {
        allowed: true,
        feeInr: 0,
        workflow: "cancel",
        minutesAfterBooking,
        winningSource: account.cancelBookedNoFee
          ? `${account.accountName} Enterprise Agreement — shipment cancellation`
          : "SOP v4 (DRAFT / within free window)",
        rationale: account.cancelBookedNoFee
          ? `${account.accountName} may cancel any BOOKED shipment before pickup with no fee, regardless of booking age.`
          : "DRAFT or free-cancellation window.",
        conflicts,
      };
    }

    const free = minutesAfterBooking <= 30;
    return {
      allowed: true,
      feeInr: free ? 0 : 250,
      workflow: "cancel",
      minutesAfterBooking,
      winningSource: "Cancellation & Service Credit SOP v4",
      rationale: free
        ? "BOOKED and not picked up. Cancellation requested within 30 minutes of booking, so there is no fee."
        : `BOOKED and not picked up. Cancellation is ${minutesAfterBooking} minutes after booking, so the default INR 250 fee applies. This account has no contractual fee waiver.`,
      conflicts: [],
    };
  }

  return {
    allowed: false,
    feeInr: null,
    workflow: "none",
    minutesAfterBooking,
    winningSource: "SOP v4",
    rationale: `Unhandled status ${order.status}.`,
    conflicts: [],
  };
}

export function creditDecision(order: Order, account: Account) {
  if (order.customerFault) {
    return {
      eligible: false,
      amountInr: 0,
      hoursLate: null,
      winningSource: "SOP v4",
      rationale: "Customer-caused issue — not eligible for a failed-pickup credit.",
      needsHuman: false,
      conflicts: [],
    };
  }

  const windowEnd = parseIst(order.pickupWindowEnd);
  const reference = order.pickupActualAt ? parseIst(order.pickupActualAt) : SNAPSHOT;
  const hoursLate = hoursBetween(windowEnd, reference);
  const threshold = account.creditOverride?.hoursPastWindow ?? 2;

  if (hoursLate <= threshold) {
    return {
      eligible: false,
      amountInr: 0,
      hoursLate: Number(hoursLate.toFixed(2)),
      thresholdHours: threshold,
      winningSource: account.creditOverride
        ? `${account.accountName} agreement (replaces SOP threshold)`
        : "SOP v4 (more than 2 hours past window end)",
      rationale: `Pickup is ${hoursLate.toFixed(2)} hours past the window end. This account requires more than ${threshold} hours.`,
      needsHuman: false,
      conflicts: account.creditOverride
        ? [
            `Default SOP would use a 2-hour threshold. ${account.accountName}'s contract replaces that with ${threshold} hours and a fixed INR ${account.creditOverride.amountInr} credit.`,
          ]
        : [],
    };
  }

  if (!order.carrierFault) {
    return {
      eligible: false,
      amountInr: 0,
      hoursLate: Number(hoursLate.toFixed(2)),
      thresholdHours: threshold,
      winningSource: "SOP v4 — do not promise when fault is unknown",
      rationale:
        "Delay exceeds the threshold, but carrier fault is not confirmed. Do not promise a credit. Escalate for verification.",
      needsHuman: true,
      conflicts: [],
    };
  }

  const defaultAmount = Math.min(500, Math.round(order.shipmentFeeInr * 0.1));
  const amount = account.creditOverride?.amountInr ?? defaultAmount;
  const conflicts = [];
  if (account.creditOverride) {
    conflicts.push(
      `Default SOP credit would be INR ${defaultAmount} (lower of 500 or 10% of INR ${order.shipmentFeeInr}). The signed agreement replaces this with a fixed INR ${account.creditOverride.amountInr}.`,
    );
  }

  return {
    eligible: true,
    amountInr: amount,
    hoursLate: Number(hoursLate.toFixed(2)),
    thresholdHours: threshold,
    monthlyCapInr: account.monthlyCreditCapInr,
    managerApprovalRequired: amount > 1000,
    winningSource: account.creditOverride
      ? `${account.accountName} agreement — failed-pickup credits`
      : "SOP v4 default credit (lower of INR 500 or 10% of shipment fee)",
    rationale: `Pickup is ${hoursLate.toFixed(2)} hours past window end, carrier is at fault, customer is not at fault.`,
    needsHuman: amount > 1000,
    conflicts,
  };
}
