#!/bin/bash

# MARC RAG Application Startup Script
echo "🚀 Starting MARC RAG Application..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install it and try again."
    exit 1
fi

# Build and start services
echo "📦 Building and starting containers..."
docker-compose up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service status
echo "📊 Checking service status..."
docker-compose ps

# Test endpoints
echo "🔍 Testing endpoints..."
echo "Health check:"
curl -s http://localhost:10000/api/health | jq . || echo "Failed to connect to health endpoint"

echo ""
echo "✅ MARC RAG Application is ready!"
echo "🌐 Frontend: http://localhost:10000/"
echo "📡 API Health: http://localhost:10000/api/health"
echo "🔍 Search API: POST http://localhost:10000/api/search"
echo ""
echo "📝 To stop the application, run: docker-compose down"
echo "📋 To view logs, run: docker-compose logs -f"