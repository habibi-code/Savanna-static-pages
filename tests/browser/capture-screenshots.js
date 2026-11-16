import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { makeServer } from '../../backend/server.js';

const artifactDir = 'C:/Users/DELL/.gemini/antigravity/brain/893cc13f-07dc-4ba6-9a94-5b0b947531f5/screenshots';
const localDir = join(import.meta.dirname, 'screenshots');
await mkdir(artifactDir, { recursive: true });
await mkdir(localDir, { recursive: true });

const server = makeServer(null);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch(process.env.INKLU_CHROMIUM
  ? { executablePath: process.env.INKLU_CHROMIUM } : { channel: 'chrome' });

const sample = [
  'ምናባዊ ረዳቶች ሰዎችንና ድርጅቶችን በመስመር ላይ ይደግፋሉ። የሥራቸው ባህሪም እየተለወጠ ነው።',
  'አዳዲስ መሣሪያዎች ኢሜይል ለመጻፍ፣ መረጃ ለማደራጀትና ስብሰባዎችን ለማቀድ ይረዳሉ።',
  'ደንበኞችን በጥሞና ማዳመጥና ቅድሚያ የሚሰጠውን ሥራ መለየት አስፈላጊ ነው።',
  'መልእክት ከመላክዎ በፊት የተዘጋጀውን ጽሑፍ ያንብቡ።',
].join('\n\n');

const oromoText = [
  '# Fuuldura Hojii Gargaaraa Vaarshuwaalii\nGargaartonni vaarchuwaalii namootaa fi dhaabbilee toora interneetiitiin deggaru. Haalli hojii isaaniis jijjiiramaa jira.',
  '## Meeshaalee Haaraa fi Dandeettiiwwan\nMeeshaaleen haaraan imeelii barreessuuf, odeeffannoo qindeessuuf fi walga’ii karoorsuuf ni gargaaru.',
  '## Qajeelfamoota Ijoo\nMaamiltoota xiyyeeffannoon dhaggeeffachuu fi hojii dursa argatu adda baasuun barbaachisaadha:\n- Qunnamtii ifaa\n- Iddoo fi yeroo kabajuu\n- Qophii sirrii ta\'e',
  '## Xumura\nErgaa erguu keessan dura barreeffama qophaa’e dubbisaa.',
].join('\n\n');

const tigrinyaText = [
  '# መጻኢ ናይ ቨርቹዋል ሓገዝቲ ስራሕ\nቨርቹዋል ሓገዝቲ ንሰባትን ትካላትን ብኢንተርነት ይድግፉ። ናይ ስራሖም ባህሪ እውን ይቕየር ኣሎ።',
  '## ሓደሽቲ መሳርሒታትን ክእለታትን\nሓደሽቲ መሳርሒታት ኢመይል ንምጽሓፍ፣ ሓበሬታ ንምውዳብን ኣኼባታት ንምውጣንን ይሕግዙ።',
  '## ቀንዲ ነጥብታት\nተጠቀምቲ ብዕቱብ ምስማዕን ቀዳምነት ዝወሃቦም ስራሕቲ ምልላይን ኣገዳሲ እዩ።\n- ንጹር ርክብ\n- ግዜ ምኽባር',
  '## መደምደምታ\nመልእኽቲ ቅድሚ ምልኣኽኩም ዝተዳለወ ጽሑፍ ኣንብቡ።',
].join('\n\n');

const mp3 = Buffer.alloc(417 * 240);
for (let i = 0; i < 240; i++) mp3.set([0xff, 0xfb, 0x90, 0x64], i * 417);

