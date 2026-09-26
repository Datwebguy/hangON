I want you to help me create a beautiful demo video for HangON. No AI slop.

First, watch this reference video: "C:\Users\DELL\Downloads\ssstwitter.com_1790280857369.mp4"
and break down what makes it good. Use your video / HyperFrames / MCP tools to watch it. Don't spam extra tools.

Pick the parts that fit HangON, then create our own version around them.

Read C:\Users\DELL\Downloads\hangON\hangon-prototype\demo-video\script.md
That is the starting script. Improve it if the cut or the live site needs it. Male voice. Human. Not a trailer. About 2 minutes. The audience is the judges of the AssemblyAI Voice Agent Hackathon.

HangON is a voice front desk for solo plumbers, electricians and HVAC pros. It answers the call, understands messy speech, confirms the job, books it on the schedule, emails the caller a confirmation, and writes a brief for the technician.

We integrated AssemblyAI, Resend, Postgres and Vercel. When the walkthrough reaches the screens they power, talk about the integration and what we got from it. Say it in the VO while that UI is on screen. Don't skip them:
- AssemblyAI Voice Agent API: the live call itself. Real-time two-way voice, natural turn-taking, the caller can interrupt, and tool calling to check availability, book the job and send the email.
- AssemblyAI LLM Gateway: the "Job details" and "What we heard" panels. It turns the transcript into structured fields and keeps the caller's final answer after a self-correction ("Thursday, no, Friday"). After the call it writes the "Brief for Mike": summary, caller mood, parts to bring. Anything the caller never said shows as "Not given"; nothing is invented.
- Resend: the confirmation email the caller asks for on the call, sent from our own domain while they are still on the line. The booking card shows "Email: Sent to ...".
- Postgres: every booked job persists and appears on the homepage schedule.
- Vercel: hosting at tryhangon.xyz.

Use a good voiceover, proper sound design, music where necessary, clean transitions, and make the whole thing feel cinematic. Remove anything that looks or sounds AI-generated or generic.

Open https://tryhangon.xyz in Chromium. Move like a person. Scroll the full product, from the homepage through every live screen, every feature, every page, every interaction. Don't skip whole areas of the app:
- Homepage: hero, the "Caller said / HangON booked" example card, How it works, the Booked jobs schedule, light/dark theme toggle.
- Live call page: voice picker, sample calls, Start call, the live transcript, Job details, What we heard, the Job booked card with the email status, the Dispatch note, the Brief for Mike, End.
- Back to the schedule to show the new job landed.

Microphone and email
When the browser asks for the microphone, allow it.
Speak the caller's lines clearly, one sentence at a time, and let HangON finish before you answer. Include one real self-correction (a day or an address) so the extraction has something to fix.
When HangON reads the booking back, confirm only after checking it matches what was said.
When the caller asks for an email, spell a real inbox we can show on camera, slowly. Then open that inbox and show the actual email arriving: subject, Job, When, Where.
If a call goes wrong, do it again. Never fake a transcript, a booking or an email.

Honesty (strict)
- The HangON agent voice in the video is the real AssemblyAI voice from the recorded call. Never replace it with a generated voice.
- Every number, name, time and brief on screen comes from a real call on the live site. No mocked UI, no edited results.
- Don't claim features we don't have: no SMS sending, no price quotes, no technician distance.
- The sample-call buttons are a fallback only. They don't send email, so they can't stand in for the email scene.

Alignment (strict)
- Script beat matches what's on screen. If the VO talks about the email, the inbox or the booking card is on screen.
- Clicks land on the real control. No missed buttons, no clicking empty padding.
- Typed text only goes into the field it belongs to.
- Subtitles or callouts quote the real on-screen text, word for word.
- No dead air longer than a beat. Trim waits for the model, but never cut in a way that changes what happened.

Deliverables
- The final render at demo-video/out/hangon-demo-final.mp4 (1920x1080, 30fps), plus the updated script.
- Keep the raw screen recordings and call audio next to it so any shot can be re-cut.
- Build on the existing Remotion project in demo-video/ (or HyperFrames) where it helps. Reuse hangon-logo.png. Don't invent a new brand.
