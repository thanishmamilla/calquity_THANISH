# Product note

## Extra client problems

Both extras are in the product, not just the write-up.

**Proactive issue detection.** Authorised support and CSM users get `/ops`. Customers are blocked. The board is computed from the ticket book and orders at the frozen snapshot — no extra model. It groups what the brief asked for:

- similar complaints clustering
- multiple tickets on the same product / known issue
- high-severity tickets past or near first-response SLA
- unusual order activity (late BOOKED pickups, cancel-after-pickup)
- the same pattern hitting more than one customer

Each card says why it matters and what to do next. The queue also shows which policy or contract set the SLA clock. Scope follows the signed-in book: Rohit sees every account, Arjun only LumenWorks.

**Trust and reliability.** Source rank is in retrieval and in the calculators, not only in the prompt:

1. Signed agreement for that account
2. Current policy + SOP
3. Current product guide / open known issues
4. Historical tickets (context, often wrong)
5. Deprecated policy (never a live answer)

When a contract and the SOP disagree, the calculator returns the winner and the losing rule. If carrier fault or timing is unknown, it will not promise a credit and flags a human. Chat shows that as a **Source reliability** card under the answer: winning source, conflicts, uncertainty, and when to escalate. Writes still wait for confirm.

## What else I would build

1. Write-path to a real ticket system with audit log and customer-visible status.
2. A carrier-status verify tool so pickup-webhook delays can be checked instead of only warned.
3. A credit ledger so monthly caps are a running total.
4. A replay harness on every deploy for fee / credit / SLA / known-issue questions.
5. Customer-safe summaries of known issues that do not name other tenants.

## What I left out

- Real identity provider and row-level audit in a database
- Token streaming for the final sentence (tool steps already stream)
- Embeddings / hosted vector DB
- Automated outbound messages
- Fine-tuning
- A second specialist agent

## One metric

**Correct-and-contained resolution rate:** share of chats that match a reviewer key for fee / credit / SLA / known-issue questions and never return another account’s data, with no later human correction.

A chatbot that answers fast but repeats a closed ticket’s wrong fee would look busy and still be wrong. This metric punishes that.
