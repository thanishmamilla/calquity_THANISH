import { NextResponse } from "next/server";
import { canSeeAccount } from "@/lib/access";
import { readSession } from "@/lib/auth";
import { isStaff } from "@/lib/users";
import { getAccount, tickets } from "@/lib/dataset";
import { detectIssues } from "@/lib/issues";
import { inferSeverity, slaStatus } from "@/lib/policy";

export async function GET() {
  const session = await readSession();
  if (!session || !isStaff(session)) {
    return NextResponse.json({ error: "Authorised ParcelPilot staff only." }, { status: 403 });
  }

  const board = detectIssues(session);
  const queue = tickets
    .filter((t) => t.status === "open" && canSeeAccount(session, t.accountId))
    .map((ticket) => ({
      ...ticket,
      accountName: getAccount(ticket.accountId)?.accountName ?? ticket.accountId,
      severity: inferSeverity(ticket),
      sla: slaStatus(ticket),
    }));

  return NextResponse.json({
    ...board,
    queue,
    scope: session.allowedAccounts === "*" ? "all accounts" : session.allowedAccounts,
  });
}
