import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright-core';
import { makeServer } from '../../backend/server.js';

// Even an unexpected request reaches a keyless server. External traffic is blocked.
const server = makeServer(null);
let browser, origin;
before(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch(process.env.INKLU_CHROMIUM
    ? { executablePath: process.env.INKLU_CHROMIUM } : { channel: 'chrome' });
});
after(async () => {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

const sample = [
  'ምናባዊ ረዳቶች ሰዎችንና ድርጅቶችን በመስመር ላይ ይደግፋሉ። የሥራቸው ባህሪም እየተለወጠ ነው።',
  'አዳዲስ መሣሪያዎች ኢሜይል ለመጻፍ፣ መረጃ ለማደራጀትና ስብሰባዎችን ለማቀድ ይረዳሉ።',
  'ደንበኞችን በጥሞና ማዳመጥና ቅድሚያ የሚሰጠውን ሥራ መለየት አስፈላጊ ነው።',
  'መልእክት ከመላክዎ በፊት የተዘጋጀውን ጽሑፍ ያንብቡ።',
].join('\n\n');
const mp3 = Buffer.alloc(417 * 240);
for (let i = 0; i < 240; i++) mp3.set([0xff, 0xfb, 0x90, 0x64], i * 417);

async function setup(t, options = {}) {
  const page = await browser.newPage({ viewport: options.viewport ?? { width: 1440, height: 900 },
    reducedMotion: 'reduce', forcedColors: options.forcedColors ?? 'none' });
  t.after(() => page.close());
  page.setDefaultTimeout(5000);
  const calls = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    calls.push([url.pathname, route.request().postDataJSON()]);
    if (url.pathname === '/api/translate') {
      await options.waitTranslation;
      return route.fulfill({ json: { translation: options.text ?? sample } });
    }
    if (options.speech) return options.speech(route, url.pathname);
    if (url.pathname.endsWith('/estimate')) return route.fulfill({ json: { estimatedCost: 0.5, currency: 'ETB', voice: 'am-hamen', quoteId: 'offline' } });
    assert.equal(url.pathname, '/api/speech/generate');
    assert.deepEqual(calls.at(-1)[1], { confirmed: true, quoteId: 'offline' });
    return route.fulfill({ contentType: 'audio/mpeg', body: mp3 });
  });
  const path = options.path ?? '/pages/concept-with-navigation.html';
  await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
  const button = name => page.getByRole('button', { name, exact: true });
  const launcher = button('Inklu Companion');
  await launcher.waitFor();
  return { page, calls, launcher, button, panel: page.getByRole('dialog', { name: 'Inklu' }) };
}

test('keyboard launcher, modal focus, mode navigation, escape and no layout shift', async t => {
  const { page, launcher, panel, calls, button } = await setup(t);
  const position = () => page.locator('.formatted-content').first().evaluate(el => el.getBoundingClientRect().top + scrollY);
  const before = await position();
  assert.equal((await launcher.innerText()).replace(/\s+/g, ' ').trim(), 'Inklu Companion');
  assert.equal(await launcher.getAttribute('aria-haspopup'), 'dialog');
  await launcher.focus();
  await launcher.press('Enter');
  assert(await panel.isVisible());
  assert(await button('Close Inklu').evaluate(el => el.matches(':focus-visible')));
  assert.equal(await position(), before);
  await page.keyboard.press('Shift+Tab');
  assert(await button('Translate with Addis AI').evaluate(el => el.matches(':focus')));
  await page.keyboard.press('Tab');
  assert(await button('Close Inklu').evaluate(el => el.matches(':focus')));
  await page.keyboard.press('Tab');
  assert(await page.getByRole('tab', { name: 'Translate' }).evaluate(el => el.matches(':focus')));
  await page.keyboard.press('ArrowLeft');
  assert(await panel.getByRole('heading', { name: 'Simplified English' }).isVisible());
  await page.keyboard.press('End');
  assert(await panel.getByRole('heading', { name: 'Visual descriptions' }).isVisible());
  assert.equal(await panel.getByText('Extracted lesson content (debug preview)').isVisible(), false);
  assert.deepEqual(calls, []);
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  assert(await launcher.evaluate(el => el.matches(':focus')));
});

