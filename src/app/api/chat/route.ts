import { NextResponse } from "next/server";
import { confirmAction, getPendingAction, rejectAction } from "@/lib/actions";
import { runAgent } from "@/lib/agent";
import { readSession } from "@/lib/auth";
import { isConfirmReply, isRejectReply } from "@/lib/intent";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonResult(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return jsonResult({ error: "Sign in as a customer or staff member first." }, 401);
  }

  const body = (await request.json()) as { messages?: ChatMessage[] };
  const messages = body.messages ?? [];
  if (!messages.length) {
    return jsonResult({ error: "messages required" }, 400);
  }

  const latest = messages[messages.length - 1];
  const text = latest?.content ?? "";

  if (latest?.role === "user" && isRejectReply(text) && getPendingAction(session.userId)) {
    const cancelled = rejectAction(session.userId);
    return jsonResult({
      reply: cancelled
        ? `Cancelled. “${cancelled.summary}” was discarded and nothing was written.`
        : "There was nothing waiting to cancel.",
      steps: [{ tool: "propose_action", label: "3 · Write cancelled", args: {}, resultPreview: "discarded" }],
      pendingAction: null,
    });
  }

  if (latest?.role === "user" && isConfirmReply(text) && getPendingAction(session.userId)) {
    const recorded = confirmAction(session.userId);
    if ("error" in recorded) {
      return jsonResult({ reply: recorded.error, steps: [], pendingAction: null });
    }
    return jsonResult({
      reply: `Confirmed. ${recorded.summary} is now on the desk as ${recorded.reference}.`,
      steps: [
        {
          tool: "propose_action",
          label: "3 · Write confirmed",
          args: { reference: recorded.reference },
          resultPreview: recorded.reference,
        },
      ],
      pendingAction: null,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        const result = await runAgent(session, messages, (step) => send({ type: "step", step }));
        send({ type: "done", ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Agent failed";
        send({ type: "error", error: message });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
