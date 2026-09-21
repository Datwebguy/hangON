<div align="center">

<a href="https://tryhangon.vercel.app"><img src="hangon-logo.png" width="96" alt="HangON logo"></a>

# HangON

### Voice front desk for solo contractors &amp; service trades
**Never lose a job while your hands are full.**

Built on **AssemblyAI Voice Agent API** with structured speech cleanup for messy caller corrections.

<p>
  <a href="https://tryhangon.vercel.app"><img src="https://img.shields.io/badge/Live%20Demo-tryhangon.vercel.app-10b981?style=for-the-badge" alt="Try the live demo"></a>
  <a href="https://github.com/Datwebguy/hangon"><img src="https://img.shields.io/badge/Repository-GitHub-111827?style=for-the-badge&logo=github" alt="GitHub repository"></a>
  <a href="https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon"><img src="https://img.shields.io/badge/Hackathon-AssemblyAI%20Voice%20Agent-3b82f6?style=for-the-badge" alt="AssemblyAI Hackathon"></a>
</p>

</div>

---

## What it does

Solo plumbers, electricians, and HVAC pros miss emergency calls while they are under a sink or on a ladder. HangON answers, confirms the job, and books the visit on the technician schedule in the same call.

**Caller flow**

1. **Talk** — HangON picks up and listens.
2. **Confirm** — Reads back the job, time, and address.
3. **Book** — Saves the appointment and prepares a text for the technician.

---

## AssemblyAI features used

### Voice Agent API (primary path)
- Real-time two-way voice over WebSocket
- Turn-taking with barge-in
- Tool calling to check availability and book jobs

### Speech understanding for messy callers
- Keyterms for trade language (`P-trap`, `GFCI breaker`, street names)
- Self-correction handling (“Thursday… wait, Friday at 10:30”)
- Side-by-side “caller said” vs “booking summary” in the UI

### After the call
- Short technician brief, caller-mood summary, and parts checklist built from the call context

---

## Quick start

```bash
npm install

# Copy env template and fill in secrets
cp .env.example .env
# ASSEMBLYAI_API_KEY=...
# DATABASE_URL=postgres://hangon:hangon@localhost:5432/hangon   # recommended
```

### Postgres (recommended)

```bash
# Start local Postgres (Docker Desktop must be running)
npm run db:up
npm run db:migrate

# Then start the app with DATABASE_URL set in .env or the shell
npm start
```

Without `DATABASE_URL`, HangON falls back to the local JSON file store (fine for unit tests). With `DATABASE_URL`, bookings/requests/integrations are multi-tenant ready in Postgres.

Optional local launcher (key file must stay outside the repo):

```bash
# PowerShell
$env:HANGON_KEY_FILE="C:\path\to\local-key-file.txt"
$env:DATABASE_URL="postgres://hangon:hangon@localhost:5432/hangon"
node start-with-key.mjs
```

### Tests

```bash
npm test
# Postgres calendar tests run automatically when DATABASE_URL is set
```

---

## Demo paths for judges

1. Open **[tryhangon.vercel.app/live.html](https://tryhangon.vercel.app/live.html)**
2. Click **Start call** and speak, **or** click a sample call (water heater / panel / AC / drain)
3. Watch HangON confirm details, book the job, and show Mike’s brief
4. Open **Today's jobs** to see the schedule update

---

## Environment variables

See `.env.example`:

| Variable | Purpose |
| --- | --- |
| `ASSEMBLYAI_API_KEY` | Live voice sessions (server-side only) |
| `DATABASE_URL` | Postgres connection (calendar, requests, integrations, workspaces) |
| `HANGON_SESSION_SECRET` | Signed session cookies |
| `HANGON_CONFIRMATION_SECRET` | Confirmation binding |
| `HANGON_OPERATOR_TOKEN` | Required in production for operator sign-in |
| `HANGON_INTEGRATION_ENCRYPTION_KEY` | Encrypts webhook secrets at rest |
| `PORT` | Default `4180` |

Browser code never receives the AssemblyAI API key. The server mints a short-lived voice session token.

---

## Project layout

```
server.mjs          HTTP API + static pages
domain/             Booking, calendar, voice, security
live.html / live.js Answer-a-call experience
index.html          Today's jobs + product story
demo-video/         Remotion demo render
presentation/       Pitch slide assets
test/               Unit + integration tests
```

---

## Submission notes (AssemblyAI Voice Agent Hackathon)

- **Live demo:** https://tryhangon.vercel.app
- **Repo:** https://github.com/Datwebguy/hangON
- **Pitch assets:** `presentation/out/`
- **Demo video render:** `npm run video:render` (requires narration assets)

Deadline reminder: **Sep 30, 2026, 3:00 PM CUT** on [lablab.ai](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon).
