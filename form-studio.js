// Public Form Builder forms: pill radios, price autofill, JSON submit.
(() => {
  const money = (v) => { const n = Number(String(v || '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : NaN; };
  document.querySelectorAll('form[data-fs-form]').forEach((form) => {
    if (form.dataset.fsReady) return; form.dataset.fsReady = '1';
    const status = form.querySelector('[data-fs-status]');
    const prices = [...form.closest('.fs-card')?.querySelectorAll('[data-letterman-price]') || []].map((row) => ({ sizes: row.dataset.priceSizes.split(',').map((s) => s.trim()), price: row.querySelector('b')?.textContent || '' }));
    const amounts = [...form.querySelectorAll('[data-fs-amount]')];
    const sync = () => {
      form.querySelectorAll('[data-fs-radio]').forEach((fs) => { const c = fs.querySelector('[data-fs-clear]'); if (c) c.hidden = !fs.querySelector('input:checked'); });
      amounts.forEach((input) => {
        const src = form.querySelector(`[name="${CSS.escape(input.dataset.fsAmount)}"]:checked`) || form.querySelector(`select[name="${CSS.escape(input.dataset.fsAmount)}"]`);
        const row = src && prices.find((p) => p.sizes.includes(src.value));
        if (row && (!input.value.trim() || input.dataset.fsAuto === '1')) { input.value = row.price; input.dataset.fsAuto = '1'; }
      });
    };
    amounts.forEach((input) => input.addEventListener('input', () => { input.dataset.fsAuto = ''; }));
    form.addEventListener('change', sync);
    form.querySelectorAll('[data-fs-clear]').forEach((btn) => btn.addEventListener('click', () => {
      const fs = btn.closest('fieldset'); fs.querySelectorAll('input').forEach((i) => { i.checked = false; }); btn.hidden = true; fs.querySelector('input')?.focus();
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const missing = [...form.querySelectorAll('[data-fs-radio][data-required]')].find((fs) => !fs.querySelector('input:checked'));
      if (missing) { status.textContent = `Please choose ${missing.querySelector('legend').textContent.trim()}.`; missing.querySelector('input')?.focus(); return; }
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const data = {};
      for (const [k, v] of new FormData(form).entries()) data[k] = data[k] == null ? v : [].concat(data[k], v);
      const btn = form.querySelector('[type="submit"]'); btn.disabled = true; status.textContent = 'Sending…';
      try {
        const res = await fetch(form.action, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.detail || 'Something went wrong. Please try again.');
        status.textContent = out.detail || 'Thank you!'; form.reset(); sync();
      } catch (err) { status.textContent = err.message; } finally { btn.disabled = false; }
    });
    sync();
  });
})();
