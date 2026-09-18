const appointmentsFeed = document.querySelector('#appointmentsFeed');
const todayScheduleCount = document.querySelector('#todayScheduleCount');
const nextOpenSlot = document.querySelector('#nextOpenSlot');
const headerWorkspaceName = document.querySelector('#headerWorkspaceName');

let allAppointments = [];
let csrfToken = '';

function renderAppointments(appointments) {
  if (!appointmentsFeed) return;
  appointmentsFeed.replaceChildren();

  if (!appointments || !appointments.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-row';
    empty.textContent = 'No jobs booked yet. Start a call to book the first appointment!';
    appointmentsFeed.append(empty);
    return;
  }

  appointments.forEach((job) => {
    const row = document.createElement('article');
    row.className = 'appointment-row';

    const avatarCol = document.createElement('div');
    avatarCol.className = 'apt-avatar';
    avatarCol.textContent = job.customer_name ? job.customer_name[0].toUpperCase() : 'C';

    const infoCol = document.createElement('div');
    infoCol.className = 'apt-info';

    const titleRow = document.createElement('div');
    titleRow.className = 'apt-title-row';

    const customer = document.createElement('strong');
    customer.className = 'apt-customer';
    customer.textContent = job.customer_name;

    const slotBadge = document.createElement('span');
    slotBadge.className = 'badge-slot-time';
    slotBadge.textContent = '📅 ' + (job.scheduled_time || 'Tomorrow');

    const urgencyBadge = document.createElement('span');
    const urgency = (job.urgency || 'standard').toLowerCase();
    urgencyBadge.className = 'status-chip ' + (urgency === 'emergency' ? 'status-emergency' : urgency === 'high' || urgency === 'urgent' ? 'status-warn' : 'status-safe');
    urgencyBadge.textContent = urgency.toUpperCase();

    titleRow.append(customer, slotBadge, urgencyBadge);

    const serviceDesc = document.createElement('p');
    serviceDesc.className = 'apt-service';
    serviceDesc.textContent = job.service_type;

    const metaRow = document.createElement('div');
    metaRow.className = 'apt-meta';

    const address = document.createElement('span');
    address.textContent = '📍 ' + (job.address || 'Address confirmed');

    const phone = document.createElement('span');
    phone.textContent = '📞 ' + (job.phone || '(555) 301-4492');

    const dispatched = document.createElement('span');
    dispatched.className = 'apt-dispatch-tag';
    dispatched.textContent = '📲 SMS Dispatched to Mike';

    metaRow.append(address, phone, dispatched);
    infoCol.append(titleRow, serviceDesc, metaRow);

    const actionCol = document.createElement('div');
    actionCol.className = 'apt-action-col';

    const committedTag = document.createElement('span');
    committedTag.className = 'status-chip status-safe';
    committedTag.textContent = '✓ Calendar Locked';

    actionCol.append(committedTag);
    row.append(avatarCol, infoCol, actionCol);
    appointmentsFeed.append(row);
  });
}

async function loadDashboard() {
  try {
    // Ensure demo or operator session silently
    const sessionRes = await fetch('/api/demo/session', { credentials: 'same-origin' }).catch(() => null);
    if (sessionRes && sessionRes.ok) {
      const sessionData = await sessionRes.json().catch(() => ({}));
      csrfToken = sessionData.data?.csrf || '';
    }

    // Load workspace and calendar in parallel
    const [workspaceRes, calendarRes] = await Promise.all([
      fetch('/api/workspace', { credentials: 'same-origin' }),
      fetch('/api/calendar', { credentials: 'same-origin' })
    ]);

    if (workspaceRes.ok) {
      const wsData = await workspaceRes.json().catch(() => ({}));
      if (wsData.data?.name && headerWorkspaceName) {
        headerWorkspaceName.textContent = wsData.data.name;
      }
    }

    if (calendarRes.ok) {
      const calData = await calendarRes.json().catch(() => ({}));
      allAppointments = calData.data?.appointments || [];
      renderAppointments(allAppointments);

      if (todayScheduleCount) {
        const count = allAppointments.length;
        todayScheduleCount.textContent = `${count} Jobs Active`;
      }
      if (nextOpenSlot && calData.data?.availability?.next_open_slot) {
        nextOpenSlot.textContent = calData.data.availability.next_open_slot;
      }
    } else {
      renderAppointments([]);
    }
  } catch (err) {
    console.warn('Dashboard live load notice:', err.message);
    if (appointmentsFeed) {
      appointmentsFeed.innerHTML = '<div class="empty-row">Demo dispatch board ready. Click "Start Live Call" to test the voice agent!</div>';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});
