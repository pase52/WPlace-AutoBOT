# Multi-stage Dockerfile for PixelColony Backend

# Base stage with Node.js and common dependencies
FROM node:18-alpine AS base
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    git \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Development stage
FROM base AS development

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Expose port and debug port
EXPOSE 8080 9229

# Create logs directory
RUN mkdir -p logs

# Development command with hot reload
CMD ["npm", "run", "dev:debug"]

# Build stage
FROM base AS build

# Install all dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Production stage
FROM node:18-alpine AS production

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Install only production dependencies for security scanning
RUN apk add --no-cache \
    curl \
    && rm -rf /var/cache/apk/*

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from build stage
COPY --from=build /app/dist ./dist

# Create logs directory and set permissions
RUN mkdir -p logs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Production command
CMD ["node", "dist/server.js"]

# Test stage (for CI/CD)
FROM development AS test

# Copy test files
COPY tests/ ./tests/
COPY jest.config.js ./

# Run tests
RUN npm test

# Lint stage (for CI/CD)
FROM development AS lint

# Run linting
RUN npm run lint
