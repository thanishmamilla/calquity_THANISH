import {
  GoogleGenerativeAI,
  SchemaType,
  type Content,
  type FunctionDeclaration,
} from "@google/generative-ai";
import { rejectAction } from "./actions";
import { userRequestedWrite } from "./intent";
import { issueSummaryForPrompt } from "./issues";
import { SNAPSHOT_LABEL } from "./time";
import { prefetchGrounding } from "./prefetch";
import { describeToolUse } from "./trace";
import { buildTrust } from "./trust";
import { runTool } from "./tools";
import type { AgentResult, ChatMessage, PendingAction, Session, ToolStep } from "./types";

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"];

const tools: FunctionDeclaration[] = [
  {
    name: "search_documents",
    description:
      "Tool 1 — Document search/retrieval. Search policies, agreements, product documentation, SOPs, and other supplied documents. Use this for policy, SLA, cancellation rules, credits, and known issues.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: "Natural-language search query, including customer or topic names.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "lookup_data",
    description:
      "Tool 2 — Structured-data lookup or calculation. Query accounts, orders, and tickets, or calculate cancellation fees, service credits, and SLA remaining. For cancel questions use action=cancellation. For credits use action=service_credit. Staff can also list_escalations or list_followups after a write.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        action: {
          type: SchemaType.STRING,
          description:
            "get_account | get_order | get_ticket | list_orders | list_tickets | list_accounts | cancellation | service_credit | sla | lookup",
        },
        order_id: { type: SchemaType.STRING, description: "e.g. ORD-1001" },
        ticket_id: { type: SchemaType.STRING, description: "e.g. TKT-501" },
        account_id: {
          type: SchemaType.STRING,
          description: "Internal users only. Customers are locked to their own account.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "propose_action",
    description:
      "Tool 3 — State-changing action (mocked locally). Use when the user asked to create an escalation, update a ticket, or create a follow-up task. This only prepares the write. The UI must confirm before anything is saved. Do not use for 'can we / should I / explain why' questions.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        action_type: {
          type: SchemaType.STRING,
          description: "create_escalation | update_ticket | create_followup",
        },
        summary: { type: SchemaType.STRING, description: "Short action title" },
        reason: { type: SchemaType.STRING, description: "Why this action is needed" },
        priority: { type: SchemaType.STRING, description: "P1 | P2 | P3" },
        ticket_id: { type: SchemaType.STRING },
        order_id: { type: SchemaType.STRING },
        account_id: { type: SchemaType.STRING },
        assigned_to: { type: SchemaType.STRING, description: "New assignee for ticket updates or follow-ups" },
        ticket_status: { type: SchemaType.STRING, description: "open | closed — only for update_ticket" },
      },
      required: ["action_type", "summary", "reason"],
    },
  },
];

function systemPrompt(session: Session): string {
  const scope =
    session.allowedAccounts === "*"
      ? "every ParcelPilot account"
      : session.allowedAccounts.join(", ");
  const who =
    session.role === "customer"
      ? `You are a customer-facing ParcelPilot support agent. The signed-in customer is ${session.displayName} (${session.accountId}). Never reveal other customers' orders, tickets, contracts, or account details. If a lookup returns not_found, treat that record as unavailable — do not guess that it belongs to someone else. Never apply another account's contract to this customer.`
      : session.role === "csm"
        ? `You are a ParcelPilot CSM assistant for ${session.displayName}. You may only access assigned accounts: ${scope}. If asked about any other customer, say it is not on this CSM book and do not invent their data.`
        : `You are an internal ParcelPilot support/operations agent. The signed-in staff member is ${session.displayName}. You may inspect any account, but still cite sources and do not invent data. Never apply one customer's contract to another.`;

  return `${who}

Dataset snapshot (treat this as now): ${SNAPSHOT_LABEL}. Sunday. Business-hours SLAs do not tick over the weekend; 24x7 P1 clocks do.

Source authority — follow this even if a retrieved ticket disagrees:
1. Signed customer agreement for THAT account
2. Current Support Policy v3 and Cancellation/Service Credit SOP v4
3. Current product operations guide and open known issues
4. Historical tickets: context only, often wrong
5. Support Policy v2: deprecated, never use for a live answer

Rules:
- Use tools. Do not guess order status, fees, credits, or SLAs.
- A contract applies only to the account named on that contract. If an account has no signed agreement in the pack, use the current policy and SOP only.
- If SERVER GROUNDING is present, treat those retrieved rows and calculations as the source of truth. Do not override them with another customer's terms, a deprecated policy, or an old ticket.
- If sources conflict, say so, name the winning source, and mention the losing one.
- Do not promise a service credit when carrier fault, timing, or customer fault is unknown.
- Credits above INR 1,000 need manager approval.
- How-to questions not covered in the pack (for example changing a billing contact) must be escalated. Say you do not have that procedure.
- P1 (full shipment-creation outage, credential exposure) should be escalated immediately. If SLA is already breached, say it is breached.
- For product limits, known issues, and how-to procedures, use search_documents. If nothing in the pack covers the question, say so and escalate — do not invent steps.
- "Can we / should I / is it allowed / explain why" is an informational question. Answer it. Do not call propose_action. Do not ask them to confirm an action.
- Call propose_action only if they explicitly asked to escalate, update a ticket, create a follow-up, or please cancel. Use the correct ticket/order id from lookup_data, never a nearby unrelated ticket.
- Multi-step is required. For an order, ticket, cancellation, credit, or SLA question, use several tools before answering: look up the order or ticket, identify the account, search_documents for that customer's agreement, search_documents for the current SOP or policy, then calculate. Do not answer those from memory in one shot.
- For cancellation questions: lookup_data action=cancellation with the order_id, and search_documents for that customer's agreement plus SOP v4. Then decide if any action is needed.
- For credit questions: lookup_data action=service_credit. If they did not name an order, say eligibility depends on the account's contract and ask which order. Do not invent a credit.
- After a real propose_action, say it is staged and they must confirm in the card. Do not claim it is done.
- For eligibility questions, write a full answer with: verdict (yes/no + fee or credit), winning source, any conflicting SOP or old ticket and why it loses, and a short next step (no confirm card).
- Answer in clear prose. Cite the file or agreement section. Use INR.

Current ops signals (already scoped to this user's accounts):
${issueSummaryForPrompt(session)}`;
}

