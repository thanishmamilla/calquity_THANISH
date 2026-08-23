export type TrustReport = {
  winningSources: string[];
  conflicts: string[];
  needsHuman: boolean;
  humanReasons: string[];
  uncertainty: string[];
  retrieved: Array<{
    title: string;
    status: string;
    kind: string;
    guidance: string;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

export function emptyTrust(): TrustReport {
  return {
    winningSources: [],
    conflicts: [],
    needsHuman: false,
    humanReasons: [],
    uncertainty: [],
    retrieved: [],
  };
}

export function buildTrust(results: unknown[]): TrustReport {
  const report = emptyTrust();

  for (const item of results) {
    const row = asRecord(item);
    if (!row) continue;
    const payload = asRecord(row.result) ?? row;

    if (payload.error) {
      report.uncertainty.push(String(payload.message ?? payload.error));
      continue;
    }

    if (Array.isArray(payload.hits)) {
      for (const hit of payload.hits) {
        const h = asRecord(hit);
        if (!h) continue;
        report.retrieved.push({
          title: `${h.title ?? "Document"} · ${h.section ?? ""}`.trim(),
          status: String(h.status ?? "current"),
          kind: String(h.kind ?? "policy"),
          guidance: String(h.guidance ?? h.applicability ?? ""),
        });
        if (h.status === "deprecated") {
          report.uncertainty.push(`${h.title} is deprecated and must not decide a live answer.`);
        }
      }
    }

    const cancellation = asRecord(payload.cancellation);
    if (cancellation) {
      if (cancellation.winningSource) report.winningSources.push(`Cancellation: ${cancellation.winningSource}`);
      if (Array.isArray(cancellation.conflicts)) report.conflicts.push(...cancellation.conflicts.map(String));
    }

    const credit = asRecord(payload.serviceCredit);
    if (credit) {
      if (credit.winningSource) report.winningSources.push(`Credit: ${credit.winningSource}`);
      if (Array.isArray(credit.conflicts)) report.conflicts.push(...credit.conflicts.map(String));
      if (credit.needsHuman) {
        report.needsHuman = true;
        report.humanReasons.push(String(credit.rationale ?? "A human should verify before promising a credit."));
      }
    }

    const sla = asRecord(payload.sla);
    if (sla?.source) report.winningSources.push(`SLA: ${sla.source}`);

    const ticket = asRecord(payload.ticket);
    if (ticket?.trust) {
      report.uncertainty.push(`${ticket.ticketId ?? "Ticket"}: ${ticket.trust}`);
    }

    const late = asRecord(payload.genericLatePickup) ?? asRecord(row.genericLatePickup);
    if (late?.note) report.uncertainty.push(String(late.note));
    if (late?.winningSource) report.winningSources.push(`Credit threshold: ${late.winningSource}`);

    const accountSla = asRecord(payload.accountSla) ?? asRecord(row.accountSla);
    const p1 = asRecord(accountSla?.p1);
    if (p1?.source) report.winningSources.push(`Account P1: ${p1.source}`);

    const terms = asRecord(payload.accountTerms) ?? asRecord(row.accountTerms);
    if (terms && terms.hasCustomContract === false) {
      report.uncertainty.push(
        `${terms.accountName} has no signed agreement in the pack. Use current policy/SOP only — do not borrow another customer's contract.`,
      );
    }
  }

  report.winningSources = unique(report.winningSources);
  report.conflicts = unique(report.conflicts);
  report.humanReasons = unique(report.humanReasons);
  report.uncertainty = unique(report.uncertainty);
  return report;
}

export function hasTrustSignal(report: TrustReport): boolean {
  return (
    report.winningSources.length +
      report.conflicts.length +
      report.humanReasons.length +
      report.uncertainty.length +
      report.retrieved.length >
    0
  );
}
