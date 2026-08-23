"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { IssueCategory, OpsIssue } from "@/lib/issues";
import { SNAPSHOT_LABEL } from "@/lib/time";
import { isStaff } from "@/lib/users";
import { jsonHeaders, useSession } from "./session-context";

type QueueRow = {
  ticketId: string;
  accountId: string;
  accountName: string;
  subject: string;
  severity: string;
  sla: {
    breached?: boolean;
    minutesPastDue?: number;
    minutesRemaining?: number;
    source?: string;
  };
};

const SECTIONS: Array<{ id: IssueCategory; heading: string; brief: string }> = [
  {
    id: "recurring",
    heading: "Similar complaints clustering",
    brief: "Repeated wording across tickets — treat as one incident, not isolated how-tos.",
  },
  {
    id: "product",
    heading: "Same product issue, multiple tickets",
    brief: "Tickets that line up with a current known issue, plus old answers that must not be reused.",
  },
  {
    id: "sla",
    heading: "High-severity SLA risk",
    brief: "P1s and first-response targets that are already late or about to be.",
  },
  {
    id: "orders",
    heading: "Unusual order activity",
    brief: "Late BOOKED pickups, cancel-after-pickup, and other rows that are not the happy path.",
  },
  {
    id: "cross_customer",
    heading: "More than one customer at once",
    brief: "The same pattern showing up across accounts.",
  },
];

export default function OpsBoard() {
  const router = useRouter();
  const { session, ready } = useSession();
  const [issues, setIssues] = useState<OpsIssue[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && (!session || !isStaff(session))) router.replace("/");
  }, [ready, router, session]);

  useEffect(() => {
    if (!session || !isStaff(session)) return;
    fetch("/api/issues", { headers: jsonHeaders() })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setIssues(data.issues);
        setQueue(data.queue);
      })
      .catch((err: Error) => setError(err.message));
  }, [session]);

  if (!ready || !session) return null;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mono text-xs tracking-[0.18em] text-stone-500 uppercase">Internal only</p>
          <h1 className="mt-2 text-4xl" style={{ fontFamily: "var(--font-display)" }}>
            What deserves attention
          </h1>
          <p className="mt-2 max-w-2xl text-stone-600">
            Proactive scan of tickets and orders at {SNAPSHOT_LABEL}. Scoped to this user&apos;s
            book. No model — rules over the pack.
          </p>
        </div>
        <Link href="/chat" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm">
          Back to agent
        </Link>
      </div>

      {error && <p className="mt-6 text-red-700">{error}</p>}

      <div className="mt-8 space-y-10">
        {SECTIONS.map((section) => {
          const rows = issues.filter((issue) => issue.category === section.id);
          return (
            <section key={section.id}>
              <h2 className="text-2xl" style={{ fontFamily: "var(--font-display)" }}>
                {section.heading}
              </h2>
              <p className="mt-1 text-sm text-stone-500">{section.brief}</p>
              <div className="mt-4 grid gap-4">
                {rows.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500">
                    Nothing in this bucket for the current snapshot.
                  </p>
                )}
                {rows.map((issue) => (
                  <article key={issue.id} className="panel rounded-3xl p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityPill value={issue.severity} />
                      <h3 className="text-lg font-medium">{issue.title}</h3>
                    </div>
                    <p className="mt-2 text-stone-600">{issue.whyItMatters}</p>
                    <p className="mt-3 text-sm text-stone-700">
                      <span className="font-medium">Do next:</span> {issue.suggestedAction}
                    </p>
                    <p className="mono mt-3 text-[11px] text-stone-500">
                      {[...issue.tickets, ...(issue.orders ?? [])].join(" · ")}
                      {issue.accounts.length ? ` — ${issue.accounts.join(", ")}` : ""}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <h2 className="mt-10 text-2xl" style={{ fontFamily: "var(--font-display)" }}>
        Open queue
      </h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Ticket</th>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 font-medium">Sev</th>
              <th className="px-4 py-3 font-medium">SLA</th>
              <th className="px-4 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((row) => (
              <tr key={row.ticketId} className="border-t border-stone-100">
                <td className="mono px-4 py-3">{row.ticketId}</td>
                <td className="px-4 py-3">{row.accountName}</td>
                <td className="px-4 py-3">{row.subject}</td>
                <td className="px-4 py-3">{row.severity}</td>
                <td className="px-4 py-3">
                  {row.sla.breached
                    ? `Breached by ${row.sla.minutesPastDue} min`
                    : `${row.sla.minutesRemaining} min left`}
                </td>
                <td className="px-4 py-3 text-stone-500">{row.sla.source ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function SeverityPill({ value }: { value: OpsIssue["severity"] }) {
  const cls =
    value === "critical"
      ? "bg-red-100 text-red-800"
      : value === "watch"
        ? "bg-amber-100 text-amber-800"
        : "bg-stone-100 text-stone-600";
  return <span className={`mono rounded-full px-2 py-0.5 text-[11px] uppercase ${cls}`}>{value}</span>;
}
