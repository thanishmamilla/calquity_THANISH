import { NextResponse } from "next/server";
import { clearSession, readSession, writeSession } from "@/lib/auth";

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json(session);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const session = await writeSession(body.userId);
  if (!session) return NextResponse.json({ error: "Unknown user." }, { status: 401 });
  return NextResponse.json(session);
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}

