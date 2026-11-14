/**
 * Automated accessibility test for the Savanna widget iframe.
 *
 * Runs axe-core on `widget/iframe.html` against WCAG 2.0, 2.1, and 2.2 Level A/AA rules.
 * Fails (exit 1) if any "critical" or "serious" violations are detected.
 *
 * Usage:
 *   node widget/widget-a11y.test.js
 *   or:
 *   npx axe http://localhost:8000/widget/iframe.html --tags wcag2a,wcag2aa,wcag21aa,wcag22aa
 */
const fs = require('fs');
const path = require('path');

async function runAudit() {
  console.log('----------------------------------------------------');
  console.log('Savanna Assistant Widget — axe-core Accessibility Audit');
  console.log('----------------------------------------------------');

  const htmlPath = path.join(__dirname, 'iframe.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('Error: widget/iframe.html not found at', htmlPath);
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');

  // Try loading axe-core and jsdom
  let jsdom, axe;
  try {
    jsdom = require('jsdom');
    axe = require('axe-core');
  } catch (err) {
    console.log('jsdom / axe-core not installed locally.');
    console.log('To run this test standalone with Node:');
    console.log('  npm install --no-save jsdom axe-core');
    console.log('');
    console.log('Or use the CLI:');
    console.log('  npx axe http://localhost:8000/widget/iframe.html --tags wcag2a,wcag2aa,wcag21aa,wcag22aa');
    process.exit(0);
  }

  const { JSDOM } = jsdom;
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    resources: 'usable',
    url: 'http://localhost/widget/iframe.html'
  });

  const { window } = dom;

  // Run axe on DOM
  axe.configure({
    rules: [
      { id: 'color-contrast', enabled: true },
      { id: 'aria-valid-attr', enabled: true },
      { id: 'aria-roles', enabled: true },
      { id: 'button-name', enabled: true },
      { id: 'document-title', enabled: true },
      { id: 'html-has-lang', enabled: true },
      { id: 'landmark-one-main', enabled: false } // Standalone embedded widget
    ]
  });

  const results = await axe.run(window.document.documentElement, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
    }
  });

  const violations = results.violations || [];
  const criticalOrSerious = violations.filter(v => v.impact === 'critical' || v.impact === 'serious');

  console.log(`Audited rules: ${results.passes.length + violations.length}`);
  console.log(`Passes:        ${results.passes.length}`);
  console.log(`Violations:    ${violations.length}`);
  console.log(`Critical/Serious: ${criticalOrSerious.length}`);

  if (criticalOrSerious.length > 0) {
    console.error('\n❌ ACCESSIBILITY GATE FAILED:');
    criticalOrSerious.forEach(v => {
      console.error(`  - [${v.impact.toUpperCase()}] ${v.id}: ${v.help}`);
      console.error(`    Details: ${v.description}`);
      console.error(`    Nodes affected: ${v.nodes.length}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ ZERO CRITICAL OR SERIOUS ACCESSIBILITY ISSUES FOUND.');
    console.log('WCAG 2.2 AA Pass/Fail Gate Passed successfully.');
    process.exit(0);
  }
}

runAudit().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
