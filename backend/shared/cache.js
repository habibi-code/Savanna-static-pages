export function cachedResult(generate, onFailure) {
  const saved = new Map();
  const pending = new Map();
  return async (key, ...args) => {
    if (saved.has(key)) return saved.get(key);
    if (pending.has(key)) return pending.get(key);
    const started = performance.now();
    const request = generate(key, ...args).then(result => {
      if (saved.size >= 128) saved.delete(saved.keys().next().value);
      saved.set(key, result);
      return result;
    }, error => {
      onFailure?.(error, key, ...args, started);
      throw error;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