test('selected mode has a contrasting indicator after focus leaves the tabs', async t => {
  const { page, launcher } = await setup(t);
  await launcher.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Tab');
  const tab = page.getByRole('tab', { name: 'Simplify', selected: true });
  const indicator = await tab.evaluate(el => {
    const style = getComputedStyle(el);
    return { focused: el.matches(':focus'), width: parseFloat(style.borderBottomWidth), style: style.borderBottomStyle,
      color: style.borderBottomColor, inside: style.backgroundColor, outside: getComputedStyle(el.parentElement).backgroundColor };
  });
  function luminance(rgb) {
    const [r, g, b] = rgb.match(/\d+/g).map(Number).map(n => n / 255)
      .map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  assert.equal(indicator.focused, false);
  assert.equal(indicator.style, 'solid');
  assert.ok(indicator.width >= 2);
  for (const background of [indicator.inside, indicator.outside]) {
    const levels = [luminance(indicator.color), luminance(background)].sort((a, b) => b - a);
    assert.ok((levels[0] + 0.05) / (levels[1] + 0.05) >= 3);
  }
});

for (const scenario of ['same terms', 'price change', 'voice change', 'server conflict', 'drawer closed']) {
  test('reviewing an audio quote: ' + scenario, async t => {
    const start = Date.UTC(2026, 0, 1);
    const refreshing = Promise.withResolvers();
    const release = Promise.withResolvers();
    let estimates = 0;
    const attempts = [];
    const { page, panel, launcher, button } = await setup(t, { speech: async (route, path) => {
      const body = route.request().postDataJSON();
      if (path.endsWith('/estimate')) {
        assert.equal(body.text, sample.split('\n\n')[0]);
        estimates++;
        if (estimates === 2) {
          refreshing.resolve();
          await release.promise;
        }
        return route.fulfill({ json: { quoteId: 'quote-' + estimates, currency: 'ETB',
          expiresAt: start + (estimates === 1 ? 120000 : 3600000),
          estimatedCost: estimates > 1 && scenario === 'price change' ? 0.4 : 0.5,
          voice: estimates > 1 && scenario === 'voice change' ? 'am-other' : 'am-hamen' } });
      }
      assert.equal(body.confirmed, true);
      attempts.push(body.quoteId);
      if (scenario === 'server conflict' && attempts.length === 1) {
        return route.fulfill({ status: 409, json: { error: 'Quote invalidated.' } });
      }
      return route.fulfill({ contentType: 'audio/mpeg', body: mp3 });
    } });
    await page.clock.setFixedTime(new Date(start));
    await launcher.press('Enter');
    await button('Translate with Addis AI').press('Enter');
    await button('Listen to passage 1').press('Space');
    const confirm = button('Confirm generation');
    await confirm.waitFor();
    if (scenario !== 'server conflict') await page.clock.setFixedTime(new Date(start + 1800000));
    assert.equal(estimates, 1);
    assert.deepEqual(attempts, []);
    await confirm.press('Enter');
    await refreshing.promise;
    await page.keyboard.press('Enter');
    if (scenario === 'drawer closed') await page.keyboard.press('Escape');
    release.resolve();
    if (scenario === 'drawer closed') {
      await launcher.press('Enter');
      assert(await button('Listen to passage 1').isEnabled());
      assert.equal(await confirm.count(), 0);
      assert.deepEqual(attempts, []);
      return;
    }
    if (scenario !== 'same terms') {
      await panel.getByText(/Review the refreshed estimate/).waitFor();
      assert(await confirm.evaluate(el => el.matches(':focus')));
      assert((await panel.locator('#speech-status').innerText()).includes(scenario === 'price change' ? '0.4 ETB' :
        scenario === 'voice change' ? 'am-other' : '0.5 ETB'));
      assert.deepEqual(attempts, scenario === 'server conflict' ? ['quote-1'] : []);
      await confirm.press('Enter');
    }
    await button('Play passage 1').waitFor();
    assert.equal(estimates, 2);
    assert.deepEqual(attempts, scenario === 'server conflict' ? ['quote-1', 'quote-2'] : ['quote-2']);
  });
}

test('translation error is retryable and stale audio estimates cannot reappear', async t => {
  const { page, launcher, panel, button } = await setup(t);
  await launcher.click();
  const action = button('Translate with Addis AI');
  await page.route('**/api/translate', route => route.fulfill({ status: 503, json: { error: 'test failure' } }), { times: 1 });
  await action.click();
  await panel.getByText(/Translation is unavailable/).waitFor();
  await action.press('Enter');
  const pending = Promise.withResolvers();
  const arrived = Promise.withResolvers();
  await page.route('**/api/speech/estimate', async route => {
    arrived.resolve();
    await pending.promise;
    await route.fulfill({ json: { currency: 'ETB', estimatedCost: 0.4, quoteId: 'stale', voice: 'test' } }).catch(() => {});
  });
  await button('Listen to passage 1').click();
  await arrived.promise;
  await button('Close Inklu').click();
  pending.resolve();
  await launcher.click();
  assert(await button('Listen to passage 1').isEnabled());
  assert.equal(await button('Confirm generation').count(), 0);
});

test('mode transitions preserve one translation; audio stays scoped to one passage and one approval', async t => {
  const gate = Promise.withResolvers();
  const { page, launcher, panel, calls, button } = await setup(t, { waitTranslation: gate.promise });
  await launcher.click();
  await button('Translate with Addis AI').click();
  await page.getByRole('tab', { name: 'Describe' }).click();
  await page.getByRole('tab', { name: 'Translate' }).click();
  gate.resolve();
  const first = button('Listen to passage 1'), second = button('Listen to passage 2');
  await first.waitFor();
  assert.equal(calls.length, 1);
  assert.equal(await panel.locator('.passage p[lang="am"]').count(), 4);
  assert.equal(await panel.getByRole('combobox').count(), 0);
  await first.press('Space');
  await button('Confirm generation').waitFor();
  assert.equal(calls.at(-1)[1].text, sample.split('\n\n')[0]);
  await button('Cancel').press('Enter');
  assert(await first.evaluate(el => el.matches(':focus')));
  await second.press('Enter');
  await panel.getByText(/0.5 ETB/).waitFor();
  assert(!calls.some(([path]) => path.endsWith('/generate')));
  await button('Confirm generation').press('Enter');
  await button('Play passage 2').press('Enter');
  await button('Pause passage 2').press('Space');
  await button('Resume passage 2').press('Enter');
  await button('Stop Amharic audio').press('Enter');
  await button('Play passage 2').press('Enter');
  await button('Pause passage 2').waitFor();
  await first.click();
  assert(await second.isVisible());
  assert.equal(await panel.locator('.passage.active').count(), 1);
  await button('Close Inklu').click();
  await launcher.click();
  assert(await second.isVisible());
  assert.equal(calls.filter(([path]) => path === '/api/translate').length, 1);
  assert.equal(calls.filter(([path]) => path.endsWith('/generate')).length, 1);
});

test('developer preview, missing lesson and stale translation cleanup', async t => {
  const { page, panel, launcher, button, calls } = await setup(t, { path: '/tests/lesson-content.html?inkluDebug=1' });
  await launcher.click();
  await button('Translate with Addis AI').click();
  await button('Listen to passage 1').waitFor();
  await page.locator('#example').evaluate(el => { el.value = 'schedule'; el.dispatchEvent(new Event('change')); });
  await panel.getByText('Reading a weekly schedule', { exact: true }).waitFor();
  assert.equal(await button('Listen to passage 1').count(), 0);
  await panel.locator('summary').click();
  await panel.locator('#preview').getByText(/Check both time zones/).waitFor();
  await page.locator('#example').evaluate(el => { el.value = 'empty'; el.dispatchEvent(new Event('change')); });
  await button('Translate with Addis AI').click();
  await panel.getByText('No lesson text is available to translate.').waitFor();
  assert.equal(calls.length, 1);
});

for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  test(name + ' translated layout', async t => {
    const { page, panel, button, launcher } = await setup(t, { viewport });
    if (name === 'desktop' && process.env.INKLU_SCREENSHOTS) {
      await mkdir(process.env.INKLU_SCREENSHOTS, { recursive: true });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(process.env.INKLU_SCREENSHOTS, 'launcher.png') });
    }
    await launcher.click();
    await button('Translate with Addis AI').click();
    await button('Listen to passage 4').waitFor();
    assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    const rect = await panel.boundingBox();
    assert(name === 'mobile' ? rect.width === viewport.width : rect.x > viewport.width / 2);
    if (process.env.INKLU_SCREENSHOTS) {
      await mkdir(process.env.INKLU_SCREENSHOTS, { recursive: true });
      if (name === 'mobile') {
        await button('Listen to passage 1').click();
        await button('Confirm generation').waitFor();
      }
      await page.evaluate(() => document.querySelector('alx-learning-companion').shadowRoot.activeElement?.blur());
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(process.env.INKLU_SCREENSHOTS, name + '.png') });
    }
  });
}

test('narrow layout, enlarged type, long unbroken text, forced colors and reduced motion', async t => {
  const { page, panel, launcher, button } = await setup(t, { viewport: { width: 320, height: 560 },
    forcedColors: 'active', text: 'ሀ'.repeat(350), path: '/tests/lesson-content.html' });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await launcher.press('Enter');
  await button('Translate with Addis AI').click();
  await button('Listen to passage 4').waitFor();
  assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  assert.equal(await panel.evaluate(el => getComputedStyle(el).animationName), 'none');
  await button('Listen to passage 1').press('Enter');
  await button('Confirm generation').focus();
  assert(await button('Confirm generation').evaluate(el => getComputedStyle(el).outlineStyle === 'solid'));
});
