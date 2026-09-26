// Real scheduling for the technician calendar. Times are local to the business timezone and
// written as "YYYY-MM-DDTHH:mm" (no offset), so the agent, the server and the UI agree on them.

const DEFAULTS = {
  timezone: 'America/New_York',
  openHour: 8,
  closeHour: 18,
  workDays: [1, 2, 3, 4, 5, 6], // Monday to Saturday
  slotMinutes: 90,
  stepMinutes: 30,
  horizonDays: 14
};

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function scheduleConfig(workspace = {}) {
  return { ...DEFAULTS, ...(workspace.schedule || {}), timezone: workspace.timezone || workspace.schedule?.timezone || DEFAULTS.timezone };
}

// Current wall-clock time in the business timezone, as naive local minutes.
export function nowLocal(config, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function parseLocal(value) {
  const m = LOCAL_RE.exec(String(value || '').trim().slice(0, 16));
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (date.getUTCMonth() !== mo - 1 || h > 23 || mi > 59) return null;
  return date; // a UTC Date used only as a naive local clock
}

const toLocal = (date) => date.toISOString().slice(0, 16);
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);

export function labelFor(value) {
  const date = parseLocal(value);
  if (!date) return null;
  const day = date.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
  return `${day} at ${time}`;
}

// The next N days with their dates, so the agent never has to do calendar arithmetic.
export function upcomingDays(config, now = new Date()) {
  const today = parseLocal(nowLocal(config, now));
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Array.from({ length: config.horizonDays }, (_, i) => {
    const d = addMinutes(start, i * 1440);
    return {
      date: toLocal(d).slice(0, 10),
      label: d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }),
      open: config.workDays.includes(d.getUTCDay())
    };
  });
}

function withinHours(date, config) {
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return config.workDays.includes(date.getUTCDay())
    && minutes >= config.openHour * 60
    && minutes + config.slotMinutes <= config.closeHour * 60;
}

function clashes(date, jobs, config) {
  return jobs.some((job) => {
    if (job.status === 'cancelled') return false;
    const booked = parseLocal(job.scheduled_at);
    return booked && Math.abs(booked - date) < config.slotMinutes * 60000;
  });
}

function nextOpenSlots(from, jobs, config, count = 3) {
  const slots = [];
  const stepMs = config.stepMinutes * 60000;
  let cursor = new Date(Math.ceil(from.getTime() / stepMs) * stepMs);
  const limit = addMinutes(from, config.horizonDays * 1440);
  while (slots.length < count && cursor < limit) {
    if (withinHours(cursor, config) && !clashes(cursor, jobs, config)) {
      slots.push({ start: toLocal(cursor), label: labelFor(toLocal(cursor)) });
      cursor = addMinutes(cursor, config.slotMinutes);
    } else {
      cursor = addMinutes(cursor, config.stepMinutes);
    }
  }
  return slots;
}

/**
 * Checks one requested start time against business hours and booked jobs.
 * Returns open alternatives from the real calendar when the request can't be met.
 */
export function checkSlot(jobs, preferredStart, config, now = new Date()) {
  const current = parseLocal(nowLocal(config, now));
  const requested = parseLocal(preferredStart);
  if (!requested) {
    return { available: false, reason: 'invalid_time', message: 'Give the requested time as YYYY-MM-DDTHH:mm in local time.', open_slots: nextOpenSlots(addMinutes(current, 60), jobs, config) };
  }
  const base = { requested_start: toLocal(requested), requested_label: labelFor(toLocal(requested)) };
  let reason = null;
  if (requested < current) reason = 'in_the_past';
  else if (!config.workDays.includes(requested.getUTCDay())) reason = 'closed_that_day';
  else if (!withinHours(requested, config)) reason = 'outside_hours';
  else if (clashes(requested, jobs, config)) reason = 'already_booked';
  if (!reason) return { ...base, available: true };
  const from = requested < current ? addMinutes(current, 60) : requested;
  return { ...base, available: false, reason, open_slots: nextOpenSlots(from, jobs, config) };
}

export function hoursSummary(config) {
  const fmt = (h) => new Date(Date.UTC(2000, 0, 1, h)).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric' });
  const days = config.workDays.length === 6 && !config.workDays.includes(0) ? 'Monday to Saturday' : config.workDays.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');
  return `${days}, ${fmt(config.openHour)} to ${fmt(config.closeHour)}, jobs take about ${config.slotMinutes} minutes`;
}
