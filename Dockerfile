# Node 22, not 20: rollup pulls @napi-rs/lzma-linux-x64-gnu, whose
# engines are "^22.20 || ^24.12 || >=25". That package is linux/x64 only,
# so it is skipped on macOS but installed in this image — and with
# engine-strict=true in .npmrc, Node 20 turns that into a hard
# EBADENGINE failure during `npm ci`.
FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN npm run build

CMD ["npm", "run", "docker-start"]
