# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Quizzy — one image, two processes
#   :3000  Next.js frontend  (standalone output)
#   :3001  Socket.io game server
#
# Default CMD runs both under a small supervisor. docker-compose runs this same
# image twice with an explicit `command` to get one container per process.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app


# ---- deps -----------------------------------------------------------------
# Full install (incl. devDependencies) — needed to build the Next.js app.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund


# ---- socketdeps -----------------------------------------------------------
# Next's dependency tracer only follows imports reachable from the app, so it
# never sees server/. Rather than shipping the whole production node_modules,
# install just the Socket.io server at the version this project pins.
FROM base AS socketdeps
WORKDIR /socket
COPY package.json ./
RUN SIO="$(node -p "require('./package.json').dependencies['socket.io']")" \
 && rm package.json \
 && npm init -y > /dev/null \
 && npm install --omit=dev --no-audit --no-fund "socket.io@${SIO}"


# ---- builder --------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Leave this empty for a portable image: with no build-time URL the client
# derives the socket endpoint from the page's own hostname (see src/lib/socket.ts).
# Set it only when the socket server lives on a different host or behind a
# TLS-terminating proxy — the value is inlined into the client bundle.
ARG NEXT_PUBLIC_SOCKET_URL=""
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}

ENV NEXT_OUTPUT_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build


# ---- runner ---------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV SOCKET_PORT=3001

RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S quizzy -G nodejs

# Next.js standalone bundle: server.js plus its traced node_modules
COPY --from=builder --chown=quizzy:nodejs /app/.next/standalone ./
COPY --from=builder --chown=quizzy:nodejs /app/.next/static ./.next/static

# Socket.io game server source + the deps Next never traced.
# This COPY merges into the node_modules the standalone bundle already created.
COPY --from=builder   --chown=quizzy:nodejs /app/server ./server
COPY --from=socketdeps --chown=quizzy:nodejs /socket/node_modules ./node_modules

COPY --chown=quizzy:nodejs docker/start.js ./docker/start.js

USER quizzy
EXPOSE 3000 3001

# The socket server already serves /health (server/server.js)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.SOCKET_PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "docker/start.js"]
