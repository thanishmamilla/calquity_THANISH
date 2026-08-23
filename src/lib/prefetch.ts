import { canSeeAccount } from "./access";
import { mentionedAccountIds } from "./account-hints";
import { getAccount, tickets } from "./dataset";
import { slaFor, slaStatus } from "./policy";
import { SNAPSHOT_LABEL } from "./time";
import { describeToolUse } from "./trace";
import { runTool } from "./tools";
import type { Session, ToolStep } from "./types";

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.toUpperCase()))];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

const HOUR_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function hoursLateMentioned(text: string): number | null {
  const digit = text.match(/(\d+(?:\.\d+)?)\s*-?\s*hours?\b/i);
  if (digit && /late|past|delay|credit/i.test(text)) return Number(digit[1]);
  const word = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+hours?\b/i);
  if (word && /late|past|delay|credit/i.test(text)) return HOUR_WORDS[word[1].toLowerCase()] ?? null;
  return null;
}

function visibleTicketsMatching(session: Session, pattern: RegExp) {
  return tickets.filter(
    (ticket) =>
      canSeeAccount(session, ticket.accountId) &&
      pattern.test(`${ticket.subject} ${ticket.description} ${ticket.historicalResolution ?? ""}`),
  );
}

async function runAndTrace(
  name: string,
  args: Record<string, unknown>,
  session: Session,
  onStep?: (step: ToolStep) => void,
): Promise<{ step: ToolStep; result: unknown }> {
  const running: ToolStep = {
    tool: name,
    label: describeToolUse(name, args),
    args,
    resultPreview: "running",
    status: "running",
  };
  onStep?.(running);
  const output = await runTool(name, args, session);
  const done: ToolStep = { ...output.step, label: running.label, status: "done" };
  onStep?.(done);
  return { step: done, result: output.result };
}

