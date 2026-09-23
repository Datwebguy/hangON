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
    empty.textContent = 'No jobs yet. Answer a call to book the first one.';
    appointmentsFeed.append(empty);
    return;
  }

  appointments.forEach((job) => {
    const row = document.createElement('article');
    row.className = 'appointment-row';

    const primaryCol = document.createElement('div');
    primaryCol.className = 'apt-primary-col';
    const customer = document.createElement('strong');
    customer.className = 'apt-customer';
    customer.textContent = job.customer_name;
    const serviceDesc = document.createElement('span');
    serviceDesc.className = 'apt-service';
    serviceDesc.textContent = job.service_type;
    primaryCol.append(customer, serviceDesc);

    const secondaryCol = document.createElement('div');
    secondaryCol.className = 'apt-secondary-col';
    const time = document.createElement('strong');
    time.className = 'apt-time';
    time.textContent = job.scheduled_time || 'Tomorrow';
    const address = document.createElement('span');
    address.className = 'apt-address';
    address.textContent = job.address || 'Address confirmed';
    secondaryCol.append(time, address);

    const statusCol = document.createElement('div');
    statusCol.className = 'apt-status-col';
    const statusChip = document.createElement('span');
    statusChip.className = 'status-chip status-safe';
    statusChip.textContent = 'Confirmed';
    statusCol.append(statusChip);

    row.append(primaryCol, secondaryCol, statusCol);
    appointmentsFeed.append(row);
  });
}

async function loadDashboard() {
  try {
    const sessionRes = await fetch('/api/demo/session', { credentials: 'same-origin' }).catch(() => null);
    if (sessionRes && sessionRes.ok) {
      const sessionData = await sessionRes.json().catch(() => ({}));
      csrfToken = sessionData.data?.csrf || '';
    }

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
        todayScheduleCount.textContent = count === 1 ? '1 job' : `${count} jobs`;
      }
      if (nextOpenSlot && calData.data?.availability?.next_open_slot) {
        nextOpenSlot.textContent = calData.data.availability.next_open_slot;
      }
    } else {
      renderAppointments([]);
    }
  } catch (err) {
    // Dashboard load failed - show empty state
    if (appointmentsFeed) {
      appointmentsFeed.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'empty-row';
      empty.textContent = 'Schedule will appear here. Open Answer a call to book a job.';
      appointmentsFeed.append(empty);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});
