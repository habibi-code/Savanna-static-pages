import { examples, languages } from '../career/examples.js';

const menu = '/jobs — sample job roles\n/courses — sample course topics\n' +
  "/language — choose the examples' language\n/alerts — job alert availability\n" +
  '/accommodation — interview support information';

export function privateMenus(username) {
  const preferences = new Map();
  return message => {
    if (message?.chat?.type !== 'private' || !Number.isSafeInteger(message.chat.id) ||
        typeof message.text !== 'string' || message.from?.is_bot) return;
    const chat_id = message.chat.id;
    const text = message.text;
    const reply = { chat_id, text: menu };
    if (!text.startsWith('/')) {
      if (languages.has(text)) {
        preferences.set(chat_id, languages.get(text));
        reply.reply_markup = { remove_keyboard: true };
      }
      return reply;
    }
    const [command, recipient] = text.split(/\s/, 1)[0].toLowerCase().split('@');
    if (recipient && recipient !== username.toLowerCase()) return;
    switch (command) {
      case '/start': case '/help': return reply;
      case '/language':
        reply.text = 'Choose a language for examples.';
        reply.reply_markup = { keyboard: Array.from(languages.keys(), name => [name]),
          resize_keyboard: true, one_time_keyboard: true };
        return reply;
      case '/jobs': case '/courses':
        reply.text = examples(command.slice(1), preferences.get(chat_id) ?? 'en');
        return reply;
      case '/alerts':
        reply.text = 'Job alert subscriptions are unavailable.';
        return reply;
      case '/accommodation':
        reply.text = 'For an interview accommodation, contact your interview coordinator privately. ' +
          'This bot cannot submit requests. Please keep personal details out of this chat.';
        return reply;
    }
  };
}
