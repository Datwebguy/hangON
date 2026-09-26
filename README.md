<div align="center">

<img src="presentation/out/hangon-cover.png" alt="HangON: never miss a job while your hands are full" width="100%">

# HangON

**The AI front desk for solo plumbers, electricians and HVAC pros.**

HangON answers the call, understands what the caller means, checks the real calendar, books the job, emails a confirmation, and writes the technician a brief. All while their hands are full.

[**Try a live call**](https://tryhangon.xyz/live.html) &nbsp;·&nbsp; [Website](https://tryhangon.xyz) &nbsp;·&nbsp; [Pitch deck (PDF)](presentation/out/hangon-deck.pdf)

Built for the [AssemblyAI Voice Agent Hackathon](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) on lablab.ai

</div>

---

## Contents

1. [The problem](#the-problem)
2. [What HangON does](#what-hangon-does)
3. [A real call, step by step](#a-real-call-step-by-step)
4. [How we use AssemblyAI](#how-we-use-assemblyai)
5. [Architecture](#architecture)
6. [Scheduling](#scheduling)
7. [Built to be honest](#built-to-be-honest)
8. [Run it locally](#run-it-locally)
9. [Configuration](#configuration)
10. [API reference](#api-reference)
11. [Project layout](#project-layout)
12. [Testing](#testing)
13. [Deployment](#deployment)
14. [Demo video](#demo-video)
15. [Roadmap](#roadmap)

---

## The problem

A solo plumber is under a sink when the phone rings. They can't answer, the caller hangs up, and the next plumber on the list gets the job. For one person businesses, every missed call is lost income, and callers rarely leave voicemail when water is on the floor.

Phone calls are also messy. People change their minds halfway through a sentence ("Tuesday afternoon? Actually, no. Make it Wednesday at 2.") and forms or phone trees can't keep up with that.

## What HangON does

| | |
| --- | --- |
| **Answers** | Picks up in the business's name, lets the caller explain in their own words, and asks one useful follow up question at a time. |
| **Understands** | Keeps the caller's final answer when they correct themselves, and turns the conversation into clean job details. |
| **Gives safety advice** | When there is active danger or damage (a leak, sparks), it gives one clear safety step. |
| **Schedules for real** | Asks the caller what day and time suits them, checks it against the technician's actual calendar, and offers genuine open slots only if that time is taken. |
| **Confirms before booking** | Reads back the job, time, name and address, and books only after a clear yes. |
| **Emails a confirmation** | Offers an email, asks for the address, spells it back, and sends it from the business's own domain. |
| **Briefs the technician** | After the call, writes a short brief: what's wrong, how the caller felt, and what to bring. |

## A real call, step by step

This is a real call recorded on [tryhangon.xyz](https://tryhangon.xyz). The quotes are from the live transcript.

1. **Greeting.** *"Apex Home Services, this is HangON. Mike is on a job. How can I help?"*
2. **The problem.** The caller says her kitchen sink is leaking under the cabinet with water on the floor.
3. **A follow up and a safety step.** HangON asks whether the water is still running and tells her to turn off the supply valve.
4. **Name and address.** Dana Cole, 14 Main Street.
5. **She changes her mind.** *"Could someone come Tuesday afternoon? Actually, no, Tuesday won't work. Make it Wednesday at 2."* HangON waits for the whole thought and fills in the job with her final answer.
6. **The real calendar.** *"I'm sorry, Dana, but Mike is actually booked at two PM on Wednesday. Would you be available on Friday, October second, at nine thirty AM, eleven AM, or twelve thirty PM instead?"* She takes 9:30.
7. **Read back, then book.** HangON repeats the job, time, name and address and books it once she says yes.
8. **Email.** HangON asks if she would like a confirmation, takes her address, and the email arrives from `bookings@tryhangon.xyz`.
9. **After the call.** The job appears on the schedule, and Mike gets a brief with the problem, the caller's mood and a parts list.

## How we use AssemblyAI

HangON runs on two AssemblyAI products.

### Voice Agent API: the live conversation

The whole call runs over one WebSocket to AssemblyAI's Voice Agent API: speech recognition, the language model and the spoken voice together, with no separate speech to text, text to speech or orchestration layer to build.

| Capability | How HangON uses it |
| --- | --- |
| **Real time, two way audio** | The browser streams microphone audio in and plays the agent's voice out through an AudioWorklet. |
| **Turn detection** | We use `balanced` mode, which paces adaptively, so callers who pause mid thought ("Tuesday... actually, no") get room to finish instead of being cut off. |
| **Interruptions** | Barge in is on, so callers can talk over the agent naturally. |
| **Tool calling** | Three client side tools let the agent act: `check_calendar_availability`, `book_service_appointment` and `send_confirmation_email`. The model decides when to call them; our code runs them against the real calendar and email service and returns the result into the conversation. |
| **Keyterms** | Trade vocabulary such as P trap, GFCI breaker and sump pump is passed as keyterms to improve recognition. |
| **Secure sessions** | Our server mints a temporary voice token for every call, so the AssemblyAI API key never reaches the browser. |

### LLM Gateway: understanding and summarising

| Use | How it works |
| --- | --- |
| **Live job extraction** | While the caller talks, the transcript is sent to the LLM Gateway with a strict JSON schema. It returns the customer name, job, urgency, time, address and any self corrections it resolved. Anything the caller never said stays empty instead of being guessed. |
| **Technician brief** | After the call, the whole conversation goes to the LLM Gateway, which returns a summary, the caller's mood at the start and end, safety advice actually given, and a parts checklist. |
| **Model flexibility** | The model is one setting (`HANGON_LLM_MODEL`). If an account cannot use a model, HangON moves on to the next one it can use, and falls back to a prompt level schema for models without structured outputs. |

## Architecture

```
 Caller's browser                      HangON server (Node, Vercel)            Services
 ─────────────────                     ───────────────────────────             ────────
 live.html / live.js
   microphone ── PCM audio ──▶  AssemblyAI Voice Agent API  (WebSocket, temporary token from /api/voice-session)
   speaker   ◀── agent voice ──
   tool calls ─────────────────▶  /api/calendar  ─▶ schedule rules ─▶ Postgres
                                   /api/calendar/book ───────────────▶ Postgres
                                   /api/email/confirmation ──────────▶ Resend
   transcript ─────────────────▶  /api/dictate  ─▶ AssemblyAI LLM Gateway (job fields)
   end of call ────────────────▶  /api/lemur    ─▶ AssemblyAI LLM Gateway (technician brief)

 index.html / app.next.js ─────▶  /api/calendar  ─▶ Postgres (booked jobs)
```

* **Frontend:** plain HTML, CSS and JavaScript. No framework, no build step.
* **Backend:** a single Node HTTP server (`server.mjs`) with domain modules in `domain/`. It serves the pages and the JSON API, and runs as one serverless function on Vercel.
* **Storage:** Postgres for jobs, requests, workspaces and integrations. Without `DATABASE_URL`, a local JSON file store is used for development and tests.
* **Email:** Resend, sending from a verified domain.

## Scheduling

Scheduling is computed from real data (`domain/schedule.mjs`):

* **Business hours:** Monday to Saturday, 8 AM to 6 PM, in the business timezone (US Eastern by default). Jobs take about 90 minutes.
* **The agent knows the date.** Its instructions include the current local time and the next 14 days with their dates, so "Wednesday at 2" becomes an exact time without the model doing calendar arithmetic.
* **Real availability.** A requested time is refused if it is in the past, on a closed day, outside hours, or overlapping a booked job. When that happens, the next open slots are calculated from the calendar.
* **No double booking.** The booking endpoint runs the same check and rejects a taken slot.

## Built to be honest

HangON never pretends:

* Details the caller never gave show as **Not given**. No placeholder names, phone numbers, addresses or prices.
* A booking is refused unless the agent marks it as confirmed by the caller.
* An email is reported as sent only when Resend accepts it. If email is not configured, the agent is told and says so.
* If AssemblyAI or the database is unreachable, the caller and the screen see a clear error, not a canned answer.
* The dispatch note is labelled as prepared text, because no SMS provider is connected.

## Run it locally

**Requirements:** Node 18 or newer. Docker is optional (for local Postgres).

```bash
git clone https://github.com/Datwebguy/hangON.git
cd hangON
npm install
cp .env.example .env        # then fill in your keys
npm start                   # http://localhost:4180
```

**With Postgres (recommended):**

```bash
npm run db:up               # starts Postgres in Docker
npm run db:migrate          # creates the tables
# set DATABASE_URL in .env, for example postgres://hangon:hangon@localhost:5432/hangon
npm start
```

Open `http://localhost:4180/live.html`, press **Start call**, and allow the microphone. No microphone? The **sample call** buttons run the same extraction, booking and brief (without email).

## Configuration

All secrets stay on the server. See `.env.example`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `ASSEMBLYAI_API_KEY` | Yes | Voice Agent sessions and LLM Gateway calls. |
| `HANGON_LLM_MODEL` | No | Force a specific LLM Gateway model. By default HangON picks the first one your account can use. |
| `DATABASE_URL` | Production | Postgres connection string. |
| `RESEND_API_KEY` | For email | Sends confirmation emails. |
| `HANGON_EMAIL_FROM` | For email | Verified sender, for example `HangON <bookings@yourdomain.com>`. |
| `HANGON_SESSION_SECRET` | Production | Signs session cookies. The server refuses to start sessions without it in production. |
| `HANGON_CONFIRMATION_SECRET` | Production | Signs request confirmations. |
| `HANGON_OPERATOR_TOKEN` | Production | Access code for operator sign in. |
| `HANGON_INTEGRATION_ENCRYPTION_KEY` | Optional | Encrypts stored webhook secrets (32 byte hex or base64). |
| `PORT` | No | Local port, default `4180`. |

## API reference

All endpoints return JSON. Endpoints that change data need a session cookie and the `x-hangon-csrf` header.

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/health` | Health check and active storage backend. |
| GET | `/api/demo/session` | Starts a public demo session and returns a CSRF token. |
| POST | `/api/operator/login` | Operator sign in with the access code. |
| GET | `/api/voice-session` | Temporary AssemblyAI voice token, agent instructions, tools and voices. |
| GET | `/api/workspace` | Business name, owner and settings. |
| GET | `/api/calendar` | Booked jobs. With `preferred_start=YYYY-MM-DDTHH:mm`, also checks that time. |
| POST | `/api/calendar/book` | Books a job. Returns 409 with open slots if the time is taken. |
| POST | `/api/dictate` | Transcript to structured job fields (LLM Gateway). |
| POST | `/api/lemur` | Call transcript to technician brief (LLM Gateway). |
| POST | `/api/email/confirmation` | Sends the booking confirmation email. |
| GET, POST | `/api/requests` | Lists or creates confirmed requests. |
| POST | `/api/requests/confirmation` | Issues a signed confirmation for an exact request. |
| GET, PUT, DELETE | `/api/integrations/webhook` | Operator webhook settings. |

## Project layout

```
index.html, app.next.js      Homepage: how it works and the booked jobs schedule
live.html, live.js           The live call screen and the voice agent client
pcm-processor.js             AudioWorklet for microphone capture and playback
styles.css                   Design system (light and dark themes)
server.mjs                   HTTP server: pages and JSON API
api/index.mjs                Vercel entry point
domain/                      Business logic
  voice.mjs                  Agent instructions and tool definitions
  schedule.mjs               Business hours, availability and open slots
  dictation.mjs              Live job extraction (LLM Gateway)
  lemur.mjs                  Technician brief (LLM Gateway)
  assemblyai-llm.mjs         LLM Gateway client with model fallback
  calendar-store.mjs         Jobs in Postgres or the local JSON store
  email.mjs                  Confirmation emails through Resend
  security.mjs               Sessions, cookies and operator access
scripts/migrate.mjs          Postgres schema
test/                        Automated tests
demo-video/                  Recording rig and Remotion edit for the demo video
presentation/                Pitch deck and cover image
```

## Testing

```bash
npm test
```

22 tests cover scheduling (dates, closed days, taken slots, alternatives), booking validation, LLM Gateway requests and failures, email content and configuration, request confirmations and operator sign in. The Postgres tests run when `DATABASE_URL` is set.

## Deployment

HangON runs on Vercel as a single serverless function (`vercel.json` routes every path to `api/index.mjs`).

1. Import the repository into Vercel.
2. Add the environment variables from the table above to the Production environment.
3. Deploy. Environment variables apply to new deployments only, so redeploy after changing them.

The `demo-video/` folder is excluded from deployments.

## Demo video

The demo video is one real call on the live site, recorded without editing the conversation.

* `demo-video/rig/record.mjs` drives Chrome on tryhangon.xyz, plays the caller's lines in as the microphone one turn at a time (only after the agent has finished speaking), records the agent's real audio, and captures the screen.
* `demo-video/rig/build-edl.mjs` builds the edit from the recording's own timeline: cuts only in silence, narration only in real pauses, and captions from the real transcript.
* `demo-video/src/Final.jsx` is the Remotion composition.

```bash
npm run video:record        # record a take on the live site
npm run video:edit          # build the edit
npm run video:render        # render demo-video/out/hangon-demo-final.mp4
```

Recordings and renders stay local and are not committed.

## Roadmap

* A real phone number, so callers can dial in instead of using the website.
* Text message alerts to the technician.
* Calendar sync with Google Calendar and Outlook.
* A setup screen for business hours, services and voice.

---

<div align="center">

**HangON** · Never miss a job while your hands are full.

[tryhangon.xyz](https://tryhangon.xyz)

</div>
