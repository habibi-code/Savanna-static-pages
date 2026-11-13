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
    if (url.pathname === '/api/describe' && options.vision) return options.vision(route);
    if (url.pathname === '/api/translate') {
      await options.waitTranslation;
      if (options.translationError) return route.fulfill({ status: options.translationError, json: { error: 'Mock failure' } });
      return route.fulfill({ json: { translation: options.text ?? sample } });
    }
    if (url.pathname === '/api/simplify') {
      await options.waitExplanation;
      return route.fulfill({ json: { explanation: '# Compare calendars\nCheck the time zones.\n- Pick a time.\n- Confirm it.\n## Next steps\n1. Send the invite.' } });
    }
    assert.equal(url.pathname, '/api/speech/listen');
    if (options.speech) return options.speech(route);
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
  assert(await button('Describe Visuals').evaluate(el => el.matches(':focus')));
  await page.keyboard.press('Tab');
  assert(await button('Close Inklu').evaluate(el => el.matches(':focus')));
  assert.equal(await button('Listen').count(), 0);
  for (const name of ['Explain Simply', 'Translate', 'Describe Visuals']) {
    await page.keyboard.press('Tab');
    assert(await button(name).evaluate(el => el.matches(':focus')));
  }
  await page.keyboard.press('Enter');
  assert(await panel.getByRole('heading', { name: 'Visual descriptions' }).isVisible());
  assert.equal(await panel.getByRole('tab').count(), 0);
  assert.equal(await panel.getByText('Extracted lesson content (debug preview)').isVisible(), false);
  assert.deepEqual(calls, []);
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  assert(await launcher.evaluate(el => el.matches(':focus')));
});

test('Describe images reads distinct lesson artwork in order, resumes on retry and announces completion once', async t => {
  const gate = Promise.withResolvers();
  let attempts = 0;
  const { page, launcher, panel, button, calls } = await setup(t, { vision: async route => {
    attempts++;
    await gate.promise;
    if (attempts === 2) return route.fulfill({ status: 502, json: { error: 'private' } });
    return route.fulfill({ json: { description: 'Visible shapes.\n- A blue circle.' } });
  } });
  await launcher.press('Enter');
  await button('Describe Visuals').press('Enter');
  const status = panel.getByRole('status');
  await status.evaluate(el => {
    window.ready = [];
    new MutationObserver(() => window.ready.push(el.textContent)).observe(el, { childList: true });
  });
  const generate = panel.locator('#describe-images');
  await generate.press('Enter');
  await status.filter({ hasText: 'Describing lesson images' }).waitFor();
  await generate.press('Space');
  gate.resolve();
  await status.filter({ hasText: 'try again' }).waitFor();
  assert(await generate.evaluate(el => el.matches(':focus')));
  assert.equal(await panel.locator('#visuals section').count(), 1);
  await generate.press('Space');
  await status.filter({ hasText: 'Image descriptions ready.' }).waitFor();
  assert(await generate.evaluate(el => el.matches(':focus')));
  const doc = panel.getByRole('document', { name: 'Visual descriptions' });
  assert.equal(await doc.evaluate(el => !!el.closest('[aria-live], [role="status"]')), false);
  assert.deepEqual(await doc.getByRole('heading').allTextContents(), ['Image 1', 'Image 2']);
  assert.equal(await doc.getByRole('list').count(), 2);
  assert.equal(await doc.getByRole('paragraph').count(), 2);
  await button('Read descriptions').press('Enter');
  assert(await doc.evaluate(el => el.matches(':focus')));
  const inputs = calls.map(call => call[1]);
  assert.equal(inputs.length, 3);
  assert.equal(inputs[0].asset, 'VA-Content-Banner.png');
  assert.notEqual(inputs[1].asset, inputs[0].asset);
  assert.deepEqual(inputs[1], inputs[2]);
  assert.match(inputs[1].context, /Virtual Assistant profession/);
  assert.doesNotMatch(inputs[1].context, /Evon afro|VA-Content-Banner/);
  await button('Describe Visuals').press('Enter');
  assert.equal(await page.evaluate(() => window.ready.filter(s => s === 'Image descriptions ready.').length), 1);
});

