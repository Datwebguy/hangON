const pageHeading = document.querySelector('.page-heading');
const callList = document.querySelector('#callList');
const showAll = document.querySelector('#showAll');
const dashboardStatus = document.querySelector('#dashboardStatus');
const voice = window.HangOnVoice?.mount(document.querySelector('#voicePlacement'));
let allRequests = [];
let csrfToken = '';

function setStatus(message, tone = 'neutral') {
  dashboardStatus.textContent = message;
  dashboardStatus.className = 'load-status load-status-' + tone;
}

function renderCapabilities(workspace) {
  const section = document.createElement('section');
  section.className = 'panel capability-strip';
  section.setAttribute('aria-labelledby', 'capability-heading');
  const heading = document.createElement('div');
  heading.className = 'capability-strip__head';
  const title = document.createElement('h2');
  title.id = 'capability-heading';
  title.textContent = 'Workspace capabilities';
  const description = document.createElement('p');
  description.textContent = workspace.description || 'Capabilities are configured by the organization.';
  heading.append(title, description);
  const grid = document.createElement('div');
  grid.className = 'capability-grid';
  Object.values(workspace.capabilities || {}).forEach((capability) => {
    const card = document.createElement('article');
    card.className = 'capability-card' + (capability.enabled ? '' : ' capability-card--off');
    const name = document.createElement('strong');
    name.textContent = capability.label;
    const detail = document.createElement('span');
    detail.textContent = capability.description;
    const state = document.createElement('small');
    state.className = 'capability-status';
    state.textContent = capability.enabled ? 'Available' : 'Not connected';
    card.append(name, detail, state);
    grid.append(card);
  });
  section.append(heading, grid);
  pageHeading.insertAdjacentElement('afterend', section);
}

function renderIntegration(integration) {
  const section = document.createElement('section');
  section.className = 'panel integration-panel';
  section.setAttribute('aria-labelledby', 'integration-heading');

  const heading = document.createElement('div');
  heading.className = 'integration-panel__head';
  const copy = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Workspace delivery';
  const title = document.createElement('h2');
  title.id = 'integration-heading';
  title.textContent = 'Where confirmed requests go';
  const description = document.createElement('p');
  description.textContent = 'Connect this workspace to its own webhook. HangON sends only confirmed, minimum-necessary request data.';
  copy.append(eyebrow, title, description);
  const state = document.createElement('span');
  state.className = 'status-chip ' + (integration.configured ? 'status-safe' : 'status-neutral');
  state.textContent = integration.configured ? 'Connected' : 'Not connected';
  heading.append(copy, state);

  const form = document.createElement('form');
  form.className = 'integration-form';
  const urlLabel = document.createElement('label');
  urlLabel.textContent = 'Webhook URL';
  const url = document.createElement('input');
  url.type = 'url';
  url.required = true;
  url.placeholder = 'https://...';
  url.autocomplete = 'url';
  if (integration.url) url.placeholder = integration.url;
  const secretLabel = document.createElement('label');
  secretLabel.textContent = 'Signing secret';
  const secretRow = document.createElement('div');
  secretRow.className = 'integration-secret-row';
  const secret = document.createElement('input');
  secret.type = 'password';
  secret.required = true;
  secret.minLength = 32;
  secret.placeholder = 'Generate a new secret';
  secret.autocomplete = 'new-password';
  const generate = document.createElement('button');
  generate.type = 'button';
  generate.className = 'button button-secondary';
  generate.textContent = 'Generate';
  generate.addEventListener('click', () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    secret.value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  });
  secretRow.append(secret, generate);
  const actions = document.createElement('div');
  actions.className = 'integration-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'button button-primary';
  save.textContent = 'Save connection';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button button-secondary';
  remove.textContent = 'Disconnect';
  remove.hidden = !integration.configured || integration.source === 'environment';
  const feedback = document.createElement('p');
  feedback.className = 'integration-feedback';
  feedback.setAttribute('role', 'status');
  feedback.textContent = integration.source === 'environment' ? 'A server-only test connection is active. Saving here creates a workspace-specific connection.' : 'Secrets are never displayed after saving.';
  urlLabel.append(url);
  secretLabel.append(secretRow);
  actions.append(save, remove);
  form.append(urlLabel, secretLabel, actions, feedback);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    feedback.textContent = 'Saving connectiok�u���f';
    try {
      const response = await fetch('/api/integrations/webhook', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-hangon-csrf': csrfToken },
        body: JSON.stringify({ url: url.value.trim(), secret: secret.value })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || 'The connection could not be saved.');
      feedback.textContent = 'Connection saved. New confirmed requests will use this workspace destination.';
      remove.hidden = false;
      secret.value = '';
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  });

  remove.addEventListener('click', async () => {
    remove.disabled = true;
    feedback.textContent = 'Disconnecting�w^~)�v';
    try {
      const response = await fetch('/api/integrations/webhook', { method: 'DELETE', credentials: 'same-origin', headers: { 'x-hangon-csrf': csrfToken } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || 'The connection could not be removed.');
      feedback.textContent = 'Connection removed. Requests will remain saved locally.';
      state.textContent = 'Not connected';
      state.className = 'status-chip status-neutral';
      remove.hidden = true;
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      remove.disabled = false;
    }
  });

  section.append(heading, form);
  pageHeading.insertAdjacentElement('afterend', section);
}

