# ParcelPilot Support Agent

I built this for the CalQuity take-home. ParcelPilot is a fake B2B logistics company. They handed me a messy pack on purpose — old policy, wrong tickets, two customer contracts that override the SOP — and asked me to put a working support agent on top of it.

I treated the clock as frozen at **16 Aug 2026, 11:00 Asia/Kolkata** (Sunday). Every fee, credit, and SLA I calculate uses that time.

Repo: https://github.com/thanishmamilla/calquity_THANISH

---

## How I expect you to run it

You need Node 18+ and a free [Gemini API key](https://aistudio.google.com/apikey). I did not put my key in this repo.

```bash
git clone https://github.com/thanishmamilla/calquity_THANISH.git
cd calquity_THANISH
npm install
```

Then make a local env file (please don’t commit it):

```bash
# Windows
copy .env.example .env.local

# macOS / Linux
cp .env.example .env.local
```

Open `.env.local` and add:

```
GEMINI_API_KEY=your_key_here
```

Start it:

```bash
npm run dev
```

I serve it at http://localhost:3000. On the home page I mocked a few logins so you can switch roles without a real IdP.

| I signed in as | What I allowed them to see |
|---|---|
| Northstar / LumenWorks / Beacon / Axis | Their own account only |
| Rohit / Maya | Every account, plus the Issues board at `/ops` |
| Priya / Arjun / Neha | Only their CSM book, plus `/ops` for those accounts |

If you only have a few minutes, these are the questions I used while building:

- Northstar: *Can we cancel ORD-1001 without a cancellation fee? Explain why.*
- LumenWorks: *A pickup is three hours late because of carrier fault. Should I get a service credit?*
- Rohit: *Which open tickets have already breached SLA?* then click **Issues board**

### If you want to host it

I set this up for Vercel. Import the repo, add `GEMINI_API_KEY` under Environment Variables (Production and Preview), and deploy. The original PDFs and the workbook are in [`data/`](./data). I kept the key off git on purpose.

---

## Architecture note

### How I designed the agent

I used one Gemini agent with tools, not a graph of specialists. I split people into three roles because the brief asked for customer-facing and internal use:

- a **customer** only gets their account. If they ask for someone else’s order I return `not_found`. I don’t tell them the other account exists.
- a **CSM** only gets their book. Priya has Northstar and Axis. Arjun has LumenWorks. Neha has Beacon.
- **support** (Rohit, Maya) can see everyone and the issues board.

I don’t let the browser pick the role. After you click a user I set an httpOnly cookie (`pp_uid`). Every tool looks that user up on the server. Changing a header should not widen access.

I also don’t hand Gemini the raw Excel file. It only sees what a tool already filtered and ranked. Chat history is just the earlier messages, not the full tool dump.

I wrote the source-rank rules into the prompt, but I didn’t trust the prompt alone. The same rules live in the calculators and the search ranker. If the model feels confident about Policy v2, the retrieval still buries it.

I try models in this order: `gemini-2.5-flash`, then `gemini-2.0-flash`, then `gemini-flash-latest`.

### How I designed the tools

I gave the agent three tools, the ones the brief listed.

1. **`search_documents`** — I search the six PDFs. Each chunk knows what kind of file it is, whether it’s current or deprecated, how much authority it has, and which customer it belongs to if it’s a contract. I score by keywords plus that authority. I punish Policy v2 unless you actually ask for the old policy. A Northstar user cannot retrieve LumenWorks’ agreement.

2. **`lookup_data`** — I look up accounts, orders, and tickets, and I calculate cancellation fees, credits, and SLA remaining. If a closed ticket has an old resolution, I label it as context that may be wrong. After a confirmed write, staff can list what landed on the mock desk.

3. **`propose_action`** — I can draft an escalation, a ticket update, or a follow-up. I only stage it. I refuse to write until you click Confirm or type `confirm`. Type `cancel` and I throw the draft away. I show confirmed rows in the desk log so you can see nothing happened early.

On a messy question I expect the model to use more than one tool. In the UI I stream the tool names and I draw the path I care about: find the order, name the account, read that customer’s agreement, check the current SOP/policy, calculate, then decide if anyone should escalate.

### How I handle documents and tables

The PDFs are one page each. I thought about embeddings and decided they were the wrong spend. Authority matters more than “this paragraph is kind of similar.”

I typed the pack into `src/lib/documents.ts` and `src/lib/dataset.ts` so Vercel doesn’t need a PDF parser. I derived the contract flags from the agreements themselves (who gets a fee waiver, who has a 4-hour credit rule, who has a custom SLA). I did not write `if ORD-1001 return 0`. If you swap in another id from the same pack, the same functions run.

For time math I treat the snapshot as now:

- cancellation looks at status, minutes since booking, and whether *that* account’s contract waives the SOP fee
- a failed-pickup credit looks at hours past the window, fault flags, and whether the contract replaces the SOP (`min(500, 10% of the fee)`)
- SLA uses Policy v3 unless that account has an agreement. 24x7 clocks still run on that Sunday. Business-hour clocks do not.

### How I handle trust and conflicts

This is the ranking I used, same as the pack:

1. the signed agreement for **that** customer
2. current Policy v3 and SOP v4
3. the current product guide and open known issues
4. historical tickets (I treat them as gossip)
5. Policy v2 (I never use it for a live answer)

When the SOP and a contract disagree, I return both. The chat shows a **Source reliability** card: what won, what lost, what I’m unsure about, and when I want a human. If I don’t know whether the carrier was at fault, I will not promise a credit. If a credit would be over ₹1,000 I say a manager has to approve it. If you ask how to change a billing contact, I don’t invent a procedure. I say it isn’t in the pack and we should escalate.

### Trade-offs I accepted

I used Gemini’s free tier instead of a paid OpenAI key. Function calling is good enough here. The limit I worry about is daily quota, not model quality.

I skipped embeddings. The corpus is tiny. I’d rather rank by source type than by cosine similarity.

I keep staged actions in memory. That’s fine for a take-home. A real desk would write to a ticket store. Confirm still cannot happen just because the model said “done.”

I kept one agent. The brief asked for three tools and multi-step work, not LangGraph.

I mocked login and I did not mock the permission check. The cookie is only a user id. The allow-list is resolved on the server.

I built the issues board with rules, not a second model. The pack already contains the clusters. I wanted something a reviewer can inspect.

---

## Product note

### Which extra problems I chose

I did both.

For **proactive detection** I built `/ops`. Only staff can open it. I scan the ticket book and the orders at the snapshot time and I group what I’d actually want on a Monday stand-up: the same complaint showing up twice, tickets that match a known product issue, P1s and SLA that are late or about to be, odd orders (still BOOKED after the window, cancel after pickup), and anything that hits more than one customer. Each card says why I care and what I’d do next. If you log in as Arjun you only see LumenWorks. Rohit sees the full book.

For **trust** I didn’t want a fluent wrong answer. Rank lives in code. Conflicts get named. Unknown fault doesn’t become money. Writes wait for you. I put that under the answer so you don’t have to trust the prose.

### What I would build next if this were a real desk

I’d hook writes to a real ticket system with an audit log and a status the customer can see. I’d add a carrier-status tool so a SwiftShip “still BOOKED” row can be checked instead of only warned. I’d keep a credit ledger so monthly caps are a running number, not a footnote. I’d replay the trap questions on every deploy. And I’d give customers a known-issue blurb that doesn’t mention other tenants.

### What I left out on purpose

I didn’t add a real identity provider or a database. I didn’t stream the final sentence token-by-token (the tools already stream). I didn’t stand up a vector database. I didn’t send outbound emails, fine-tune anything, or split this into two agents. I wanted a reviewer to follow one path.

### The metric I would use

I’d measure **correct-and-contained resolution rate**: of the chats that ask about a fee, credit, SLA, or known issue, how many get the number right *and* never leak another account, with no human coming back to fix it.

A bot that answers in two seconds and repeats a closed ticket’s ₹250 fee looks productive. It’s still wrong. That’s the number I’d watch.

---

## AI tools I used

I wrote this in **Cursor**. I used it to scaffold the Next.js app, read the pack, build the tools and the permission layer, and push on the UI until the trail and the confirm bar were obvious.

The live agent is **Google Gemini** (`gemini-2.5-flash` / `gemini-2.0-flash`). I did not use Gemini to write the repo.

I didn’t use any other coding assistant for the submitted code.

---

I also left shorter copies in [ARCHITECTURE.md](./ARCHITECTURE.md) and [PRODUCT.md](./PRODUCT.md) if you want those as separate files.
