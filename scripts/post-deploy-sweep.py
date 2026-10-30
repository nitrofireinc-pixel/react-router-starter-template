#!/usr/bin/env python3
"""Post-deploy sweep (read-only). Usage:
  python3 scripts/post-deploy-sweep.py --base https://efhsband-dev.nitrofireinc.workers.dev --cookies /tmp/dj.txt [--out sweep-out]
Visits every public page and admin screen at 1280/980/734/390, opens flyouts and modals
(event add/edit, form builder, Studio sheets, People & Access, Ctrl+K) without saving, and reports:
page/modal overflow, elements outside their parent/modal/viewport, broken links (404), console
errors, and asset ?v= versions that don't match the build. Screenshots of failures go to --out.
Never prints cookie values."""
import argparse, asyncio, json, os, re, sys, urllib.parse
from playwright.async_api import async_playwright

PUBLIC = ['/', '/calendar', '/contact', '/boosters', '/directors', '/gallery', '/sponsors',
          '/become-a-sponsor', '/fundraising', '/in-kind', '/letterman-jacket', '/qr.html']
WIDTHS = [1280, 980, 734, 478, 390]

def redact(text):
    # Never log cookies, auth headers or tokens (Playwright call logs echo request headers).
    text = re.sub(r'(?im)^\s*-\s*(cookie|set-cookie|authorization|cf-access[\w-]*|x-[\w-]*token[\w-]*)\s*:.*$', r'    - \1: [REDACTED]', str(text))
    text = re.sub(r'(?i)(efband_session|session|token|key|secret|password)=([^;&\s"]+)', r'\1=[REDACTED]', text)
    return text