function renderRequests(requests) {
  callList.replaceChildren();
  if (!requests.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-row';
    empty.textContent = 'No prepared requests yet. Start a call when someone needs help.';
    callList.append(empty);
    showAll.hidden = true;
    return;
  }
  requests.forEach((request) => {
    const row = document.createElement('article');
    row.className = 'call-row';
    const avatar = document.createElement('span');
    avatar.className = 'call-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = 'H';
    const main = document.createElement('span');
    main.className = 'call-main';
    const summary = document.createElement('strong');
    summary.textContent = request.request_summary;
    const meta = document.createElement('span');
    meta.textContent = new Date(request.created_at).toLocaleString();
    main.append(summary, meta);
    const state = document.createElement('span');
    const deliveryStatus = request.delivery?.status;
    state.className = 'call-status ' + (deliveryStatus === 'delivered' ? 'status-safe' : deliveryStatus === 'failed' ? 'status-warn' : 'status-neutral');
    state.textContent = deliveryStatus === 'delivered' ? 'Delivered' : deliveryStatus === 'failed' ? 'Delivery failed' : 'Saved';
    row.append(avatar, main, state);
    callList.append(row);
  });
  showAll.hidden = allRequests.length <= requests.length;
}

async function startDashboard() {
  const sessionBody = await window.HangOnAuth.ensureSession();
  csrfToken = sessionBody.data?.csrf || '';
  const [workspaceResponse, requestsResponse, integrationResponse] = await Promise.all([
    fetch('/api/workspace', { credentials: 'same-origin' }),
    fetch('/api/requests?limit=100', { credentials: 'same-origin' }),
    fetch('/api/integrations/webhook', { credentials: 'same-origin' })
  ]);
  const workspaceBody = await workspaceResponse.json().catch(() => ({}));
  const requestsBody = await requestsResponse.json().catch(() => ({}));
  const integrationBody = await integrationResponse.json().catch(() => ({}));
  if (!workspaceResponse.ok) throw new Error(workspaceBody.error?.message || 'Workspace could not be loaded.');
  if (!requestsResponse.ok) throw new Error(requestsBody.error?.message || 'Requests could not be loaded.');
  if (!integrationResponse.ok) throw new Error(integrationBody.error?.message || 'Delivery settings could not be loaded.');
  renderCapabilities(workspaceBody.data || {});
  renderIntegration(integrationBody.data || {});
  allRequests = requestsBody.data || [];
  renderRequests(allRequests.slice(0, 20));
}

showAll.addEventListener('click', () => {
  renderRequests(allRequests);
  showAll.disabled = true;
  showAll.textContent = 'All requests shown';
});

(async () => {
  try {
    await startDashboard();
    setStatus('Workspace ready', 'safe');
  } catch (error) {
    setStatus(error.message, 'warn');
  }
})();
