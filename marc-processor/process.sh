#!/bin/sh

# MARC Processing Script
echo "🔄 Starting MARC record processing..."

# Set environment variables
export ELASTICSEARCH_URL="http://localhost:9200"
export ELASTICSEARCH_USERNAME="elastic"
export ELASTICSEARCH_PASSWORD="marc-rag-password-2024"
export OLLAMA_URL="http://localhost:11434"
export MARC_FILE="/app/marc.mrc"
export BATCH_SIZE="100"

# Check if Go is installed
if ! command -v go > /dev/null 2>&1; then
    echo "❌ Go is not installed. Please install Go 1.21+ and try again."
    exit 1
fi

# Check if MARC file exists
if [ ! -f "$MARC_FILE" ]; then
    echo "❌ MARC file not found: $MARC_FILE"
    exit 1
fi

# Check if Elasticsearch is running
if ! curl -s -u $ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD $ELASTICSEARCH_URL/_cluster/health > /dev/null; then
    echo "❌ Elasticsearch is not accessible at $ELASTICSEARCH_URL"
    echo "Make sure Elasticsearch is running and accessible."
    exit 1
fi

# Check if Ollama is running
if ! curl -s $OLLAMA_URL/api/tags > /dev/null 2>&1; then
    echo "❌ Ollama is not accessible at $OLLAMA_URL"
    echo "Make sure Ollama is running with the nomic-embed-text model."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Download Go dependencies
echo "📦 Downloading Go dependencies..."
go mod tidy

# Build the processor
echo "🔨 Building MARC processor..."
go build -o marc-processor main.go

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

# Run the processor
echo "🚀 Processing MARC file..."
echo "File: $MARC_FILE"
echo "Batch size: $BATCH_SIZE"
echo "Elasticsearch: $ELASTICSEARCH_URL"
echo "Ollama: $OLLAMA_URL"
echo ""

./marc-processor

echo ""
echo "✅ MARC processing complete!"
echo "📊 Check Elasticsearch index 'marc-records' for indexed data"