OVERFLOW_JS = r'''(sel) => {
  const vw = innerWidth, out = [];
  const scope = sel ? document.querySelector(sel) : document.body;
  if (!scope) return {page: false, items: []};
  const box = sel ? scope.getBoundingClientRect() : {left: 0, right: vw};
  for (const el of scope.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed' && !sel) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2 || r.right < -200) continue; // sr-only / skip links
    let clipped = false;
    for (let p = el.parentElement; p && p !== scope.parentElement; p = p.parentElement) {
      const pc = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(pc.overflowX)) { clipped = true; break; }
    }
    if (clipped) continue;
    if (r.right > box.right + 2 || r.left < box.left - 2) {
      out.push((el.tagName.toLowerCase() + (el.getAttribute('id') ? '#' + el.getAttribute('id') : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + ` [${Math.round(r.left)}..${Math.round(r.right)} vs ${Math.round(box.left)}..${Math.round(box.right)}]`);
      if (out.length >= 8) break;
    }
  }
  // Second pass: an element poking out of its own card. The pass above skips anything with a clipping
  // ancestor (and only compares to the viewport), so a table cut off by a card with overflow:hidden, or a
  // button hanging past a card edge, used to pass silently.
  const CARD = '.admin-card,.cms-panel,.card,.panel,.pp-sheet,.pp-card,.sh-sheet,.ev-dialog,.ev-sheet,fieldset,form,[role=dialog],dialog';
  const seen = new Set();
  for (const el of scope.querySelectorAll('*')) {
    if (out.length >= 12) break;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed' || cs.position === 'absolute') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) continue;
    if (cs.animationName !== 'none') continue;
    if (el.matches('dialog,[role=dialog],[class*=-dialog]')) continue;   // a dialog may be wider than the panel that hosts it
    let card = null, scroller = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const pc = getComputedStyle(p);
      if (pc.animationName !== 'none') { scroller = true; break; }   // marquee tracks move on purpose
      if (/(auto|scroll)/.test(pc.overflowX)) { scroller = true; break; }   // intentional horizontal scroller
      if (p.matches(CARD) || /(hidden|clip)/.test(pc.overflowX)) { card = p; break; }
    }
    if (scroller || !card) continue;
    const c = card.getBoundingClientRect();
    if (c.width <= 2) continue;
    if (r.right > c.right + 2 || r.left < c.left - 2) {
      const key = card.tagName + card.className;
      if (seen.has(key + el.tagName)) continue; seen.add(key + el.tagName);
      const nm = (e) => e.tagName.toLowerCase() + (e.getAttribute('id') ? '#' + e.getAttribute('id') : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
      out.push(`${nm(el)} outside card ${nm(card)} [${Math.round(r.left)}..${Math.round(r.right)} vs ${Math.round(c.left)}..${Math.round(c.right)}]`);
    }
  }
  // Third pass: every interactive control must be fully reachable. Flag a button/input/select/link that is
  // cut off by any clipping ancestor (overflow hidden/clip, or an auto/scroll box narrower than it that the
  // page itself cannot scroll to), or that sits outside the viewport horizontally.
  const CTRL = 'button,input:not([type=hidden]),select,textarea,a[href],[role=button],[role=checkbox],label';
  let nctrl = 0;
  for (const el of scope.querySelectorAll(CTRL)) {
    if (nctrl >= 10) break;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden],[aria-hidden=true]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;               // sr-only / visually-hidden inputs
    if (el.matches('input') && (cs.opacity === '0' || cs.clip !== 'auto' && cs.clip)) continue;
    const nm = (e) => e.tagName.toLowerCase() + (e.getAttribute('id') ? '#' + e.getAttribute('id') : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (e.name ? `[name=${e.name}]` : '') + (e.value && e.type === 'checkbox' ? `[value=${e.value}]` : '');
    // Skip closed off-canvas panels (drawer/sheet/menu parked fully off-screen) and animated tracks (marquees).
    let parked = false;
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const pc = getComputedStyle(p), pr = p.getBoundingClientRect();
      if (pc.animationName !== 'none' && p !== el) { parked = true; break; }
      if ((pc.transform !== 'none' || pc.position === 'fixed') && (pr.right <= 1 || pr.left >= vw - 1)) { parked = true; break; }
    }
    if (parked) continue;
    let bad = '';
    let inScroller = false;
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const pc = getComputedStyle(p);
      if (/(auto|scroll)/.test(pc.overflowX) && p.scrollWidth > p.clientWidth) { inScroller = true; break; }
    }
    if (!inScroller && (r.left < -1 || r.right > vw + 1)) bad = `outside viewport [${Math.round(r.left)}..${Math.round(r.right)} vs 0..${vw}]`;
    for (let p = el.parentElement; !bad && p && p !== document.documentElement; p = p.parentElement) {
      const pc = getComputedStyle(p);
      if (cs.position === 'fixed') break;   // fixed controls escape ancestor clipping
      if (/(hidden|clip|auto|scroll)/.test(pc.overflowX)) {
        const c = p.getBoundingClientRect();
        if (/(auto|scroll)/.test(pc.overflowX) && p.scrollWidth > p.clientWidth) break;
        if (r.left < c.left - 1 || r.right > c.right + 1) {
          const scrollable = /(auto|scroll)/.test(pc.overflowX) && p.scrollWidth > p.clientWidth;
          if (scrollable) break;   // reachable by scrolling this box; outer boxes clip the scroller, not the control
          bad = `clipped by ${nm(p)} (overflow-x:${pc.overflowX}) [${Math.round(r.left)}..${Math.round(r.right)} vs ${Math.round(c.left)}..${Math.round(c.right)}]`;
        }
      }
      if (pc.position === 'fixed') break;   // nothing above a fixed box can clip it
    }
    if (bad) { out.push(`CONTROL ${nm(el)} ${bad}`); nctrl++; }
  }
  return {page: !sel && document.documentElement.scrollWidth > vw + 1, items: out};
}'''

def load_cookies(path, host):
    cookies = []
    if not path: return cookies
    for line in open(path):
        http_only = line.startswith('#HttpOnly_')
        if http_only: line = line[10:]
        elif line.startswith('#') or not line.strip(): continue
        f = line.rstrip('\n').split('\t')
        if len(f) >= 7:
            cookies.append({'name': f[5], 'value': f[6], 'domain': f[0].lstrip('.') or host, 'path': f[2] or '/', 'secure': True, 'httpOnly': http_only})
    return cookies

