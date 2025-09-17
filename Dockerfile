FROM oven/bun:1

# Set build-time flags (can be overridden by Railway/CI)
ARG BUILD_FRONTEND=true
ENV BUILD_FRONTEND=${BUILD_FRONTEND}

WORKDIR /app

# Install backend deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY src ./src
COPY tsconfig.json ./
COPY data ./data
COPY env.example ./

# Install and optionally build frontend (can be disabled with BUILD_FRONTEND=false)
COPY frontend/package.json frontend/bun.lock ./frontend/
RUN if [ "$BUILD_FRONTEND" = "true" ]; then cd frontend && bun install --frozen-lockfile; fi
COPY frontend ./frontend
RUN if [ "$BUILD_FRONTEND" = "true" ]; then cd frontend && bun run build; fi

# Build (optional)
RUN bun build src/index.ts --outdir=dist --target=bun

ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "start"]
