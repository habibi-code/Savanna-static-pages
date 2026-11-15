(() => {
  'use strict';

  async function requestHumanHelp(companion) {
    if (companion.requests.has('help')) return;
    if (companion.outcomes.has('help')) return companion.notify(companion.outcomes.get('help'));
    const controller = new AbortController();
    const button = companion.shadowRoot.getElementById('request-help');
    companion.requests.set('help', controller);
    button.setAttribute('aria-busy', 'true');
    companion.notify('Sending your help request…');
    let message;
    try {
      const configured = new URL(companion.apiUrl('help/sessions'));
      const url = configured.origin === location.origin ? configured.href : '/api/help/sessions';
      const response = await fetch(url, { method: 'POST', redirect: 'error', mode: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: '{}',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (typeof result.sessionId !== 'string' || !result.sessionId || result.status !== 'pending') throw new Error();
      if (controller.signal.aborted) return;
      message = 'Your help request was submitted. A support team member can follow up through your LMS.';
      companion.outcomes.set('help', message);
    } catch {
      message = 'Could not confirm your help request. Try again or contact your LMS support team.';
    } finally {
      if (companion.requests.get('help') === controller) {
        companion.requests.delete('help');
        companion.notify(message, companion.active === 'help');
      }
      if (!companion.requests.has('help')) button.removeAttribute('aria-busy');
    }
  }

  window.InkluHumanHelp = { requestHumanHelp };
})();