class Sweep:
    def __init__(self, args):
        self.a = args; self.base = args.base.rstrip('/'); self.fails = []; self.checked = 0
        self.host = urllib.parse.urlparse(self.base).hostname; self.versions = {}; self.links = {}
    def fail(self, kind, where, width, detail):
        detail = redact(detail)
        self.fails.append({'kind': kind, 'where': where, 'width': width, 'detail': detail})
    async def shot(self, page, name):
        os.makedirs(self.a.out, exist_ok=True)
        safe = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:80]
        try: await page.screenshot(path=os.path.join(self.a.out, safe + '.png'))
        except Exception: pass
    async def check_layout(self, page, where, width, sel=None):
        self.checked += 1
        res = await page.evaluate(OVERFLOW_JS, sel)
        if res['page'] or res['items']:
            self.fail('overflow', where, width, ('page wider than viewport; ' if res['page'] else '') + '; '.join(res['items']))
            await self.shot(page, f'{where}-{width}-overflow')
    async def collect(self, page, where):
        info = await page.evaluate('''() => ({
          assets: [...document.querySelectorAll('link[rel=stylesheet][href],script[src]')].map(e => e.href || e.src),
          links: [...document.querySelectorAll('a[href]')].map(a => a.href)})''')
        for u in info['assets']:
            p = urllib.parse.urlparse(u)
            if p.hostname != self.host: continue
            v = urllib.parse.parse_qs(p.query).get('v', [None])[0]
            if v: self.versions.setdefault(v, set()).add(p.path)
        for u in info['links']:
            p = urllib.parse.urlparse(u)
            if p.hostname == self.host and p.scheme.startswith('http') and not re.search(r'/(logout|api/)', p.path):
                self.links.setdefault(urllib.parse.urlunparse(p._replace(fragment='')), where)
    async def visit(self, ctx, path, width, actions=None):
        page = await ctx.new_page(); errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        where = path
        try:
            resp = await page.goto(self.base + path, wait_until='load', timeout=45000)
            await page.wait_for_timeout(700)
            if not resp or resp.status >= 400:
                self.fail('status', where, width, resp.status if resp else 'no response'); await self.shot(page, f'{where}-{width}-status')
            await self.check_layout(page, where, width)
            await self.collect(page, where)
            if actions: await actions(page, where, width)
        except Exception as e:
            self.fail('error', where, width, str(e)[:300]); await self.shot(page, f'{where}-{width}-error')
        errs = [e for e in errors if 'favicon' not in e]
        if errs: self.fail('console', where, width, errs[:5])
        await page.close()
    async def modal(self, page, where, width, opener, sel, name, closer='Escape', optional=None):
        if optional and not await page.locator(optional).count():
            return  # nothing on this screen to open (e.g. no events this month)
        try:
            await opener()
            await page.wait_for_selector(sel, state='visible', timeout=8000)
            await page.wait_for_timeout(250)
            await self.check_layout(page, f'{where} › {name}', width, sel)
            r = await page.evaluate('(s)=>{const r=document.querySelector(s).getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,innerWidth,innerHeight]}', sel)
            if r[0] < -1 or r[2] > r[4] + 1 or r[3] > r[5] + 1 and r[1] > 0 and (r[3]-r[1]) < r[5]:
                self.fail('outside-viewport', f'{where} › {name}', width, r); await self.shot(page, f'{where}-{name}-{width}')
        except Exception as e:
            self.fail('modal', f'{where} › {name}', width, str(e)[:200]); await self.shot(page, f'{where}-{name}-{width}-modal')
        finally:
            if closer == 'Escape': await page.keyboard.press('Escape')
            else:
                try: await page.click(closer, timeout=2000)
                except Exception: await page.keyboard.press('Escape')
            await page.wait_for_timeout(200)

    async def admin_actions(self, page, where, width):
        # Ctrl+K on every admin screen, plus the nav flyout on narrow widths.
        if await page.query_selector('.sn-body, [data-nav-item]'):
            await self.modal(page, where, width, lambda: page.keyboard.press('Control+k'), '.sn-launch', 'Ctrl+K')
        if where.startswith('/admin/events-manager'):
            async def add():
                await page.locator('[data-act=new]:visible').first.click()
            await self.modal(page, where, width, add, '.ev-dialog:not([hidden])', 'event add')
            async def edit():
                await page.locator('.ev-ev:visible').first.click()
            await self.modal(page, where, width, edit, '.ev-dialog:not([hidden]), .ev-sheet:not([hidden])', 'event edit', optional='.ev-ev:visible')
        if where.startswith('/admin/forms-builder'):
            async def open_form():
                await page.locator('[data-edit]:visible, [data-open]:visible, .fb-card:visible').first.click()
            await self.modal(page, where, width, open_form, '[role=dialog]:not([hidden]), .fb-editor, .fb-sheet', 'form builder', optional='[data-edit]:visible, [data-open]:visible, .fb-card:visible')
        if where.startswith('/admin/people'):
            await self.modal(page, where, width, lambda: page.locator('[data-act=add]').first.click(), '.pp-sheet', 'person add')
            sel = '.pp-table tr[data-id]' if width > 760 else '.pp-card'
            await self.modal(page, where, width, lambda: page.locator(sel).first.click(), '.pp-sheet', 'person edit')
        if 'tab=users' in where:
            # Open a filled-in classic user editor (view only, never saved) so its page-access table is laid out.
            async def edit_user():
                await page.locator('[data-edit-user]').first.click()
            await self.modal(page, where, width, edit_user, '#user-form', 'classic user edit', closer='#user-form [data-cancel], #user-form .cancel', optional='[data-edit-user]')
        if where == '/admin':
            for i in range(3):
                async def open_sheet(i=i):
                    await page.locator('[data-sheet], .sh-open, [data-open-sheet]').nth(i).click()
                if await page.locator('[data-sheet], .sh-open, [data-open-sheet]').count() > i:
                    await self.modal(page, where, width, open_sheet, '[role=dialog]:not([hidden]), .sh-sheet', f'studio sheet {i+1}')

    async def admin_paths(self, ctx):
        page = await ctx.new_page()
        await page.set_viewport_size({'width': 1280, 'height': 900})
        await page.goto(self.base + '/admin', wait_until='load'); await page.wait_for_timeout(700)
        if '/admin/login' in page.url:
            await page.close(); return []
        hrefs = await page.evaluate('''() => [...new Set([...document.querySelectorAll('[data-nav-item] a[href], a[data-nav-item][href], [data-nav-href]')].map(a => a.getAttribute('href') || a.dataset.navHref).filter(Boolean))]''')
        await page.close()
        paths = ['/admin']
        for h in hrefs:
            p = urllib.parse.urlparse(urllib.parse.urljoin(self.base + '/', h))
            if p.hostname == self.host and not re.search(r'logout', p.path):
                paths.append(p.path + ('?' + p.query if p.query else ''))
        return list(dict.fromkeys(paths))

    async def run(self):
        async with async_playwright() as pw:
            browser = await pw.chromium.launch()
            cookies = load_cookies(self.a.cookies, self.host)
            admin = []
            for width in WIDTHS:
                pub = await browser.new_context(viewport={'width': width, 'height': 900})
                for path in PUBLIC: await self.visit(pub, path, width)
                await pub.close()
                if cookies:
                    ctx = await browser.new_context(viewport={'width': width, 'height': 900})
                    await ctx.add_cookies(cookies)
                    if not admin: admin = await self.admin_paths(ctx)
                    for path in admin: await self.visit(ctx, path, width, self.admin_actions)
                    await ctx.close()
            # link targets (GET only)
            req = await browser.new_context(); await req.add_cookies(cookies)
            for url, src in sorted(self.links.items()):
                try:
                    r = await req.request.get(url, max_redirects=5, timeout=30000)
                    if r.status == 404 or r.status >= 500: self.fail('link', src, '-', f'{url} → {r.status}')
                except Exception as e: self.fail('link', src, '-', f'{url} → {e}')
            await req.close(); await browser.close()
        if self.a.expect_version:
            bad = {v: sorted(p) for v, p in self.versions.items() if not v.startswith(self.a.expect_version.split('-nav')[0]) and any('/admin' in x for x in p)}
            if bad: self.fail('asset-version', 'admin assets', '-', bad)
        report = {'base': self.base, 'checks': self.checked, 'links': len(self.links), 'asset_versions': {k: len(v) for k, v in self.versions.items()}, 'failures': self.fails}
        os.makedirs(self.a.out, exist_ok=True)
        json.dump(report, open(os.path.join(self.a.out, 'report.json'), 'w'), indent=1, default=list)
        print(json.dumps({k: report[k] for k in ('base', 'checks', 'links', 'asset_versions')}, default=list))
        by = {}
        for f in self.fails: by.setdefault(f['kind'], []).append(f)
        for k, items in by.items():
            print(f'\n## {k}: {len(items)}')
            for f in items[:25]: print(f"  [{f['width']}] {f['where']}: {f['detail']}")
        print(f"\n{len(self.fails)} failures; screenshots + report.json in {self.a.out}")
        return 1 if self.fails else 0

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', required=True); ap.add_argument('--cookies'); ap.add_argument('--out', default='sweep-out')
    ap.add_argument('--expect-version', help='ADMIN_NAV_VERSION the build should serve')
    ap.add_argument('--widths', help='comma list, e.g. 390,1024,1280')
    a = ap.parse_args()
    if a.widths:
        WIDTHS[:] = [int(x) for x in a.widths.split(',')]
    sys.exit(asyncio.run(Sweep(a).run()))
