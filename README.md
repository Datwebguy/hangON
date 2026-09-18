<div align="center">

<a href="https://tryhangon.vercel.app"><img src="hangon-logo.png" width="96" alt="HangON logo"></a>

# HangON

### Autonomous Voice Front Desk for Solo Contractors &amp; Service Trades
**"Never lose a $1,500 job while you're under a sink."**

Built with **AssemblyAI Voice Agent API** + **Universal-3.5 Pro Dictation API**

<p>
  <a href="https://tryhangon.vercel.app"><img src="https://img.shields.io/badge/Live%20Demo-tryhangon.vercel.app-10b981?style=for-the-badge" alt="Try the live demo"></a>
  <a href="https://github.com/Datwebguy/hangon"><img src="https://img.shields.io/badge/Repository-GitHub-111827?style=for-the-badge&logo=github" alt="GitHub repository"></a>
  <a href="https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon"><img src="https://img.shields.io/badge/Hackathon-AssemblyAI%20Voice%20Agent-3b82f6?style=for-the-badge" alt="AssemblyAI Hackathon"></a>
</p>

<p>
  <img src="https://img.shields.io/badge/AssemblyAI-Voice%20Agent%20API-3b82f6?style=flat-square" alt="AssemblyAI Voice Agent API">
  <img src="https://img.shields.io/badge/AssemblyAI-Dictation%20API%20(Universal--3.5%20Pro)-10b981?style=flat-square" alt="Universal-3.5 Pro Dictation">
  <img src="https://img.shields.io/badge/Node.js-20%2B-0f766e?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 20 or newer">
  <img src="https://img.shields.io/badge/Status-100%25%20Live%20Action%20Executed-10b981?style=flat-square" alt="Live Action Executed">
</p>

</div>

---

## 🎯 The Pivot &amp; Problem

Solo trade professionals (plumbers, electricians, HVAC pros, independent contractors) lose thousands of dollars every week simply because they are working with both hands full:
* They're under a customer's sink, on a 12-foot ladder, or covered in grease.
* When a homeowner calls with an emergency pipe burst or tripping breaker box, the pro can't pick up.
* That caller won't leave a voicemail—they hang up and call the next contractor on Google.

**HangON is an autonomous voice front desk that answers the phone and actually books the job on the contractor's dispatch calendar in that same call.**

---

## 🧠 AssemblyAI Technical Depth: Voice Agent + Dictation API

HangON showcases depth across AssemblyAI's newest voice technologies:

### 1. Voice Agent API (WebSocket Real-Time Conversation)
* Low-latency bidirectional 24kHz PCM audio streaming.
* Natural turn detection with smart interruption handling (barge-in).
* Dynamic function calling (`book_service_appointment`, `check_calendar_availability`).

### 2. Universal-3.5 Pro Dictation API (`dictation.assemblyai.com/v1/transcribe/live`)
* **Resolves Spoken Self-Corrections**: When callers hesitate or change their mind (*“Can you come Thursday? Wait no, Thursday my wife has the car, make it Friday at 10:30am”* ➔ resolves cleanly to **Friday at 10:30 AM**).
* **Keyterms Prompting (`keyterms_prompt`)**: Biases speech recognition toward domain trade jargon, equipment, and local street names (`P-trap`, `Main shutoff valve`, `Water heater`, `200-amp panel`, `GFCI breaker`, `Sump pump`, `742 Evergreen Terrace`).
* **Domain Context (`stt_prompt`)**: Steers the ASR model with solo contractor emergency service context.
* **Structured Output (`llm_instruction`)**: Extracts clean JSON booking fields (`customer_name`, `service_type`, `urgency`, `scheduled_time`, `address`) directly.
* **Dual Output Presentation**: Returns and displays the verbatim transcript alongside the cleaned rewrite so judges can see the self-correction resolution in real time.

