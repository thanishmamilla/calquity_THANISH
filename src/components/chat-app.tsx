"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle, Shield, Waypoints } from "lucide-react";
import { SNAPSHOT_LABEL } from "@/lib/time";
import { buildTrail } from "@/lib/trace";
import { hasTrustSignal, type TrustReport } from "@/lib/trust";
import type { AgentResult, ChatMessage, DeskRecord, PendingAction, Session, ToolStep } from "@/lib/types";
import { isStaff } from "@/lib/users";
import { jsonHeaders, useSession } from "./session-context";

const CUSTOMER_PROMPTS: Record<string, string[]> = {
  "ACCT-001": [
    "Can we cancel ORD-1001 without a cancellation fee? Explain why.",
    "Can we still cancel ORD-1002 after pickup?",
    "A SwiftShip parcel was collected but still shows BOOKED. Did pickup fail?",
  ],
  "ACCT-002": [
    "A pickup is three hours late because of carrier fault. Should I get a service credit?",
    "Can we cancel ORD-2001 without a fee?",
    "Our bulk upload of about 4,200 rows is failing. Is our plan limited to 3,000 rows?",
  ],
  "ACCT-003": [
    "Can we cancel ORD-3001 without a cancellation fee?",
    "How do we change the billing contact?",
  ],
  "ACCT-004": [
    "Can we cancel ORD-4001?",
    "Please escalate the API key exposure as P1.",
  ],
};

const SUPPORT_PROMPTS = [
  "Which open tickets have already breached SLA?",
  "Can Northstar cancel ORD-1001 without a fee? Cite the winning source.",
  "Escalate TKT-505 — API key exposure — as P1.",
  "Create a follow-up task to send LumenWorks the KI-208 CSV-split workaround.",
  "Update TKT-503 and assign it to Rohit.",
];

const CSM_PROMPTS: Record<string, string[]> = {
  priya: [
    "Can Northstar cancel ORD-1001 without a fee?",
    "What is the SLA status of TKT-505 for Axis Labs?",
    "Show me LumenWorks ORD-2002.",
  ],
  arjun: [
    "A LumenWorks pickup is three hours late. Credit?",
    "Can LumenWorks cancel ORD-2001 without a fee?",
    "Show me Northstar ORD-1001.",
  ],
  neha: [
    "Can Beacon cancel ORD-3001 without a fee?",
    "How do we change the billing contact?",
    "Show me Axis Labs TKT-505.",
  ],
};

function promptsFor(session: Session): string[] {
  if (session.role === "support") return SUPPORT_PROMPTS;
  if (session.role === "csm") return CSM_PROMPTS[session.userId] ?? [];
  return CUSTOMER_PROMPTS[session.accountId ?? ""] ?? [];
}

function roleTitle(session: Session): string {
  if (session.role === "support") return "Ops agent";
  if (session.role === "csm") return "CSM agent";
  return "Support";
}

function scopeLabel(session: Session): string {
  if (session.role === "customer") return `Locked to ${session.accountId}`;
  if (session.allowedAccounts === "*") return "Authorised support · all accounts";
  return `CSM book · ${session.allowedAccounts.join(", ")}`;
}

type UiMessage = ChatMessage & {
  steps?: ToolStep[];
  pendingAction?: PendingAction | null;
  trust?: TrustReport;
};

