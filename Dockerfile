FROM node:18-alpine

# Install system dependencies including wget for health checks
RUN apk add --no-cache openssl wget curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Remove CLI packages since we don't need them in production
RUN npm remove @shopify/cli @shopify/theme || true

# Copy application code
COPY . .

# Generate Prisma client and build the app
RUN npx prisma generate
RUN npm run build

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S remix -u 1001
RUN chown -R remix:nodejs /app
USER remix

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start command
CMD ["npm", "run", "docker-start"]