test('Describe images excludes decorative and unsupported images and updates when only the source changes', async t => {
  const { page, launcher, panel, button, calls } = await setup(t, { path: '/tests/lesson-content.html' });
  await page.locator('#example').selectOption('schedule');
  await launcher.press('Enter');
  await button('Describe Visuals').press('Enter');
  await button('Describe images').waitFor();
  await page.locator('#curriculum_navigation_content img').first().evaluate(el => { el.src = 'https://example.org/remote.png'; });
  await panel.getByRole('status').filter({ hasText: 'lesson changed' }).waitFor();
  await button('Describe Visuals').press('Enter');
  await panel.getByRole('status').filter({ hasText: 'no supported local images' }).waitFor();
  assert.equal(await button('Describe images').count(), 0);
  assert.equal(calls.length, 0);
});

test('the active action keeps a contrasting indicator after focus moves', async t => {
  const { page, launcher, button } = await setup(t);
  await launcher.press('Enter');
  const tab = button('Describe Visuals');
  await tab.press('Space');
  await page.keyboard.press('Shift+Tab');
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

test('Explain Simply uses extracted text, renders semantic blocks, and keeps background results available', async t => {
  const gate = Promise.withResolvers();
  const { page, launcher, panel, calls, button } = await setup(t, { path: '/tests/lesson-content.html', waitExplanation: gate.promise });
  await launcher.press('Enter');
  assert.equal(calls.length, 0);
  const explain = button('Explain Simply');
  await explain.press('Enter');
  await panel.getByRole('status').filter({ hasText: 'Preparing a simple explanation' }).waitFor();
  await page.keyboard.press('Space');
  await button('Describe Visuals').press('Space');
  await button('Describe images').waitFor();
  gate.resolve();
  await panel.getByRole('status').filter({ hasText: 'Simple explanation ready' }).waitFor();
  assert(await button('Describe Visuals').evaluate(el => el.matches(':focus')));
  await explain.press('Space');
  assert(await panel.getByRole('heading', { name: 'Compare calendars', level: 4 }).isVisible());
  assert.deepEqual(await panel.locator('#explanation li').allTextContents(), ['Pick a time.', 'Confirm it.', 'Send the invite.']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/simplify');
  assert.match(calls[0][1].text, /Writing a meeting brief/);
  assert.doesNotMatch(calls[0][1].text, /Test navigation menu/);
  await page.locator('#example').evaluate(el => { el.value = 'schedule'; el.dispatchEvent(new Event('change')); });
  await panel.getByRole('status').filter({ hasText: 'The lesson changed' }).waitFor();
  await page.route('**/api/simplify', route => route.fulfill({ status: 502, body: 'private' }), { times: 1 });
  await explain.press('Enter');
  await panel.locator('#reading-note').filter({ hasText: 'Explanation failed' }).waitFor();
  await explain.press('Enter');
  await panel.getByRole('heading', { name: 'Compare calendars' }).waitFor();
  assert.match(calls[1][1].text, /Reading a weekly schedule/);
  await button('Translate').press('Enter');
  await button('Generate Audio for passage 1').waitFor();
  await button('Generate Audio for passage 1').press('Space');
  await panel.getByText('Playing', { exact: true }).waitFor();
  assert.equal(calls.at(-1)[0], '/api/speech/listen');
});

test('completed explanation is a keyboard-reachable reading document with one short completion announcement', async t => {
  const gate = Promise.withResolvers();
  const { page, launcher, panel, button } = await setup(t, { waitExplanation: gate.promise });
  await launcher.press('Enter');
  const status = panel.getByRole('status');
  await status.evaluate(el => {
    window.announcements = [];
    new MutationObserver(() => window.announcements.push(el.textContent)).observe(el, { childList: true });
  });
  const explain = button('Explain Simply');
  await explain.press('Enter');
  await status.filter({ hasText: 'Preparing a simple explanation' }).waitFor();
  gate.resolve();
  await status.filter({ hasText: 'Simple explanation ready.' }).waitFor();
  assert(await explain.evaluate(el => el.matches(':focus')));
  const doc = panel.getByRole('document', { name: 'Simple explanation' });
  assert.equal(await doc.evaluate(el => !!el.closest('[aria-live], [role="status"], [role="alert"], [inert], [aria-hidden="true"]')), false);
  assert(await doc.getByRole('heading', { level: 4, name: 'Compare calendars' }).isVisible());
  assert(await doc.getByRole('heading', { level: 5, name: 'Next steps' }).isVisible());
  assert.equal(await doc.getByRole('paragraph').innerText(), 'Check the time zones.');
  assert.deepEqual(await doc.getByRole('list').evaluateAll(lists => lists.map(list => list.localName)), ['ul', 'ol']);
  await button('Describe Visuals').press('Enter');
  await explain.press('Enter');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  assert(await doc.evaluate(el => el.matches(':focus')));
  await page.keyboard.press('Escape');
  assert(await launcher.evaluate(el => el.matches(':focus')));
  const messages = await page.evaluate(() => window.announcements);
  assert.deepEqual(messages.filter(message => message === 'Simple explanation ready.'), ['Simple explanation ready.']);
  assert(!messages.some(message => message.includes('Check the time zones.')));
});

test('browser playback policy offers manual Play using the same downloaded clip', async t => {
  const { page, panel, launcher, button, calls } = await setup(t);
  await page.evaluate(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      HTMLMediaElement.prototype.play = play;
      return Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
    };
  });
  await launcher.click();
  await button('Translate').click();
  await button('Generate Audio for passage 1').press('Enter');
  await panel.getByRole('status').filter({ hasText: 'Audio ready. Choose Play or resume.' }).waitFor();
  const play = button('Play or resume passage 1');
  assert(await play.evaluate(el => el.matches(':focus')));
  await play.press('Space');
  await panel.getByText('Playing', { exact: true }).waitFor();
  assert.deepEqual(calls.map(([path]) => path), ['/api/translate', '/api/speech/listen']);
});

test('translation error is retryable and closing the drawer cancels pending playback', async t => {
  const { page, launcher, panel, button } = await setup(t);
  await launcher.click();
  const action = button('Translate');
  await page.route('**/api/translate', route => route.fulfill({ status: 503, json: { error: 'test failure' } }), { times: 1 });
  await action.click();
  await panel.getByRole('status').filter({ hasText: /Translation is unavailable/ }).waitFor();
  await action.press('Enter');
  const pending = Promise.withResolvers();
  const arrived = Promise.withResolvers();
  await page.route('**/api/speech/listen', async route => {
    arrived.resolve();
    await pending.promise;
    await route.fulfill({ contentType: 'audio/mpeg', body: mp3 }).catch(() => {});
  });
  await button('Generate Audio for passage 1').click();
  await arrived.promise;
  const aborted = page.waitForEvent('requestfailed', req => req.url().endsWith('/api/speech/listen'));
  await button('Close Inklu').click();
  pending.resolve();
  await aborted;
  await launcher.click();
  assert(await button('Generate Audio for passage 1').isEnabled());
  assert.equal(await button('Pause passage 1').count(), 0);
});

for (const [code, mode, message] of [
  [200, 'Describe Visuals', 'Amharic translation ready.'],
  [504, 'Describe Visuals', 'Translation timed out. You can try again.'],
  [502, 'Describe Visuals', 'Translation failed. You can try again.'],
]) {
  test('translation HTTP ' + code + ' reaches the live region while reading ' + mode, async t => {
    const gate = Promise.withResolvers();
    const { page, launcher, panel, calls, button } = await setup(t, {
      waitTranslation: gate.promise, translationError: code === 200 ? undefined : code,
    });
    await launcher.press('Enter');
    const action = button('Translate');
    await action.press('Enter');
    assert(await action.isEnabled());
    assert(await action.evaluate(el => el.matches(':focus') && el.tabIndex >= 0));
    await page.keyboard.press('Space');
    const status = panel.getByRole('status');
    await status.filter({ hasText: 'Translating the lesson' }).waitFor();
    const selected = button(mode);
    await selected.press('Space');
    gate.resolve();
    await status.filter({ hasText: message }).waitFor();
    assert.deepEqual(await status.allTextContents(), [message]);
    assert(await selected.evaluate(el => el.matches(':focus')));
    if (code === 200) {
      await button('Translate').click();
      assert(await button('Generate Audio for passage 1').isEnabled());
    } else assert(await button('Translate').isEnabled());
    assert.equal(calls.length, 1);
  });
}

test('closing during translation keeps the result without announcing a background success', async t => {
  const gate = Promise.withResolvers();
  const { page, panel, launcher, calls, button } = await setup(t, { waitTranslation: gate.promise });
  await launcher.press('Enter');
  await button('Translate').press('Enter');
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  gate.resolve();
  await page.locator('[data-passage]').first().waitFor({ state: 'attached' });
  assert.equal(await page.locator('#translation-status').textContent(), '');
  assert(await launcher.evaluate(el => el.matches(':focus')));
  await launcher.press('Enter');
  assert(await button('Generate Audio for passage 1').isVisible());
  assert.equal(calls.length, 1);
});

test('changing lessons cancels the old request without a timeout or stale result announcement', async t => {
  const gate = Promise.withResolvers();
  const { page, panel, launcher, button } = await setup(t, {
    path: '/tests/lesson-content.html', waitTranslation: gate.promise,
  });
  await launcher.press('Enter');
  await button('Translate').press('Enter');
  await button('Describe Visuals').press('Space');
  const aborted = page.waitForEvent('requestfailed', req => req.url().endsWith('/api/translate'));
  await page.locator('#example').evaluate(el => { el.value = 'schedule'; el.dispatchEvent(new Event('change')); });
  gate.resolve();
  await aborted;
  const status = panel.getByRole('status');
  await status.filter({ hasText: 'The lesson changed.' }).waitFor();
  assert.equal(await status.textContent(), 'The lesson changed. Choose an action for the new lesson.');
  assert.equal(await button('Generate Audio for passage 1').count(), 0);
  assert(await button('Translate').isEnabled());
});

test('mode transitions preserve one translation; one Generate Audio activation plays the selected passage', async t => {
  const gate = Promise.withResolvers();
  const { page, launcher, panel, calls, button } = await setup(t, { waitTranslation: gate.promise });
  await launcher.click();
  await button('Translate').click();
  await button('Describe Visuals').click();
  await button('Translate').click();
  gate.resolve();
  const first = button('Generate Audio for passage 1'), second = button('Generate Audio for passage 2');
  await first.waitFor();
  assert.equal(calls.length, 1);
  assert.equal(await panel.locator('.passage p[lang="am"]').count(), 4);
  assert.equal(await panel.getByRole('combobox').count(), 0);
  const playing = panel.getByText('Playing', { exact: true });
  await second.press('Enter');
  await playing.waitFor();
  assert.deepEqual(calls.at(-1), ['/api/speech/listen', { text: sample.split('\n\n')[1] }]);
  assert(await second.evaluate(el => el.matches(':focus')));
  assert.equal(await button('Confirm generation').count(), 0);
  assert.equal(await panel.locator('#speech-status').textContent(), '');
  assert.equal(await playing.evaluate(el => !!el.closest('[role="status"], [role="alert"], [aria-live]')), false);
  await page.keyboard.press('Tab');
  assert(await button('Pause passage 2').evaluate(el => el.matches(':focus')));
  await page.keyboard.press('Space');
  await panel.getByRole('status').filter({ hasText: 'Playback paused.' }).waitFor();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await playing.waitFor();
  await button('Stop Amharic audio').press('Enter');
  await panel.getByRole('status').filter({ hasText: 'Playback stopped.' }).waitFor();
  await button('Play or resume passage 2').press('Enter');
  await playing.waitFor();
  assert.equal(calls.length, 2);
  await first.click();
  await panel.locator('.passage.active').getByText('Playing', { exact: true }).waitFor();
  assert(await second.isVisible());
  assert.equal(await panel.locator('.passage.active').count(), 1);
  await button('Close Inklu').click();
  await launcher.click();
  assert(await second.isVisible());
  assert.equal(calls.filter(([path]) => path === '/api/translate').length, 1);
  assert.equal(calls.filter(([path]) => path.endsWith('/listen')).length, 2);
});

for (const [code, message] of [[502, 'Audio could not be loaded'], [503, 'Audio could not be loaded']]) {
  test('audio HTTP ' + code + ': one pending request, learner-safe status and manual retry', async t => {
    const gate = Promise.withResolvers();
    let attempts = 0;
    const { page, panel, launcher, button, calls } = await setup(t, { speech: async route => {
      await gate.promise;
      if (++attempts === 1) return route.fulfill({ status: code, json: { error: 'private quote: 0.5 ETB' } });
      return route.fulfill({ contentType: 'audio/mpeg', body: mp3 });
    } });
    await launcher.press('Enter');
    await button('Translate').press('Enter');
    const listen = button('Generate Audio for passage 1');
    await listen.press('Space');
    const status = panel.getByRole('status');
    await status.filter({ hasText: 'Generating audio' }).waitFor();
    assert(await listen.isEnabled());
    assert.equal(await listen.getAttribute('aria-busy'), 'true');
    assert(await listen.evaluate(el => el.matches(':focus')));
    await page.keyboard.press('Enter');
    await listen.dblclick();
    gate.resolve();
    await status.filter({ hasText: message }).waitFor();
    assert.equal(await listen.getAttribute('aria-busy'), null);
    assert(await listen.evaluate(el => el.matches(':focus')));
    assert.doesNotMatch(await panel.innerText(), /ETB|quote|confirm generation/i);
    assert.deepEqual(calls.map(([path]) => path), ['/api/translate', '/api/speech/listen']);
    await listen.press('Enter');
    await button('Pause passage 1').waitFor();
    assert.equal(attempts, 2);
  });
}

for (const change of ['lesson', 'mode']) {
  test('switching ' + change + ' cancels pending audio before it can play', async t => {
    const gate = Promise.withResolvers(), arrived = Promise.withResolvers();
    const { page, panel, launcher, button } = await setup(t, { path: '/tests/lesson-content.html', speech: async route => {
      arrived.resolve();
      await gate.promise;
      await route.fulfill({ contentType: 'audio/mpeg', body: mp3 }).catch(() => {});
    } });
    await launcher.press('Enter');
    await button('Translate').press('Space');
    await button('Generate Audio for passage 1').press('Space');
    await arrived.promise;
    const aborted = page.waitForEvent('requestfailed', req => req.url().endsWith('/api/speech/listen'));
    if (change === 'lesson') {
      await page.locator('#example').evaluate(el => { el.value = 'schedule'; el.dispatchEvent(new Event('change')); });
    } else {
      await button('Describe Visuals').press('Space');
    }
    gate.resolve();
    await aborted;
    if (change === 'mode') await button('Translate').click();
    assert.equal(await panel.locator('.passage.active').count(), 0);
    assert.equal(await button('Pause passage 1').count(), 0);
  });
}

test('developer preview, missing lesson and stale translation cleanup', async t => {
  const { page, panel, launcher, button, calls } = await setup(t, { path: '/tests/lesson-content.html?inkluDebug=1' });
  await launcher.click();
  await button('Translate').click();
  await button('Generate Audio for passage 1').waitFor();
  await page.locator('#example').evaluate(el => { el.value = 'schedule'; el.dispatchEvent(new Event('change')); });
  await panel.getByText('Reading a weekly schedule', { exact: true }).waitFor();
  assert.equal(await button('Generate Audio for passage 1').count(), 0);
  await panel.locator('summary').click();
  await panel.locator('#preview').getByText(/Check both time zones/).waitFor();
  await page.locator('#example').evaluate(el => { el.value = 'empty'; el.dispatchEvent(new Event('change')); });
  await button('Translate').click();
  await panel.getByRole('status').filter({ hasText: 'No lesson text is available to translate.' }).waitFor();
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
    await button('Translate').click();
    await button('Generate Audio for passage 4').waitFor();
    assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    const rect = await panel.boundingBox();
    assert(name === 'mobile' ? rect.width === viewport.width : rect.x > viewport.width / 2);
    if (process.env.INKLU_SCREENSHOTS) {
      await mkdir(process.env.INKLU_SCREENSHOTS, { recursive: true });
      if (name === 'mobile') {
        await button('Generate Audio for passage 1').click();
        await panel.getByText('Playing', { exact: true }).waitFor();
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
  await button('Translate').click();
  await button('Generate Audio for passage 4').waitFor();
  assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  assert.equal(await panel.evaluate(el => getComputedStyle(el).animationName), 'none');
  await button('Generate Audio for passage 1').press('Enter');
  await button('Pause passage 1').focus();
  assert(await button('Pause passage 1').evaluate(el => getComputedStyle(el).outlineStyle === 'solid'));
});
