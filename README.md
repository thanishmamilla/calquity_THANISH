# ParcelPilot Support Agent

First-round assessment for CalQuity: an AI support system over an intentionally messy policy pack.

Customers get answers for **their account only**. Staff can investigate across accounts and use a proactive issues board. Contracts override current policy. Current policy overrides old tickets. Deprecated Policy v2 is never used for a live decision.

Snapshot clock for every time question: **16 Aug 2026, 11:00 Asia/Kolkata**.

## Setup

1. Copy `.env.example` to `.env.local` and add a free Gemini key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
copy .env.example .env.local
```

2. Install and run:

```bash
npm install
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000). Pick a customer account or an internal user.

## Hosted deploy (Vercel)

1. Push this repo to GitHub (public).
2. Import the repo at [vercel.com](https://vercel.com).
3. Add environment variable `GEMINI_API_KEY`.
4. Deploy. Paste the URL in the assessment form.

Do not commit `.env.local`.

## What it does

- Natural-language chat with three tools: document search, structured lookup/calculation, and a staged action.
- Access control in the tool layer. A customer asking about another account is denied even if the model requests it.
- State-changing actions are prepared, then executed only after an explicit Confirm click.
- Multi-step questions (order + contract + SOP + calculation + escalate) are the normal path.
- Internal **Issues board** flags SLA breaches, P1s, recurring KI-208 bulk-upload failures, and SwiftShip webhook delays.

## Try these

As **Northstar Logistics**:

- Can we cancel ORD-1001 without a cancellation fee? Explain why.

As **LumenWorks**:

- A pickup is three hours late because of carrier fault. Should I get a service credit?
- Then ask about **ORD-2002** specifically.

As **internal staff**:

- Which open tickets have already breached SLA?
- Open the Issues board.

## Notes

- [ARCHITECTURE.md](./ARCHITECTURE.md) — agent, tools, sources, trade-offs
- [PRODUCT.md](./PRODUCT.md) — extra problems, next work, metric
- Original PDFs and workbook are in [`data/`](./data)

## AI tool usage

Built with Cursor (Grok) for scaffolding, document analysis, and implementation. Gemini 2.5 Flash / 2.0 Flash is the runtime agent. No other coding assistants were used for the submitted code.