function toHistory(messages: ChatMessage[]): Content[] {
  const trimmed = messages.slice(-8, -1).filter((m) => m.content.trim());
  const history: Content[] = trimmed.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
  while (history.length && history[0].role !== "user") history.shift();
  const compact: Content[] = [];
  for (const item of history) {
    const last = compact[compact.length - 1];
    if (last && last.role === item.role) {
      last.parts = [...last.parts, ...item.parts];
    } else {
      compact.push(item);
    }
  }
  return compact;
}

function asPlainObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }
  return { result: value ?? null };
}

export async function runAgent(
  session: Session,
  messages: ChatMessage[],
  onStep?: (step: ToolStep) => void,
): Promise<AgentResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing. Add it to .env.local.");
  }

  const latest = messages[messages.length - 1];
  if (!latest || latest.role !== "user") {
    throw new Error("The last message must be from the user.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError: unknown;
  for (const modelName of MODELS) {
    try {
      return await runWithModel(genAI, modelName, session, messages, latest.content, onStep);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini request failed.");
}

async function runWithModel(
  genAI: GoogleGenerativeAI,
  modelName: string,
  session: Session,
  messages: ChatMessage[],
  userText: string,
  onStep?: (step: ToolStep) => void,
): Promise<AgentResult> {
  const allowWrite = userRequestedWrite(userText);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt(session),
    tools: [{ functionDeclarations: tools }],
  });

  const prefetched = await prefetchGrounding(session, userText, onStep);
  const grounded = prefetched.grounding
    ? `${userText}\n\n${prefetched.grounding}`
    : userText;
  const contents: Content[] = [
    ...toHistory(messages),
    { role: "user", parts: [{ text: grounded }] },
  ];
  let result = await model.generateContent({ contents });
  const steps: ToolStep[] = [...prefetched.steps];
  const collected: unknown[] = [...prefetched.facts];
  let pendingAction: PendingAction | null = null;

  for (let i = 0; i < 8; i += 1) {
    const calls = result.response.functionCalls() ?? [];
    if (!calls.length) break;

    const modelParts = result.response.candidates?.[0]?.content?.parts?.length
      ? result.response.candidates[0].content.parts
      : calls.map((call) => ({ functionCall: { name: call.name, args: call.args } }));
    contents.push({ role: "model", parts: modelParts });

    const responseParts = [];
    const textResults: unknown[] = [];
    for (const call of calls) {
      const args = (call.args ?? {}) as Record<string, unknown>;
      const running: ToolStep = {
        tool: call.name,
        label: describeToolUse(call.name, args),
        args,
        resultPreview: "running",
        status: "running",
      };
      onStep?.(running);
      const output = await runTool(call.name, args, session);
      collected.push(output.result);
      const done: ToolStep = { ...output.step, label: running.label, status: "done" };
      steps.push(done);
      onStep?.(done);
      if (output.pendingAction) {
        if (allowWrite) pendingAction = output.pendingAction;
        else {
          rejectAction(session.userId);
          output.result = {
            error: "not_staged",
            message:
              "The user asked a question, not a write. Do not prepare an action. Answer the question only.",
          };
        }
      }
      const payload = asPlainObject(output.result);
      textResults.push({ tool: call.name, args, result: payload });
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: payload,
        },
      });
    }

    contents.push({ role: "user", parts: responseParts });
    try {
      result = await model.generateContent({ contents });
    } catch {
      contents[contents.length - 1] = {
        role: "user",
        parts: [
          {
            text: `Tool results (use these; do not call the same tools again unless needed):\n${JSON.stringify(textResults, null, 2)}`,
          },
        ],
      };
      result = await model.generateContent({ contents });
    }
  }

  let reply = result.response.text()?.trim() || "I could not produce an answer. Please try again.";
  if (pendingAction) {
    const ask =
      "Nothing has been written yet. Reply confirm to create this, or cancel to discard.";
    if (!/reply confirm|click confirm|awaiting confirmation/i.test(reply)) {
      reply = `${reply}\n\n${ask}`;
    }
  }
  return { reply, steps, pendingAction, trust: buildTrust(collected) };
}
