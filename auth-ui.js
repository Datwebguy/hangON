(function () {
  const styles = `
    .operator-auth-shell { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 1.25rem; background: rgba(8, 18, 16, .62); backdrop-filter: blur(8px); }
    .operator-auth-card { width: min(100%, 30rem); padding: 2rem; border: 1px solid rgba(17, 73, 61, .18); border-radius: 1.2rem; background: #fff; box-shadow: 0 2rem 5rem rgba(6, 29, 24, .22); }
    .operator-auth-card h2 { margin: 0 0 .55rem; color: #0d2520; font-size: 1.65rem; }
    .operator-auth-card p { margin: 0 0 1.25rem; color: #5d706b; line-height: 1.55; }
    .operator-auth-card label { display: block; margin-bottom: .45rem; color: #163d33; font-size: .82rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
    .operator-auth-card input { width: 100%; min-height: 3rem; padding: .7rem .8rem; border: 1px solid #cad9d4; border-radius: .65rem; color: #0d2520; font: inherit; }
    .operator-auth-card input:focus { outline: 3px solid rgba(47, 126, 105, .2); border-color: #2f7e69; }
    .operator-auth-actions { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.25rem; }
    .operator-auth-submit { border: 0; border-radius: .65rem; padding: .75rem 1rem; color: #fff; background: #113e34; font: inherit; font-weight: 700; cursor: pointer; }
    .operator-auth-submit:disabled { opacity: .6; cursor: wait; }
    .operator-auth-status { min-height: 1.35rem; color: #a34e22; font-size: .85rem; }
  `;
  const style = document.createElement('style');
  style.textContent = styles;
  document.head.append(style);

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
      description.textContent = 'Enter your workspace access code to manage today's jobs. It stays on this device session only.';
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
