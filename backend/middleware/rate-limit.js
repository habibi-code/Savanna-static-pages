import { HttpError } from './http.js';

export function rateLimiter(limit) {
  const windows = new Map();
  return (key, res) => {
    let window = windows.get(key);
    if (!window || window.until <= Date.now()) {
      window = { count: 0, until: Date.now() + 60000 };
      windows.set(key, window);
    }
    if (++window.count > limit) {
      res.setHeader('Retry-After', Math.ceil((window.until - Date.now()) / 1000));
      throw new HttpError(429, 'Too many requests. Try again in one minute.');
    }
  };
}
