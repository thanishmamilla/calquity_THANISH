import { NextResponse } from "next/server";
import { confirmAction, getPendingAction, rejectAction } from "@/lib/actions";
import { canSeeAccount } from "@/lib/access";
import { readSession } from "@/lib/auth";
import type { PendingAction } from "@/lib/types";

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ pendingAction: getPendingAction(session.userId) });
}

export async function DELETE() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const cancelled = rejectAction(session.userId);
  return NextResponse.json({ ok: true, cancelled });
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await request.json()) as { actionId?: string; action?: PendingAction };
  const queued = getPendingAction(session.userId);
  const action = body.action ?? queued;
  if (!action) {
    return NextResponse.json({ error: "Nothing is waiting for confirmation." }, { status: 400 });
  }
  if (!canSeeAccount(session, action.accountId)) {
    return NextResponse.json({ error: "You cannot confirm an action outside your role scope." }, { status: 403 });
  }

  const recorded = confirmAction(session.userId, action);
  if ("error" in recorded) {
    return NextResponse.json(recorded, { status: 400 });
  }
  return NextResponse.json({ ok: true, recorded });
}
