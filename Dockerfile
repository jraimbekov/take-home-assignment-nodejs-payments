# syntax=docker/dockerfile:1.7

# -----------------------------------------------------------------------------
# Commission Reporting Service — API container
#
# Single-stage image tuned for the take-home: short, dev-friendly (tsx watch),
# and zero-install for the evaluator. `docker compose up` is enough to get
# the service running.
#
# If we wanted a slimmed production image we would split into a builder stage
# that runs `tsc`, then copy `dist/` into a runtime stage with `--omit=dev`
# dependencies — out of scope for now.
# -----------------------------------------------------------------------------
FROM node:20-alpine

WORKDIR /app

# Install dependencies first so this layer is cached when only source changes.
COPY package.json package-lock.json ./
RUN npm ci

# Bring in the rest of the source. In `docker compose`, host bind-mounts
# (./src, ./test, ...) override these paths for hot-reload via tsx watch.
COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY test ./test

EXPOSE 3000

# tsx watch restarts the process on file changes — paired with the compose
# bind-mounts this gives us a dev-loop without rebuilding the image.
CMD ["npx", "tsx", "watch", "src/index.ts"]