export default function ChatApp() {
  const router = useRouter();
  const { session, ready, signOut } = useSession();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [deskTick, setDeskTick] = useState(0);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [liveSteps, setLiveSteps] = useState<ToolStep[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ready && !session) router.replace("/");
  }, [ready, router, session]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  if (!ready || !session) return null;

  const prompts = promptsFor(session);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !session || busy) return;
    setError(null);
    setInput("");
    const next: UiMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setBusy(true);
    setLiveSteps([]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await readChatResponse(res, setLiveSteps);
      setPending(data.pendingAction ?? null);
      if (!data.pendingAction) setDeskTick((n) => n + 1);
      setMessages([
        ...next,
        {
          role: "assistant",
          content: data.reply,
          steps: data.steps,
          pendingAction: data.pendingAction,
          trust: data.trust,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
      setLiveSteps([]);
    }
  }

  return (
    <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 md:grid-cols-[280px_1fr]">
      <aside className="border-b border-stone-200 p-5 md:border-r md:border-b-0">
        <Link href="/" className="mono text-xs tracking-[0.18em] text-stone-500 uppercase">
          ParcelPilot
        </Link>
        <h1 className="mt-3 text-2xl" style={{ fontFamily: "var(--font-display)" }}>
          {roleTitle(session)}
        </h1>
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            {isStaff(session) ? <Shield size={16} /> : <Waypoints size={16} />}
            {session.displayName}
          </div>
          <p className="mt-1 text-stone-500">{scopeLabel(session)}</p>
        </div>
        <p className="mono mt-5 text-[11px] text-stone-500">Clock: {SNAPSHOT_LABEL}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
          Tools: 1 document search · 2 data lookup/calc · 3 state change (confirm first)
        </p>
        <div className="mt-6 space-y-2">
          <p className="mono text-[11px] tracking-wide text-stone-500 uppercase">Try</p>
          {prompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => send(prompt)}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-left text-sm text-stone-600 hover:border-orange-300"
            >
              {prompt}
            </button>
          ))}
        </div>
        <DeskLog tick={deskTick} />
        <div className="mt-8 flex gap-3 text-sm">
          {isStaff(session) && (
            <Link href="/ops" className="text-orange-800 underline-offset-2 hover:underline">
              Issues board
            </Link>
          )}
          <button
            onClick={() => {
              signOut();
              router.push("/");
            }}
            className="text-stone-500 hover:text-stone-800"
          >
            Switch user
          </button>
        </div>
      </aside>

      <section className="flex min-h-[70vh] flex-col">
        <div ref={scroller} className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
          {messages.length === 0 && (
            <div className="panel mx-auto max-w-xl rounded-3xl p-6 text-stone-600">
              Each answer can use several tools in sequence — look up an order, identify the
              account, read the agreement, check the SOP, calculate, then decide on an action.
              You will see the tool name while it runs.
            </div>
          )}
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={message.role === "user" ? "ml-auto max-w-2xl" : "max-w-3xl"}>
              {message.role === "user" ? (
                <div className="rounded-3xl bg-stone-900 px-4 py-3 text-stone-50">{message.content}</div>
              ) : (
                <AssistantCard message={message} />
              )}
            </article>
          ))}
          {busy && (
            <div className="max-w-3xl space-y-3">
              <div className="flex items-center gap-2 text-sm text-stone-500">
                <LoaderCircle className="animate-spin" size={16} />
                Using tools…
              </div>
              <StepList steps={liveSteps} live />
              <Trail steps={liveSteps} />
            </div>
          )}
        </div>

        <form
          className="border-t border-stone-200 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          {pending && (
            <div className="mb-3">
              <ConfirmCard
                action={pending}
                headers={jsonHeaders()}
                sessionAccountId={session.accountId}
                onConfirmed={(text) => {
                  setPending(null);
                  setDeskTick((n) => n + 1);
                  setMessages((prev) => [...prev, { role: "assistant", content: text }]);
                }}
                onCancelled={() => {
                  setPending(null);
                  setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: "Cancelled. Nothing was written." },
                  ]);
                }}
              />
            </div>
          )}
          {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
          <div className="flex items-end gap-2 rounded-2xl border border-stone-300 bg-white p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder={pending ? "Type confirm to create it, or cancel to discard…" : "Ask about an order, SLA, credit, or cancellation…"}
              className="min-h-[52px] flex-1 resize-none bg-transparent px-2 py-2 outline-none"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-xl bg-orange-700 px-3 py-3 text-white disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

async function readChatResponse(
  res: Response,
  onStep: (steps: ToolStep[] | ((prev: ToolStep[]) => ToolStep[])) => void,
): Promise<AgentResult> {
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/event-stream")) {
    const data = (await res.json()) as AgentResult & { error?: string };
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  if (!res.body) throw new Error("Empty stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: AgentResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((row) => row.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6)) as {
        type: string;
        step?: ToolStep;
        error?: string;
        reply?: string;
        steps?: ToolStep[];
        pendingAction?: PendingAction | null;
        trust?: TrustReport;
      };
      if (event.type === "step" && event.step) {
        const incoming = event.step;
        onStep((prev) => {
          if (incoming.status === "done") {
            return [...prev.filter((row) => !(row.status === "running" && row.label === incoming.label)), incoming];
          }
          return [...prev, incoming];
        });
      }
      if (event.type === "error") throw new Error(event.error || "Agent failed");
      if (event.type === "done") {
        final = {
          reply: event.reply ?? "",
          steps: event.steps ?? [],
          pendingAction: event.pendingAction ?? null,
          trust: event.trust,
        };
      }
    }
  }

  if (!final) throw new Error("The agent returned no final answer.");
  return final;
}

