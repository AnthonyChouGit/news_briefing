FROM node:slim

WORKDIR /app
ENV NODE_ENV=production
ENV NODE_COMPILE_CACHE=/app/.cache

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY dist/ ./dist/

CMD ["node", "dist/cron_main.js"]