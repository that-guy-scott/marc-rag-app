# Multi-stage build for Angular frontend and Node.js backend
FROM node:20-alpine AS frontend-build

# Set working directory for frontend build
WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm ci --only=production

# Copy frontend source code
COPY frontend/ ./

# Build Angular application for production
RUN npm run build

# Go build stage for MARC processor
FROM golang:1.21-alpine AS go-build

# Set working directory
WORKDIR /app/marc-processor

# Copy Go mod file
COPY marc-processor/go.mod ./

# Copy Go source code
COPY marc-processor/ ./

# Download dependencies and build
RUN go mod tidy && go build -o marc-processor main.go

# Production stage
FROM node:20-alpine AS production

# Install Go runtime and curl
RUN apk add --no-cache go curl

# Create app directory
WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm ci --only=production

# Copy backend source code
COPY backend/ ./

# Copy built frontend from previous stage
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Copy MARC processor from Go build stage
COPY --from=go-build /app/marc-processor ./marc-processor

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "const http = require('http'); \
    const options = { host: 'localhost', port: 10000, path: '/api/health', timeout: 2000 }; \
    const req = http.request(options, (res) => { \
        if (res.statusCode === 200) process.exit(0); \
        else process.exit(1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.end();"

# Start the application
CMD ["node", "server.js"]