### 3. Live Autonomous Action Execution (No Placeholder Gating!)
* Instead of passively storing a note for someone to read later, HangON checks the contractor's real schedule, confirms the details, and **locks the appointment onto the dispatch calendar**.
* Immediately triggers a simulated SMS dispatch alert to the pro:
  > `🚨 NEW EMERGENCY DISPATCH: Sarah Miller | Water Heater Leak Repair | Friday 10:30 AM | 742 Evergreen Terrace | Urgency: HIGH`

### 4. Active Diagnostic Triage & Live Price Estimates (Direction A)
* Diagnoses caller emergencies in real time (e.g. instructing a caller to turn the yellow main shutoff valve clockwise during a water heater leak to prevent catastrophic flooding before the tech arrives).
* Quotes transparent, flat-rate pricing upfront ($180–$240 standard diagnostic & valve repair).

### 5. Multimodal Voice-to-Canvas Live Sync (Direction B)
* As the caller speaks, the cockpit UI mutates in real time:
  * **Detected Equipment**: *Rheem 40-Gallon Gas Water Heater*
  * **Diagnostic Triage**: *⚠️ Turn yellow shutoff valve clockwise*
  * **Live Price Estimate**: *$180 – $240 (No Weekend Surcharge)*
  * **Pro Distance & ETA**: *Mike is 4.2 mi away on Highland Blvd*

### 6. AssemblyAI LeMUR Post-Call Intelligence Dossier (Direction C)
* Instantly generates an executive pro brief for the contractor:
  * **5-Second Pro Brief**: Everything Mike needs to know before stepping on the porch.
  * **Agitation De-escalation Metric**: Tracks caller stress reduction (e.g., *88% Panic ➔ 12% Reassured*).
  * **Truck Pre-Load Parts Checklist**: Automated bill of materials (brass PEX fittings, relief valves, pipe wrench) so Mike never arrives without the right parts.

---

## ⚡ Interactive Before &amp; After

| Stage | Raw Caller Speech | AssemblyAI Dictation (Universal-3.5 Pro) | Executed Result |
| :--- | :--- | :--- | :--- |
| **Input** | *"Hey uh Mike, yeah my water heater is making this awful banging sound and leaking from the bottom valve... can you come by Thursday? Wait no, make it Friday at 10:30am. It's Sarah Miller over on 742 Evergreen."* | **Filler stripped &amp; self-correction resolved.** Extracted: Sarah Miller, Water Heater Leak, Friday 10:30 AM, 742 Evergreen Terrace. | **Spoken Confirmation Read-Back:** *"Got it, Sarah. I have you down for Friday at 10:30 AM at 742 Evergreen Terrace. Shall I lock that into Mike's calendar?"* |
| **Action** | Caller says: *"Yes please, book it!"* | Voice Agent invokes `book_service_appointment` tool. | **✅ Slot Locked on Dispatch Calendar** + **📲 SMS Dispatched to Mike** |

---

## 🚀 Quick Start (Local Run)

```bash
# 1. Install dependencies
npm install

# 2. Configure AssemblyAI API Key
# Add to .env or export in terminal:
export ASSEMBLYAI_API_KEY="your_api_key_here"

# 3. Start server
npm start
# Server runs at http://localhost:4180
```

### Running Tests
```bash
npm test
# 11/11 unit & integration tests passing (calendar dispatch, dictation self-corrections, LeMUR dossier, auth, idempotency)
```

---

## 🧪 Demo Modes &amp; Evaluation Options

1. **Live Microphone Call**: Click **"Start Live Voice Call"** on `/live.html`, speak normally with corrections, and hear HangON respond and book.
2. **1-Click Test Scenarios**: No microphone? On `/live.html`, click any of the 3 one-click scenarios:
   * 💧 *Water Heater Leak (Thursday ➔ Friday 10:30 AM self-correction)*
   * ⚡ *Sparking Breaker Panel (Emergency Urgent)*
   * 🚿 *Main Drain Snaking (Tomorrow 1:30 PM)*
   Watch the live transcript, Dictation HUD, and real-time calendar commit!
3. **Dispatch Board**: Visit `/` to see today and tomorrow's booked jobs update in real time.
