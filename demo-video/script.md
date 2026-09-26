# HangON demo video: final script (as cut)

Length: about 3:38. Source: one continuous real take on https://tryhangon.xyz (take 7).
Narrator: Mike, the plumber (generated male voice). Agent: the real AssemblyAI Voice Agent voice from the call.
Caller: Dana (generated voice, played into the browser as the microphone). Every word of the call is kept; only silent waits were shortened.

| Time | Picture | Sound |
| --- | --- | --- |
| 0:00 | Black. "Incoming call" ringing phone, then "Missed call". | Phone ring. **Mike:** "When I'm under a sink, I can't answer the phone. And every call I miss is a job that goes to someone else." |
| 0:08 | Title card: HangON, "A voice front desk for trades", "Built on AssemblyAI". | |
| 0:11 | Homepage hero, push in on the "Caller said / HangON booked" card. | **Mike:** "So I built HangON. It picks up when I can't, understands what the caller means, and books the job." |
| 0:18 | How it works, then the Booked jobs schedule. | **Mike:** "Callers change their minds mid sentence. HangON keeps the final answer, reads it back, and only then books it." |
| 0:26 | Schedule, theme toggled dark and back. | **Mike:** "Every booking is saved and lands here, on my schedule." |
| 0:31 | Click "Try a live call". Live call page, voice picker, sample calls. | **Mike:** "This is a real call on the live site. The voice is AssemblyAI's Voice Agent API. Real time, two way, and it can use tools." |
| 0:46 | Start call. Chip: "Real call on tryhangon.xyz · pauses shortened · caller voice synthesized". | The real call begins (captions show the real transcript). |
| 0:46 to 3:05 | The call: greeting; leak described; follow up question and safety step; name and address; caller asks for Tuesday, corrects to Wednesday at 2; agent checks the calendar, Wednesday is taken, offers Friday 9:30, 11:00, 12:30; caller takes the first; agent reads back and books after "Yes, please book it"; offers email, asks for the address, sends it. | Real call audio. Mike speaks only inside real pauses: "The LLM Gateway turns her words into a job. Her final answer: Wednesday." (over Job details), "Only after a clear yes does it call the booking tool.", "A second tool sends her confirmation through Resend, from our own domain." |
| 3:05 | End call. Results: Job booked card with "Email: Sent to danacole@mailinator.com", dispatch note, Brief for Mike. | **Mike:** "After the call, the LLM Gateway writes me a brief from the whole conversation. What's wrong, how she felt, and what to bring." |
| 3:16 | Dana's inbox (public test inbox): the real email from bookings@tryhangon.xyz, Friday, October 2 at 9:30 AM. | **Mike:** "Here's the email she got. Only what she actually said. Nothing made up." |
| 3:25 | Homepage schedule with the new job on top. | **Mike:** "And by the time I'm out from under the sink, it's already on my schedule." |
| 3:30 | End card: HangON, tagline, tryhangon.xyz, AssemblyAI Voice Agent API · LLM Gateway · Resend · Postgres · Vercel. | **Mike:** "HangON. Never miss a job while your hands are full." |

## How it was made
- `rig/record.mjs` drives Chrome on the live site, feeds the caller's lines in as the microphone one turn at a time (only after the agent has finished speaking), records the agent's real audio from the page, and captures the screen with ffmpeg.
- `rig/build-edl.mjs` builds the edit from the take's own timeline: cuts only in silence, narration only in real pauses, captions from the real transcript.
- `src/Final.jsx` is the Remotion composition. Render: `npx remotion render demo-video/src/index.jsx HangONFinal demo-video/out/hangon-demo-final.mp4 --public-dir=demo-video/public`.
- Raw recordings stay in `demo-video/raw/` and media in `demo-video/public/take` and `public/vo`; none of it goes to git or Vercel.
