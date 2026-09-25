(function () {
  function showLogin() {
    return new Promise((resolve, reject) => {
      const shell = document.createElement('div');
      shell.className = 'operator-auth-shell';
      shell.setAttribute('role', 'dialog');
      shell.setAttribute('aria-modal', 'true');
      shell.setAttribute('aria-labelledby', 'operator-auth-title');
      const card = document.createElement('form');
      card.className = 'operator-auth-card';
      const title = document.createElement('h2');
      title.id = 'operator-auth-title';
      title.textContent = 'Sign in to HangON';
      const description = document.createElement('p');
      description.textContent = 'Enter your workspace access code to manage today\'s jobs. It stays on this device session only.';
      const label = document.createElement('label');
      label.htmlFor = 'operator-token';
      label.textContent = 'Access code';
      const input = document.createElement('input');
      input.id = 'operator-token';
      input.name = 'token';
      input.type = 'password';
      input.autocomplete = 'current-password';
      input.required = true;
      input.placeholder = 'Your access code';
      const status = document.createElement('div');
      status.className = 'operator-auth-status';
      status.setAttribute('role', 'alert');
      const actions = document.createElement('div');
      actions.className = 'operator-auth-actions';
      const note = document.createElement('span');
      note.textContent = 'Private workspace';
      const submit = document.createElement('button');
      submit.className = 'operator-auth-submit';
      submit.type = 'submit';
      submit.textContent = 'Continue';
      actions.append(note, submit);
      card.append(title, description, label, input, status, actions);
      shell.append(card);
      document.body.append(shell);
      input.focus();

      card.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;
        status.textContent = 'Checking access…';
        try {
          const response = await fetch('/api/operator/login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: input.value }) });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error?.message || 'Operator sign in failed.');
          shell.remove();
          resolve(body);
        } catch (error) {
          status.textContent = error.message;
          input.select();
          submit.disabled = false;
        }
      });
    });
  }

  async function ensureSession({ interactive = true } = {}) {
    const response = await fetch('/api/session', { credentials: 'same-origin' });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body;
    if (body.error?.code === 'authentication_required') return interactive ? showLogin() : null;
    if (body.error?.code === 'auth_not_configured') throw new Error('Operator access is not configured for this deployment.');
    throw new Error(body.error?.message || 'Your workspace session could not be created.');
  }

  async function ensureDemoSession() {
    const response = await fetch('/api/demo/session', { credentials: 'same-origin' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || 'The public demo session could not be created.');
    return body;
  }

  window.HangOnAuth = { ensureSession, ensureDemoSession };
}());
