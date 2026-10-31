import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const js = readFileSync(new URL('../site-content.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
test('calendar toast has accessible X close, Esc and backdrop close', () => {
  assert.match(js, /calendar-day-toast-close[^>]*aria-label="Close event details"/);
  assert.match(js, /event\.key === 'Escape' && !root\.hidden\) hideCalendarDayToast/);
  assert.match(js, /calendar-day-toast-backdrop'\)\?\.addEventListener\('click'/);
  assert.match(css, /\.calendar-day-toast-panel \.calendar-day-toast-close\{[^}]*width:44px;height:44px/);
});
