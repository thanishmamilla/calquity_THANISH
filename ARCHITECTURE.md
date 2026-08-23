# Architecture note

## Agent design

One Gemini tool-calling agent, two permission contexts.

- **Customer** — one `accountId`. Other tenants' orders, tickets, and contracts come back as not found.
- **CSM** — only assigned accounts (Priya: Northstar + Axis; Arjun: LumenWorks; Neha: Beacon).
- **Support** — all accounts plus the issues board.

The browser does not choose the role. Login writes an httpOnly `pp_uid` cookie; every tool and API looks up that user on the server. Changing request headers cannot widen access.

The model never sees the raw workbook. It only sees tool results after the server has applied access control and source ranking. Conversation history is previous user/assistant text; tool traces are not replayed as Gemini function history.

The system prompt states source precedence and the frozen snapshot time. Those rules are also implemented in code so a confident model cannot silently use Policy v2 or another customer’s contract.

Models tried in order: `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-flash-latest`.

## Tool design

1. **`search_documents`** — document search/retrieval over the six PDFs. Each chunk carries `kind`, `status`, `authority`, and optional `accountId`. Scoring is keyword overlap plus an authority boost. Deprecated Policy v2 is heavily penalised unless the query asks for history. Other customers’ contracts are hidden from customer sessions.

2. **`lookup_data`** — structured lookup and calculation on accounts, orders, and tickets (fees, credits, SLA). After a write, staff can also list mocked escalations and follow-ups. Historical ticket resolutions come back labelled *context only, may be incorrect*.

3. **`propose_action`** — the state-changing tool. It can create an escalation, update a ticket (assignee/status), or create a follow-up task. The tool only *prepares* a draft. Nothing is written until the user clicks Confirm or types `confirm`. `cancel` discards the draft. Confirmed rows appear in the desk log.

These are three distinct tools the model must choose between. Multi-step questions use several of them in one turn. The chat UI streams each tool as it runs and shows a six-point trail: order, account, agreement, policy/SOP, calculation, action decision.

## Document and structured-data handling

The PDFs are one page each. A hosted vector database would add cost and another moving part without improving answers on this corpus.

Chunks were transcribed from the data pack into `src/lib/documents.ts` so Vercel does not need a PDF parser. The workbook rows live in `src/lib/dataset.ts` with contract flags derived from the two agreements (Northstar fee waiver, LumenWorks 4-hour / ₹300 credit, custom SLAs).

Calculations use the snapshot as *now*:

- Cancellation: status + minutes since booking + whether the account waives the SOP fee.
- Failed-pickup credit: hours past `pickup_window_end` + fault flags + contract override vs SOP default (`min(500, 10% of fee)`).
- SLA: Policy v3 defaults or the signed agreement. 24x7 clocks run on Sunday 16 Aug 2026; business-hour clocks do not.

## Source reliability and conflict handling

Precedence encoded in retrieval and in the calculators:

1. Signed agreement for that account
2. Current Policy v3 + SOP v4
3. Current product guide / open known issues
4. Historical tickets (untrusted)
5. Policy v2 (deprecated)

When SOP and a contract disagree, the calculator returns both the winning rule and a `conflicts` list (for example TKT-450’s ₹250 advice to Northstar, or TKT-451’s false 3,000-row Growth limit). The agent is instructed to name both sources.

If carrier fault or timing is unknown, credit tools refuse to promise money and recommend verification.

## Major technical trade-offs

- **Gemini free tier instead of a paid OpenAI key.** Enough function calling for the demo; daily rate limits are the constraint.
- **Deterministic retrieval instead of embeddings.** The pack is tiny and authority matters more than fuzzy similarity.
- **In-memory staged actions.** Fine for a take-home; a real desk would persist to a ticket store. Confirm still cannot happen from the prompt alone.
- **One agent, not a multi-agent graph.** The requirement is three tools and multi-step use, not an orchestration framework.
- **Mock identity, real scope checks.** Users are a fixed directory. The session cookie only stores a user id; allowed accounts are resolved server-side in the tool layer.
- **Issues board is rules, not another LLM.** Recurring KI-208, KI-211, P1s, and SLA breaches are visible in the spreadsheet. A classifier would be less inspectable.