export async function prefetchGrounding(
  session: Session,
  userText: string,
  onStep?: (step: ToolStep) => void,
): Promise<{ steps: ToolStep[]; grounding: string; facts: unknown[] }> {
  const steps: ToolStep[] = [];
  const facts: unknown[] = [];
  const orderIds = unique(userText.match(/ORD-\d+/gi) ?? []);
  const ticketIds = unique(userText.match(/TKT-\d+/gi) ?? []);
  const seenTickets = new Set(ticketIds);
  const accountsHinted = mentionedAccountIds(userText);
  const wantsCancel = /cancel/i.test(userText);
  const wantsCredit = /credit|late|hours past/i.test(userText);
  const wantsSla = /\bsla\b|first.?response|p1|p2|p3/i.test(userText);
  const wantsBreaches = /breach|missed sla|already.*sla|which open ticket/i.test(userText);
  const hours = hoursLateMentioned(userText);
  const knownAccounts = new Set<string>([
    ...accountsHinted,
    ...(session.accountId ? [session.accountId] : []),
  ]);

  const add = async (name: string, args: Record<string, unknown>) => {
    const row = await runAndTrace(name, args, session, onStep);
    steps.push(row.step);
    facts.push({ tool: name, args, result: row.result });
    return row.result;
  };

  const addTicket = async (ticketId: string) => {
    if (seenTickets.has(ticketId)) return;
    seenTickets.add(ticketId);
    const result = asRecord(await add("lookup_data", { action: "sla", ticket_id: ticketId }));
    const account = asRecord(result?.account);
    if (typeof account?.accountId === "string") knownAccounts.add(account.accountId);
  };

  for (const orderId of orderIds) {
    const result = asRecord(await add("lookup_data", { action: "lookup", order_id: orderId }));
    const account = asRecord(result?.account);
    if (typeof account?.accountId === "string") knownAccounts.add(account.accountId);
  }

  for (const ticketId of ticketIds) {
    await addTicket(ticketId);
  }

  if (wantsBreaches) {
    const breached = tickets
      .filter((ticket) => ticket.status === "open" && canSeeAccount(session, ticket.accountId))
      .map((ticket) => slaStatus(ticket))
      .filter((row): row is Extract<ReturnType<typeof slaStatus>, { ticketId: string }> =>
        "ticketId" in row && "breached" in row && Boolean(row.breached),
      );
    facts.push({ slaBreaches: breached });
    for (const row of breached) await addTicket(row.ticketId);
  }

  const topicSearches: Array<{ pattern: RegExp; query: string; ticketPattern?: RegExp }> = [
    { pattern: /bulk|csv|upload|3000|3,000|5000|5,000/i, query: "bulk upload row limit known issue", ticketPattern: /bulk upload|csv/i },
    { pattern: /swiftship|still shows booked|webhook|driver picked/i, query: "pickup webhook delay booked status known issue", ticketPattern: /swiftship|webhook/i },
    { pattern: /billing contact/i, query: "change billing contact procedure" },
    { pattern: /deprecated|policy v2|\bv2\b/i, query: "deprecated support policy do not use" },
    { pattern: /api key|credential|exposure/i, query: "credential exposure severity escalation", ticketPattern: /api key|credential|exposure/i },
  ];

  for (const topic of topicSearches) {
    if (!topic.pattern.test(userText)) continue;
    await add("search_documents", { query: topic.query });
    if (topic.ticketPattern) {
      for (const ticket of visibleTicketsMatching(session, topic.ticketPattern)) {
        await addTicket(ticket.ticketId);
      }
    }
  }

  const visibleAccounts = [...knownAccounts].filter((accountId) => {
    const account = getAccount(accountId);
    return Boolean(account && canSeeAccount(session, accountId));
  });

  for (const accountId of visibleAccounts) {
    const account = getAccount(accountId);
    if (!account) continue;
    if (wantsCancel) {
      await add("search_documents", {
        query: account.contractFile
          ? `${account.accountName} ${accountId} cancellation fee BOOKED agreement SOP`
          : `${account.accountName} ${accountId} cancellation fee BOOKED SOP current policy`,
      });
    }
    if (wantsCredit) {
      await add("search_documents", {
        query: account.contractFile
          ? `${account.accountName} ${accountId} failed pickup service credit hours threshold SOP agreement`
          : `${account.accountName} ${accountId} failed pickup service credit hours threshold SOP`,
      });
    }
    if (wantsSla) {
      await add("search_documents", {
        query: account.contractFile
          ? `${account.accountName} ${accountId} current support policy first-response targets agreement`
          : `${account.accountName} ${accountId} current support policy first-response targets`,
      });
      facts.push({
        accountSla: {
          accountId: account.accountId,
          accountName: account.accountName,
          plan: account.plan,
          hasCustomContract: Boolean(account.contractFile),
          p1: slaFor(account, "P1"),
          p2: slaFor(account, "P2"),
          p3: slaFor(account, "P3"),
        },
      });
    }
    facts.push({
      accountTerms: {
        accountId: account.accountId,
        accountName: account.accountName,
        plan: account.plan,
        hasCustomContract: Boolean(account.contractFile),
        cancelBookedNoFee: account.cancelBookedNoFee,
        creditThresholdHours: account.creditOverride?.hoursPastWindow ?? 2,
        creditAmount: account.creditOverride?.amountInr ?? null,
        creditUsesSopDefault: !account.creditOverride,
      },
    });
  }

  if (wantsCancel && visibleAccounts.length === 0) {
    await add("search_documents", { query: "cancellation fee BOOKED SOP customer agreement waiver" });
  }
  if (wantsCredit && visibleAccounts.length === 0) {
    await add("search_documents", { query: "failed pickup service credit hours threshold SOP agreement" });
  }
  if (wantsSla && visibleAccounts.length === 0) {
    await add("search_documents", { query: "current support policy first-response targets severity" });
  }

  if (!orderIds.length && hours !== null && wantsCredit) {
    const accountId =
      session.role === "customer"
        ? session.accountId
        : accountsHinted[0] ?? session.accountId;
    const account = accountId ? getAccount(accountId) : undefined;
    if (account && canSeeAccount(session, account.accountId)) {
      const threshold = account.creditOverride?.hoursPastWindow ?? 2;
      facts.push({
        genericLatePickup: {
          snapshot: SNAPSHOT_LABEL,
          accountId: account.accountId,
          accountName: account.accountName,
          hoursClaimed: hours,
          thresholdHours: threshold,
          hoursExceedThreshold: hours > threshold,
          winningSource: account.creditOverride
            ? `${account.accountName} agreement replaces the SOP threshold`
            : "Current SOP default threshold",
          note: "No order id was given. Do not invent an order. Ask which order if a credit amount is needed. Carrier fault and customer fault still matter.",
        },
      });
    }
  }

  if (!steps.length && !facts.length) {
    return { steps, grounding: "", facts };
  }

  return {
    steps,
    facts,
    grounding: [
      "SERVER GROUNDING — retrieved from the data pack for this signed-in user.",
      "Treat not_found / access_denied as unavailable. Do not substitute another customer's record.",
      "A signed agreement applies only to the account named on it. If hasCustomContract is false, use the current policy and SOP only.",
      JSON.stringify(facts, null, 2),
    ].join("\n"),
  };
}
