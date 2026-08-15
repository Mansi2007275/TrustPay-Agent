# TrustPay Agent

An autonomous financial agent with **bounded authority**. It auto-executes
low-risk payments, escalates risky ones to a human via Telegram (or console
in mock mode), and logs everything for audit — with a Neobrutalism dashboard,
a Three.js "agent brain" visualization, and Framer Motion animations throughout.

Tested end-to-end: backend API (risk engine, Groq/mock reasoning, SQLite,
Telegram/mock bot) + frontend (11 pages, sidebar nav, live data) all verified
working together.

## Structure
- `backend/` — Node.js + Express API, weighted risk engine, Groq integration (with offline mock fallback), Telegram bot (with console mock fallback), SQLite
- `frontend/` — Next.js 14 dashboard: sidebar navbar, Three.js hero orb, Framer Motion animations, Neobrutalism UI
- `docs/` — pitch and submission questionnaire

## Quick start

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env
# Optional: add real GROQ_API_KEY and TELEGRAM_BOT_TOKEN to .env
# Without them, the app still runs fully — Groq falls back to local
# reasoning, Telegram falls back to console logging.
npm run dev
```
Runs on http://localhost:4000. Health check: `GET /api/health`

### 2. Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```
Runs on http://localhost:3000 — opens to Command Center.

## Try it
1. Go to **Command Center**, submit a small payment to a new vendor — watch it auto-execute.
2. Submit a large payment (e.g. ₹4,00,000) to a brand-new vendor — watch it escalate to "Pending Approval".
3. Go to **Simulation Lab** and run the "Bank Account Changed" scenario — see the hard-override risk logic kick in.
4. Check **Transactions** to approve/reject pending items, and **Audit Trail** for the full hash-chained log.
5. Check **Vendors** to see trust scores building up from real transaction history.

## What's real vs. placeholder
**Fully working:** risk engine (weighted scoring + hard-override fraud rules), Groq LLM reasoning with offline mock fallback, SQLite persistence, vendor trust tracking, Telegram HITL escalation with mock fallback, hash-chained audit log, Simulation Lab, Command Center, Transactions, Vendors, Audit Trail pages — all tested end-to-end.

**Styled placeholders (structure + design done, logic to fill in):** AI Decisions, Invoices, Fraud Center, Policies, Agent Control, Analytics — each page states exactly what's planned so it's easy to pick up.
