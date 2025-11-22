FROM oven/bun:1

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# The command will be overridden by docker-compose
CMD ["bun", "run", "dev"]

