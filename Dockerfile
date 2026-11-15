# Production-ready Node.js container for Inklu
FROM node:24-alpine

# Set production environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV INKLU_PUBLIC_DEMO=true
ENV INKLU_TELEGRAM_ENABLED=false
ENV INKLU_TTS_ALLOWANCE_ETB=0

WORKDIR /app

# Install production dependencies with layer caching
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm ci --prefix backend --omit=dev --ignore-scripts

# Copy static frontend assets, lesson pages, and backend modules
COPY assets ./assets
COPY pages ./pages
COPY index.html ./
COPY tests/lesson-content.html ./tests/lesson-content.html
COPY backend ./backend

# Set up file permissions for the non-root user
RUN chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "const port = process.env.PORT || 3000; const origin = process.env.INKLU_PUBLIC_ORIGIN; const host = origin ? new URL(origin).host : ('localhost:' + port); fetch('http://127.0.0.1:' + port + '/pages/generic-lesson.html', { headers: { Host: host } }).then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["npm", "start", "--prefix", "backend"]
