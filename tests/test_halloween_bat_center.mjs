import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const js = readFileSync(new URL('../site-content.js', import.meta.url), 'utf8');
test('halloween bat is centered over the banner and never blocks taps', () => {
  const place = js.slice(js.indexOf('const placeBat = () => {'), js.indexOf("window.addEventListener('resize', placeBat"));
  assert.match(place, /--hw-bat-left', '50%'/);
  assert.doesNotMatch(place, /r\.left - reach/);
  assert.match(js, /#efhs-halloween\{position:fixed;inset:0 0 auto 0;height:0;z-index:1000;pointer-events:none\}/);
  assert.match(js, /#efhs-halloween \*\{pointer-events:none\}/);
  assert.match(js, /\.hw-bat\{[^}]*width:46px;height:24px/);
});
import { halloweenBatHeaderStyle, halloweenBatLockScript } from '../worker/src/worker.mjs';
test('worker bat lock centers the bat over the header banner, above it, tap-through', () => {
  assert.match(halloweenBatLockScript(), /--hw-bat-left",Math\.round\(\(h\.width-bw\)\/2\)/);
  assert.doesNotMatch(halloweenBatLockScript(), /brand-logo/);
  assert.match(halloweenBatHeaderStyle(), /z-index:60!important;pointer-events:none!important/);
  assert.match(halloweenBatHeaderStyle(), /#efhs-halloween \*\{pointer-events:none!important\}/);
});
test('bat glows on the dark banner and steps off the brand text', () => {
  assert.match(halloweenBatHeaderStyle(), /\.hw-bat\{[^}]*filter:drop-shadow\([^}]*#f5c542/);
  assert.match(halloweenBatLockScript(), /\.brand,#site-nav a,#site-nav button,\.menu-button/);
  assert.match(halloweenBatLockScript(), /c\.push\(r\.top-h\.top-bh-2,r\.bottom-h\.top\+2\)/);
});
