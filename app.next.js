const appointmentsFeed = document.querySelector('#appointmentsFeed');
const todayScheduleCount = document.querySelector('#todayScheduleCount');
const emergencyCount = document.querySelector('#emergencyCount');
const headerWorkspaceName = document.querySelector('#headerWorkspaceName');

function emptyRow(message) {
  const empty = document.createElement('div');
  empty.className = 'empty-row';
  empty.textContent = message;
  return empty;
}

function cell(className, primary, secondary, secondaryEmpty) {
  const col = document.createElement('div');
  col.className = className;
  const strong = document.createElement('strong');
  strong.textContent = primary;
  const span = document.createElement('span');
  span.textContent = secondary || secondaryEmpty;
  if (!secondary) span.classList.add('is-empty');
  col.append(strong, span);
  return col;
}

function renderAppointments(appointments) {
  if (!appointmentsFeed) return;
  appointmentsFeed.replaceChildren();

  if (!appointments || !appointments.length) {
    appointmentsFeed.append(emptyRow('No jobs yet. Answer a call to book the first one.'));
    return;
  }

  appointments.forEach((job) => {
    const row = document.createElement('article');
    row.className = 'appointment-row';

    const statusCol = document.createElement('div');
    statusCol.className = 'apt-status-col';
    if (job.urgency === 'emergency') {
      const urgent = document.createElement('span');
      urgent.className = 'status-chip status-warn';
      urgent.textContent = 'Emergency';
      statusCol.append(urgent);
    }
    const statusChip = document.createElement('span');
    statusChip.className = job.status === 'cancelled' ? 'status-chip status-neutral' : 'status-chip status-safe';
    statusChip.textContent = job.status === 'cancelled' ? 'Cancelled' : 'Confirmed';
    statusCol.append(statusChip);

    row.append(
      cell('apt-primary-col', job.customer_name, job.service_type, 'Job not described'),
      cell('apt-secondary-col', job.scheduled_time || 'Time not set', job.address, 'No address given'),
      statusCol
    );
    appointmentsFeed.append(row);
  });
}

async function loadDashboard() {
  try {
    await fetch('/api/demo/session', { credentials: 'same-origin' }).catch(() => null);

    const [workspaceRes, calendarRes] = await Promise.all([
      fetch('/api/workspace', { credentials: 'same-origin' }),
      fetch('/api/calendar', { credentials: 'same-origin' })
    ]);

    if (workspaceRes.ok) {
      const wsData = await workspaceRes.json().catch(() => ({}));
      if (wsData.data?.name && headerWorkspaceName) headerWorkspaceName.textContent = wsData.data.name;
    }

    if (!calendarRes.ok) throw new Error('Calendar unavailable');
    const calData = await calendarRes.json().catch(() => ({}));
    const appointments = calData.data?.appointments || [];
    renderAppointments(appointments);
    if (todayScheduleCount) todayScheduleCount.textContent = String(appointments.length);
    if (emergencyCount) emergencyCount.textContent = String(appointments.filter((job) => job.urgency === 'emergency').length);
  } catch {
    appointmentsFeed?.replaceChildren(emptyRow('The schedule could not load. Refresh to try again.'));
  }
}

document.addEventListener('DOMContentLoaded', loadDashboard);
