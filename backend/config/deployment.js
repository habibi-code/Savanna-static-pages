export function exactOrigin(value) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.origin !== value || url.hostname.includes('*') ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) {
    throw new Error('Configure an exact HTTPS origin (HTTP is allowed for loopback).');
  }
  return url;
}

export function deploymentConfig(env = process.env) {
  return {
    publicOrigin: env.INKLU_PUBLIC_ORIGIN, lessonOrigins: env.INKLU_LESSON_ORIGINS,
    imageDirectory: env.INKLU_IMAGE_DIRECTORY || undefined,
    help: { gatewayKey: env.INKLU_HELP_GATEWAY_KEY, database: env.INKLU_HELP_DB },
  };
}
