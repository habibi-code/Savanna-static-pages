import assert from 'node:assert/strict';
import { test } from 'node:test';
import { languages, examples } from '../career/examples.js';
import { privateMenus } from './menus.js';
import { poll } from './poll.js';

function message(text, id = 1, type = 'private') { return { chat: {id, type}, text }; }

test('all six language choices and both catalogs work independently in private chats', () => {
  const handle = privateMenus('InkluBot');
  assert.equal(handle(message('/language')).reply_markup.keyboard.length, 6);
  for (const [label, code] of languages) {
    assert.deepEqual(handle(message(label)).reply_markup, {remove_keyboard:true});
    for (const topic of ['jobs', 'courses']) {
      assert.equal(handle(message('/' + topic + '@InkluBot')).text, examples(topic, code));
      assert.equal(handle(message('/' + topic, 2)).text, examples(topic, 'en'));
    }
  }
  assert.equal(handle(message('/jobs@other')), undefined);
  assert.equal(handle(message('/jobs', 1, 'group')), undefined);
});

test('menus expose samples and explain unavailable services without collecting requests', () => {
  const handle = privateMenus('InkluBot');
  assert.deepEqual(handle(message('/start')), handle(message('/help')));
  assert.match(handle(message('/jobs')).text, /no live vacancies/);
  assert.match(handle(message('/alerts')).text, /unavailable/);
  assert.match(handle(message('/accommodation')).text, /cannot submit/);
  assert.equal(handle(message('/unknown')), undefined);
});

test('poller sends a menu and acknowledges processed updates using the next offset', async () => {
  const controller = new AbortController();
  const sent = [];
  const offsets = [];
  await poll(async (method, body) => {
    if (method === 'getMe') return {username:'InkluBot'};
    if (method === 'sendMessage') return sent.push(body);
    assert.equal(method, 'getUpdates');
    offsets.push(body.offset);
    if (body.offset) { controller.abort(); return []; }
    return [{update_id:7, message:message('/help')}, {update_id:8, message:message('/jobs', 2, 'group')}];
  }, controller.signal);
  assert.deepEqual(offsets, [0, 9]);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /sample job roles/);
});