function StepList({ steps, live }: { steps: ToolStep[]; live?: boolean }) {
  if (!steps.length) return null;
  return (
    <ol className="space-y-1.5">
      {steps.map((step, i) => (
        <li key={`${step.tool}-${i}`} className="flex items-start gap-2 text-sm text-stone-600">
          {live && step.status === "running" ? (
            <LoaderCircle className="mt-0.5 animate-spin" size={14} />
          ) : (
            <span className="mono mt-0.5 text-[11px] text-orange-800">{i + 1}.</span>
          )}
          <span>
            <span className="mono text-[11px] text-stone-400">{step.tool}</span>
            <span className="ml-2">{step.label}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Trail({ steps }: { steps: ToolStep[] }) {
  if (!steps.length) return null;
  const items = buildTrail(steps);
  return (
    <div className="rounded-2xl border-2 border-orange-200 bg-orange-50/70 px-4 py-3">
      <p className="mono text-[11px] tracking-wide text-orange-800 uppercase">Multi-step path</p>
      <ol className="mt-2 space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={item.key} className={item.done ? "text-stone-800" : "text-stone-400"}>
            {i + 1}. {item.done ? "✓" : "·"} {item.title}
          </li>
        ))}
      </ol>
    </div>
  );
}

function AssistantCard({ message }: { message: UiMessage }) {
  return (
    <div className="space-y-3">
      <StepList steps={message.steps ?? []} />
      <Trail steps={message.steps ?? []} />
      <div className="panel rounded-3xl px-5 py-4 leading-relaxed whitespace-pre-wrap">
        {message.content}
      </div>
      {message.trust && hasTrustSignal(message.trust) && <TrustCard report={message.trust} />}
      {message.pendingAction && (
        <p className="mono text-[11px] text-orange-800">Draft prepared — confirm in the bar below or type confirm.</p>
      )}
    </div>
  );
}

function TrustCard({ report }: { report: TrustReport }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm">
      <p className="mono text-[11px] tracking-wide text-stone-500 uppercase">Source reliability</p>
      {report.winningSources.length > 0 && (
        <p className="mt-2 text-stone-800">
          <span className="font-medium">Winning source:</span> {report.winningSources.join(" · ")}
        </p>
      )}
      {report.conflicts.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-600">
          {report.conflicts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {report.uncertainty.length > 0 && (
        <ul className="mt-2 space-y-1 text-stone-600">
          {report.uncertainty.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {report.needsHuman && (
        <p className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-amber-950">
          Human intervention: {report.humanReasons.join(" ")}
        </p>
      )}
      {report.retrieved.some((row) => row.status === "deprecated") && (
        <p className="mt-2 text-stone-500">A deprecated policy was retrieved and must not be used for the live answer.</p>
      )}
    </div>
  );
}

function DeskLog({ tick }: { tick: number }) {
  const [rows, setRows] = useState<DeskRecord[]>([]);

  useEffect(() => {
    fetch("/api/desk")
      .then((res) => (res.ok ? res.json() : { log: [] }))
      .then((data: { log?: DeskRecord[] }) => setRows((data.log ?? []).slice(0, 5)))
      .catch(() => setRows([]));
  }, [tick]);

  if (!rows.length) return null;

  return (
    <div className="mt-6">
      <p className="mono text-[11px] tracking-wide text-stone-500 uppercase">Desk writes</p>
      <ul className="mt-2 space-y-2">
        {rows.map((row) => (
          <li key={row.reference} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs">
            <p className="font-medium text-stone-700">{row.reference}</p>
            <p className="text-stone-500">{row.summary}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConfirmCard({
  action,
  headers,
  sessionAccountId,
  onConfirmed,
  onCancelled,
}: {
  action: PendingAction;
  headers: Record<string, string>;
  sessionAccountId: string | null;
  onConfirmed: (text: string) => void;
  onCancelled?: () => void;
}) {
  const [state, setState] = useState<"idle" | "working" | "done" | "skipped">("idle");
  const [ref, setRef] = useState<string | null>(null);

  if (state === "skipped") {
    return <p className="text-sm text-stone-500">Action left unconfirmed.</p>;
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Action confirmed. Reference {ref}.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
      <p className="mono text-[11px] tracking-wide text-orange-800 uppercase">Needs confirmation</p>
      <p className="mt-1 font-medium">{action.summary}</p>
      <p className="mt-1 text-sm text-stone-600">{action.reason}</p>
      <p className="mono mt-2 text-[11px] text-stone-500">
        Prepared only · {action.type} · {action.priority ?? "unspecified"} · {action.ticketId || action.orderId || action.accountId}
      </p>
      <p className="mt-2 text-xs text-stone-600">Or type confirm / cancel in the chat.</p>
      <div className="mt-3 flex gap-2">
        <button
          disabled={state === "working"}
          onClick={async () => {
            setState("working");
            const res = await fetch("/api/confirm", {
              method: "POST",
              headers,
              body: JSON.stringify({
                actionId: action.id,
                accountId: action.accountId ?? sessionAccountId,
                action,
              }),
            });
            const data = (await res.json()) as { recorded?: { reference: string }; error?: string };
            if (!res.ok) {
              setState("idle");
              onConfirmed(`Could not confirm that action: ${data.error ?? "try again"}.`);
              return;
            }
            setRef(data.recorded?.reference ?? action.id);
            setState("done");
            onConfirmed(
              `Confirmed. ${action.summary} is now recorded as ${data.recorded?.reference ?? "an internal action"}.`,
            );
          }}
          className="rounded-lg bg-orange-800 px-3 py-1.5 text-sm text-white"
        >
          {state === "working" ? "Saving…" : "Confirm action"}
        </button>
        <button
          onClick={async () => {
            await fetch("/api/confirm", { method: "DELETE" });
            setState("skipped");
            onCancelled?.();
          }}
          className="rounded-lg px-3 py-1.5 text-sm text-stone-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
