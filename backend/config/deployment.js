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
  const onRender = env.RENDER === 'true';
  const rawPublicOrigin = env.INKLU_PUBLIC_ORIGIN || (onRender ? env.RENDER_EXTERNAL_URL : undefined);
  const publicOrigin = rawPublicOrigin ? rawPublicOrigin.trim().replace(/\/+$/, '') : undefined;
  if (onRender && !publicOrigin) throw new Error('Configure the public HTTPS origin before starting on Render.');
  return {
    host: env.HOST || env.INKLU_HOST || (onRender ? '0.0.0.0' : '127.0.0.1'),
    publicDemo: env.INKLU_PUBLIC_DEMO === 'true' || (onRender && env.INKLU_PUBLIC_DEMO !== 'false'),
    publicOrigin, lessonOrigins: env.INKLU_LESSON_ORIGINS,
    imageDirectory: env.INKLU_IMAGE_DIRECTORY || undefined,
    help: { gatewayKey: env.INKLU_HELP_GATEWAY_KEY, database: env.INKLU_HELP_DB },
  };
}
