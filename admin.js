function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: options.body instanceof FormData ? { ...(options.headers || {}) } : { 'Content-Type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store',
    ...options,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

const state = { me: null, sponsors: [] };

function fillForm(form, data) {
  if (!form) return;
  for (const [key, value] of Object.entries(data || {})) {
    if (!form.elements[key]) continue;
    if (form.elements[key].type === 'checkbox') form.elements[key].checked = Boolean(value);
    else form.elements[key].value = value ?? '';
  }
}

function formPayload(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.active = Boolean(form.elements.active?.checked);
  return payload;
}

function openSponsorModal(sponsor = null) {
  const modal = document.querySelector('#sponsor-modal');
  const form = document.querySelector('#sponsor-form');
  const title = document.querySelector('#sponsor-modal-title');
  
  form.reset();
  form.elements.active.checked = true;
  form.elements.level.value = 'Community Sponsor';
  
  if (sponsor) {
    title.textContent = 'Edit Sponsor';
    fillForm(form, sponsor);
    form.elements.active.checked = Boolean(sponsor.active);
  } else {
    title.textContent = 'Add Sponsor';
    form.elements.id.value = '';
  }
  
  const bypassLabel = document.querySelector('#bypass-payment-label');
  if (state.me?.can_bypass_sponsor_payment) {
    bypassLabel.style.display = 'block';
  } else {
    bypassLabel.style.display = 'none';
  }
  
  modal.classList.add('active');
}

function closeSponsorModal() {
  const modal = document.querySelector('#sponsor-modal');
  modal.classList.remove('active');
}

async function loadMe() {
  try {
    state.me = await jsonFetch('/api/admin/me');
  } catch (error) {
    console.error('Failed to load user info:', error);
    state.me = { can_bypass_sponsor_payment: false };
  }
}

async function loadSponsors() {
  try {
    state.sponsors = await jsonFetch('/api/sponsors');
    renderSponsors();
  } catch (error) {
    console.error('Failed to load sponsors:', error);
  }
}

function renderSponsors() {
  const list = document.querySelector('#sponsors-list');
  if (!list) return;
  
  if (state.sponsors.length === 0) {
    list.innerHTML = '<p style="color: #5b6472; font-style: italic;">No sponsors yet. Click "Add Sponsor" to get started.</p>';
    return;
  }
  
  list.innerHTML = state.sponsors
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(sponsor => `
      <div class="sponsor-item">
        <div class="sponsor-item-content">
          <h4>${escapeHtml(sponsor.name)}</h4>
          <p>${sponsor.level ? escapeHtml(sponsor.level) : 'Community Sponsor'} ${sponsor.active ? '· Active' : '· Hidden'}</p>
        </div>
        <div class="sponsor-item-actions">
          <button type="button" data-edit-sponsor="${sponsor.id}" class="btn secondary">Edit</button>
          <button type="button" data-delete-sponsor="${sponsor.id}" class="btn secondary">Delete</button>
        </div>
      </div>
    `)
    .join('');
  
  list.querySelectorAll('[data-edit-sponsor]').forEach(button => {
    button.addEventListener('click', () => {
      const sponsor = state.sponsors.find(s => s.id === Number(button.dataset.editSponsor));
      if (sponsor) openSponsorModal(sponsor);
    });
  });
  
  list.querySelectorAll('[data-delete-sponsor]').forEach(button => {
    button.addEventListener('click', async () => {
      const sponsorId = Number(button.dataset.deleteSponsor);
      if (confirm('Delete this sponsor?')) {
        try {
          await jsonFetch(`/api/admin/sponsors/${sponsorId}`, { method: 'DELETE' });
          await loadSponsors();
        } catch (error) {
          alert('Failed to delete sponsor: ' + error.message);
        }
      }
    });
  });
}

function bindForms() {
  const addBtn = document.querySelector('#add-sponsor-btn');
  const closeBtn = document.querySelector('#sponsor-modal-close');
  
  if (addBtn) addBtn.addEventListener('click', () => openSponsorModal());
  if (closeBtn) closeBtn.addEventListener('click', closeSponsorModal);
  
  const modal = document.querySelector('#sponsor-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeSponsorModal();
    });
  }
  
  document.querySelector('#site-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await jsonFetch('/api/admin/site', { method: 'POST', body: JSON.stringify(formPayload(form)) });
      document.querySelector('#site-status').textContent = 'Site settings saved.';
    } catch (error) {
      document.querySelector('#site-status').textContent = 'Error: ' + error.message;
      document.querySelector('#site-status').classList.add('error');
    }
  });

  document.querySelector('#sponsor-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const statusEl = document.querySelector('#sponsor-status');
    
    try {
      const payload = formPayload(form);
      const id = payload.id;
      delete payload.id;
      
      if (id) {
        await jsonFetch(`/api/admin/sponsors/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        payload.sort_order = state.sponsors.length + 1;
        await jsonFetch('/api/admin/sponsors', { method: 'POST', body: JSON.stringify(payload) });
      }
      
      statusEl.textContent = 'Saved.';
      statusEl.classList.remove('error');
      
      setTimeout(() => {
        closeSponsorModal();
        loadSponsors();
      }, 600);
    } catch (error) {
      statusEl.textContent = 'Error: ' + error.message;
      statusEl.classList.add('error');
    }
  });
}

(async () => {
  try {
    await loadMe();
    await loadSponsors();
    bindForms();
  } catch (error) {
    console.error('Admin initialization failed:', error);
    alert('Failed to load admin dashboard: ' + error.message);
  }
})();
