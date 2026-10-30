/* Shared admin "Saved." toast (moved unchanged from admin.js). Styles: .admin-saved-toast in styles.css. */
let savedToastTimer = null;
let savedToastLeaveTimer = null;

const SAVED_TOAST_ENVELOPE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2Zm0 4-8 5L4 8V6l8 5 8-5v2Z"/></svg>`;
const SAVED_TOAST_KEY_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none"><circle cx="8.2" cy="9" r="3.4" stroke="currentColor" stroke-width="1.9"/><path d="M11.2 10.6 L20.4 19.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M17.1 16.5 L17.1 19.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;

function showSavedToast(message = 'Saved.', options = {}) {
  let root = document.querySelector('#admin-saved-toast');
  if (!root) {
    root = document.createElement('div');
    root.id = 'admin-saved-toast';
    root.className = 'admin-saved-toast';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `
      <div class="admin-saved-toast-backdrop" aria-hidden="true"></div>
      <div class="admin-saved-toast-panel">
        <div class="admin-saved-toast-card">
          <span class="admin-saved-toast-icon" data-saved-toast-icon hidden aria-hidden="true"></span>
          <strong data-saved-toast-message>Saved.</strong>
        </div>
      </div>`;
    document.body.appendChild(root);
  }
  const msg = root.querySelector('[data-saved-toast-message]');
  if (msg) msg.textContent = message;
  let icon = root.querySelector('[data-saved-toast-icon]');
  if (!icon) {
    const card = root.querySelector('.admin-saved-toast-card');
    if (card) {
      icon = document.createElement('span');
      icon.className = 'admin-saved-toast-icon';
      icon.dataset.savedToastIcon = '';
      icon.hidden = true;
      icon.setAttribute('aria-hidden', 'true');
      card.prepend(icon);
    }
  }
  const iconKind = options.icon === 'envelope' || options.icon === 'key' ? options.icon : '';
  const passwordSuccess = Boolean(options.passwordSuccess);
  const tone = options.tone === 'ok' || options.tone === 'neutral'
    ? 'ok'
    : (options.tone === 'break' ? 'break' : '');
  root.classList.toggle('has-icon', Boolean(iconKind));
  root.classList.toggle('is-password-success', passwordSuccess);
  root.classList.toggle('is-toast-ok', tone === 'ok');
  root.classList.toggle('is-toast-break', tone === 'break');
  if (icon) {
    if (iconKind === 'envelope') {
      icon.hidden = false;
      icon.innerHTML = SAVED_TOAST_ENVELOPE_SVG;
    } else if (iconKind === 'key') {
      icon.hidden = false;
      icon.innerHTML = SAVED_TOAST_KEY_SVG;
    } else {
      icon.hidden = true;
      icon.innerHTML = '';
    }
  }
  window.clearTimeout(savedToastTimer);
  window.clearTimeout(savedToastLeaveTimer);
  root.classList.remove('is-leaving');
  root.classList.remove('is-visible');
  void root.offsetWidth;
  root.classList.add('is-visible');
  savedToastTimer = window.setTimeout(() => {
    root.classList.add('is-leaving');
    root.classList.remove('is-visible');
    savedToastLeaveTimer = window.setTimeout(() => {
      root.classList.remove('is-leaving');
      root.classList.remove('is-password-success');
      root.classList.remove('has-icon');
      root.classList.remove('is-toast-ok');
      root.classList.remove('is-toast-break');
    }, 380);
  }, 3000);
}

function showFailedToast(detail = '') {
  const reason = String(detail || 'Something went wrong.').trim();
  const short = reason.length > 120 ? `${reason.slice(0, 117)}…` : reason;
  showSavedToast(`Failed — ${short}`);
}

window.efhsSavedToast = { saved: showSavedToast, failed: showFailedToast };