async function captureScene({ name, viewport, setupAction, routeOverrides }) {
  const page = await browser.newPage({ viewport });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (routeOverrides?.[url.pathname]) return routeOverrides[url.pathname](route);
    if (url.pathname === '/api/translate') {
      const post = route.request().postDataJSON();
      if (post.targetLanguage === 'om') return route.fulfill({ json: { translation: oromoText, sourceLanguage: 'en', targetLanguage: 'om' } });
      if (post.targetLanguage === 'ti') return route.fulfill({ json: { translation: tigrinyaText, sourceLanguage: 'en', targetLanguage: 'ti' } });
      return route.fulfill({ json: { translation: sample, sourceLanguage: 'en', targetLanguage: 'am' } });
    }
    if (url.pathname === '/api/simplify') {
      return route.fulfill({ json: { explanation: '# Compare calendars\nCheck the time zones.\n- Pick a time.\n- Confirm it.\n## Next steps\n1. Send the invite.' } });
    }
    if (url.pathname === '/api/describe') {
      return route.fulfill({ json: { description: 'A calendar view showing scheduled appointments and notifications.' } });
    }
    if (url.pathname === '/api/speech/listen') {
      return route.fulfill({ contentType: 'audio/mpeg', body: mp3 });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(origin + '/pages/concept-with-navigation.html', { waitUntil: 'domcontentloaded' });
  const launcher = page.getByRole('button', { name: 'Inklu Companion' });
  await launcher.waitFor();
  await launcher.click();
  const panel = page.getByRole('dialog', { name: 'Inklu' });
  await panel.waitFor();

  if (setupAction) await setupAction(page, panel);

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  const localPath = join(localDir, `${name}.png`);
  const artifactPath = join(artifactDir, `${name}.png`);
  await page.screenshot({ path: localPath, fullPage: false });
  await page.screenshot({ path: artifactPath, fullPage: false });
  console.log(`Saved screenshot: ${name}.png`);
  await page.close();
}

console.log('Capturing complete suite of visual QA screenshots...');

// 1. Drawer Initial State
await captureScene({
  name: 'drawer-initial',
  viewport: { width: 1440, height: 900 },
  async setupAction(page, panel) {
    // Initial state upon opening launcher: modes available, clean header, intro
  }
});

// 2. Understand Mode
await captureScene({
  name: 'drawer-understand',
  viewport: { width: 1440, height: 900 },
  async setupAction(page, panel) {
    await page.getByRole('button', { name: 'Explain Simply' }).click();
    await panel.locator('#explanation').waitFor();
  }
});

// 3. Translate Ready State
await captureScene({
  name: 'translate-ready',
  viewport: { width: 1440, height: 900 },
  async setupAction(page, panel) {
    await page.getByRole('button', { name: 'Translate' }).click();
    await panel.locator('.translation-ready-card').waitFor();
  }
});

// 4. Translate Loading State
await captureScene({
  name: 'translate-loading',
  viewport: { width: 1440, height: 900 },
  async setupAction(page, panel) {
    await page.getByRole('button', { name: 'Translate' }).click();
    const dropdown = panel.locator('#target-language');
    await dropdown.selectOption('om');
    // Click translate but keep it in loading state
    await page.getByRole('button', { name: 'Translate lesson' }).click();
    await panel.locator('.passage-loading').waitFor();
  },
  routeOverrides: {
    '/api/translate': async (route) => {
      // Intentionally stall response to capture loading state
    }
  }
});

// 5. Desktop - Afaan Oromoo translation (semantic blocks: headings, lists, paragraphs)
await captureScene({
  name: 'desktop-oromo',
  viewport: { width: 1440, height: 900 },
  async setupAction(page, panel) {
    await page.getByRole('button', { name: 'Translate' }).click();
    const dropdown = panel.locator('#target-language');
    await dropdown.selectOption('om');
    await page.getByRole('button', { name: 'Translate lesson' }).click();
    await panel.locator('.passage[lang="om"]').first().waitFor();
  }
});

// 6. Desktop - Amharic with audio controls
await captureScene({
  name: 'desktop-amharic',
  viewport: { width: 1440, height: 900 },
  async setupAction(page, panel) {
    await page.getByRole('button', { name: 'Translate' }).click();
    await page.getByRole('button', { name: 'Translate lesson' }).click();
    await panel.locator('[data-passage]').first().waitFor();
  }
});

// 7. Desktop - English ("View original lesson")
await captureScene({
  name: 'desktop-english',
  viewport: { width: 1440, height: 900 },
  async setupAction(page, panel) {
    await page.getByRole('button', { name: 'Translate' }).click();
    const dropdown = panel.locator('#target-language');
    await dropdown.selectOption('en');
    await panel.locator('.passage[lang="en"]').first().waitFor();
  }
});

// 8. Describe Visuals Mode
await captureScene({
  name: 'drawer-describe',
  viewport: { width: 1440, height: 900 },
  async setupAction(page, panel) {
    await page.getByRole('button', { name: 'Describe Visuals' }).click();
    await panel.locator('#describe-images').waitFor();
    await page.getByRole('button', { name: 'Describe images' }).click();
    await panel.locator('#visuals section').first().waitFor();
  }
});

// 9. Human Help Mode (public demo explanation)
await captureScene({
  name: 'drawer-help',
  viewport: { width: 1440, height: 900 },
  async setupAction(page, panel) {
    await page.getByRole('button', { name: 'Human Help' }).click();
    await panel.locator('#reading-note').waitFor();
  }
});

// 10. Translation Error State
await captureScene({
  name: 'translate-error',
  viewport: { width: 1440, height: 900 },
  async setupAction(page, panel) {
    await page.getByRole('button', { name: 'Translate' }).click();
    await page.getByRole('button', { name: 'Translate lesson' }).click();
    await panel.locator('.passage-error, #reading-note').first().waitFor();
  },
  routeOverrides: {
    '/api/translate': async (route) => {
      return route.fulfill({ status: 503, json: { error: 'Addis AI is temporarily unavailable. Try again later.' } });
    }
  }
});

// 11. Mobile - Ready State (390px)
await captureScene({
  name: 'mobile-ready-state',
  viewport: { width: 390, height: 844 },
  async setupAction(page, panel) {
    await page.getByRole('button', { name: 'Translate' }).click();
    const dropdown = panel.locator('#target-language');
    await dropdown.selectOption('om');
    await panel.locator('.translation-ready-card').waitFor();
  }
});

// 12. Mobile - Amharic (390px)
await captureScene({
  name: 'mobile-amharic',
  viewport: { width: 390, height: 844 },
  async setupAction(page, panel) {
    await page.getByRole('button', { name: 'Translate' }).click();
    await page.getByRole('button', { name: 'Translate lesson' }).click();
    await panel.locator('[data-passage]').first().waitFor();
  }
});

// 13. Mobile - Tigrinya (390px)
await captureScene({
  name: 'mobile-tigrinya',
  viewport: { width: 390, height: 844 },
  async setupAction(page, panel) {
    await page.getByRole('button', { name: 'Translate' }).click();
    const dropdown = panel.locator('#target-language');
    await dropdown.selectOption('ti');
    await page.getByRole('button', { name: 'Translate lesson' }).click();
    await panel.locator('.passage[lang="ti"]').first().waitFor();
  }
});

// 14. Mobile Narrow (320px) - Responsive reflow with no horizontal scroll
await captureScene({
  name: 'mobile-narrow-320px',
  viewport: { width: 320, height: 600 },
  async setupAction(page, panel) {
    await page.getByRole('button', { name: 'Translate' }).click();
    const dropdown = panel.locator('#target-language');
    await dropdown.selectOption('om');
    await page.getByRole('button', { name: 'Translate lesson' }).click();
    await panel.locator('.passage[lang="om"]').first().waitFor();
  }
});

await browser.close();
server.closeAllConnections();
await new Promise(r => server.close(r));
console.log('All visual QA screenshots captured successfully.');
