# MARC RAG Search System

A containerized RAG (Retrieval-Augmented Generation) system for searching MARC bibliographic records using hybrid semantic + keyword search.

## Architecture

- **Frontend/Backend Container**: Angular 20 + Express.js on Node.js 20
- **Elasticsearch Container**: Search engine and data storage
- **Docker Compose**: Orchestrates both containers with networking

## Quick Start

### Prerequisites
- Docker
- docker-compose  
- 8GB+ available RAM (for Elasticsearch)

### Optional AI Enhancements
The system works fully without these services, but they enhance functionality:

- **Ollama** (for semantic search): Install with `nomic-embed-text` model
  ```bash
  # Install Ollama (optional)
  curl -fsSL https://ollama.ai/install.sh | sh
  ollama pull nomic-embed-text
  ```
- **Gemini AI** (for advanced features): Requires Google AI API key
  - Set `GEMINI_API_KEY` environment variable
  - Enables query optimization, summaries, and chat features

### 1. Start the Application

```bash
# Using the startup script (recommended)
./start.sh

# Or manually
docker-compose up --build -d
```

### 2. Access the Application

- **Web Interface**: http://localhost:10000/
- **API Health Check**: http://localhost:10000/api/health
- **Elasticsearch**: http://localhost:9200/ (elastic:marc-rag-password-2024)

### 3. Process MARC Records

The system includes a complete MARC processing pipeline. To add and process your MARC records:

#### Option A: Use Your Own MARC File
```bash
# 1. Stop the application if running
docker-compose down

# 2. Replace the sample MARC file with your own
cp /path/to/your/records.mrc ./marc.mrc

# 3. Restart the application
./start.sh
```

#### Option B: Use the Included Sample Data
The system includes a 199MB sample MARC file ready for processing.

#### Process MARC Records
```bash
# Trigger MARC processing via API
curl -X POST http://localhost:10000/api/index-marc \
  -H "Content-Type: application/json"

# Check processing status
curl http://localhost:10000/api/stats

# Monitor progress in logs
docker-compose logs -f marc-app
```

### 4. Test the Search

Once MARC records are processed, use the web interface or test the API:

```bash
# Hybrid semantic + keyword search
curl -X POST http://localhost:10000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "database management"}'

# Search with specific parameters
curl -X POST http://localhost:10000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "artificial intelligence",
    "size": 10,
    "filters": {
      "language": "eng",
      "subjects": ["Computer science", "Machine learning"]
    }
  }'
```

## Container Details

### marc-app (Frontend + Backend)
- **Ports**: 10000:10000
- **Technology**: Angular 20 + Express.js + Node.js 20
- **Health Check**: http://localhost:10000/api/health
- **Features**:
  - Serves Angular SPA from root path
  - RESTful API endpoints under `/api/*`
  - Complete MARC binary format parser (Go)
  - Hybrid semantic + keyword search
  - Vector embeddings with Ollama integration
  - RAG capabilities with Gemini AI

### marc-elasticsearch
- **Ports**: 9200:9200
- **Version**: Elasticsearch 9.0.0
- **Authentication**: elastic:marc-rag-password-2024
- **Configuration**:
  - Single-node cluster
  - Security enabled with HTTP (no SSL)
  - 1GB heap size
  - Persistent data volume

## API Endpoints

### Primary Search Endpoints
- `POST /api/rag-search` - **Advanced RAG search with AI optimization** (primary endpoint used by frontend)
- `POST /api/search` - Basic hybrid semantic + keyword search
- `POST /api/chat` - Conversational interface for RAG search

### System Endpoints
- `GET /api/health` - Health check and Elasticsearch status  
- `POST /api/index-marc` - Process and index MARC records
- `GET /api/stats` - Search statistics and index information
- `GET /api/sort-options` - Available result sorting options
- `GET /api/conversation/:id` - Retrieve conversation history

## Advanced RAG Search Features

The system includes an experimental **conversational search interface** powered by the `/api/rag-search` endpoint:

### 🔬 Experimental Features (Work in Progress)
- **Conversational Context**: Maintains conversation history across multiple searches
- **Follow-up Queries**: "Show me more recent books on that topic"
- **Query Refinement**: "Actually, focus on machine learning in healthcare"  
- **Context Memory**: AI remembers previous searches and can build upon them
- **User Preferences**: Search preferences persist within conversation sessions

### AI-Powered Enhancements
- **Multi-stage Search**: Initial hybrid search + AI query optimization
- **Result Augmentation**: AI-generated insights, summaries, and research strategies
- **Citation Generation**: Automatic APA and MLA citation formatting
- **Research Recommendations**: Intelligent suggestions for related queries and sources
- **Quality Assessment**: AI-powered evaluation of source quality and relevance

### Technical Implementation
- **Gemini AI Integration**: Advanced language model for insights and optimization
- **Ollama Embeddings**: Semantic search using `nomic-embed-text` model
- **Context Management**: Persistent conversation state and search history
- **Intelligent Sorting**: Multiple sorting strategies (relevance, date, alphabetical)

*Note: The conversational search functionality is experimental and may require additional testing and refinement.*

## Development

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f marc-app
docker-compose logs -f elasticsearch
```

### Rebuild After Changes
```bash
docker-compose up --build -d
```

### Stop Services
```bash
docker-compose down
```

### Reset Everything (including data)
```bash
docker-compose down -v
docker-compose up --build -d
```

## Docker Configuration

### Environment Variables (marc-app)

#### Required
- `NODE_ENV=production`
- `PORT=10000`
- `ELASTICSEARCH_URL=http://elasticsearch:9200`
- `ELASTICSEARCH_USERNAME=elastic`
- `ELASTICSEARCH_PASSWORD=marc-rag-password-2024`

#### Optional (AI Features)
- `OLLAMA_URL=http://localhost:11434` (for semantic search)
- `GEMINI_API_KEY=your_api_key` (for AI enhancements)
- `GEMINI_API_URL=https://generativelanguage.googleapis.com`
- `GEMINI_MODEL=gemini-1.5-flash`

### Environment Variables (elasticsearch)
- `discovery.type=single-node`
- `ES_JAVA_OPTS=-Xms1g -Xmx1g`
- `xpack.security.enabled=true`
- `ELASTIC_PASSWORD=marc-rag-password-2024`
- `xpack.security.http.ssl.enabled=false`

## MARC Processing Details

### MARC File Format Support
- **Format**: Standard MARC21 binary format (.mrc files)
- **File Size**: Supports large files (tested with 199MB+ files)
- **Encoding**: UTF-8 and MARC-8 character encoding support
- **Validation**: Automatic MARC format validation and error handling

### Extracted MARC Fields
The system extracts and indexes these bibliographic fields:
- **Title**: 245 field (title statement)
- **Author**: 100, 110, 111 fields (personal/corporate/meeting names)  
- **Publication**: 260, 264 fields (publication information)
- **ISBN**: 020 field (International Standard Book Number)
- **Subjects**: 650, 651, 653 fields (subject headings)
- **Description**: 520 field (summary/abstract)
- **Language**: 041 field (language codes)
- **Control Numbers**: 001, 003 fields (record identifiers)

### Search Features
- **Hybrid Search**: 60% semantic + 40% keyword search weighting
- **Field Weighting**: Title (3x), Author/Subjects (2x), Full-text (1.5x)
- **Vector Embeddings**: 768-dimensional embeddings via Ollama
- **Multi-language**: English text analysis with stemming
- **Filtering**: Language, subject, publication date filtering
- **RAG Integration**: Enhanced results with AI-powered insights

### External Dependencies (Optional)
- **Ollama**: For semantic embeddings (`nomic-embed-text` model)
- **Gemini AI**: For advanced RAG features and query enhancement

*Note: The system falls back gracefully if external services are unavailable*

## Production Considerations

### Performance Optimization
- **Batch Processing**: Configurable batch sizes for efficient indexing
- **Memory Management**: Optimized for large MARC files
- **Elasticsearch Tuning**: Proper index mapping and analyzer configuration
- **Caching**: Search result caching for improved response times

### Security & Monitoring
- **Authentication**: Elasticsearch security enabled
- **Health Checks**: Comprehensive service health monitoring  
- **Logging**: Detailed processing and error logs
- **Resource Limits**: Container resource constraints

## Troubleshooting

### Container Won't Start
- Check Docker is running: `docker info`
- Check available memory (need 3GB+ for Elasticsearch)
- View logs: `docker-compose logs elasticsearch`

### Connection Issues
- Verify containers are healthy: `docker-compose ps`
- Check port availability: `netstat -tulpn | grep 10000`
- Test internal networking: `docker exec marc-app curl http://elasticsearch:9200`

### Performance Issues
- Increase Elasticsearch heap: Edit `ES_JAVA_OPTS` in docker-compose.yml
- Increase Docker memory limits in Docker settings

### MARC Processing Issues
- **Large Files**: Ensure adequate memory (8GB+ recommended for large MARC files)
- **Processing Slow**: Monitor logs with `docker-compose logs -f marc-app`
- **Index Errors**: Check Elasticsearch health at http://localhost:9200/_cluster/health
- **Embedding Errors**: Verify Ollama service availability (optional dependency)

### Search Not Working
- Verify MARC records are indexed: `curl http://localhost:10000/api/stats`
- Check Elasticsearch index: `curl http://localhost:9200/marc-records/_count`
- Review search logs: `docker-compose logs marc-app | grep search`

## File Structure

```
├── Dockerfile              # Multi-stage build for app container  
├── docker-compose.yml      # Service orchestration
├── start.sh                # Convenience startup script
├── marc.mrc                # Sample MARC binary file (199MB)
├── .dockerignore           # Docker build exclusions
├── frontend/               # Angular 20 application
│   ├── src/               # Angular source code
│   └── dist/              # Built Angular app (created during build)
├── backend/               # Express.js API server
│   ├── server.js          # Main server file
│   └── package.json       # Node.js dependencies
└── marc-processor/        # Go MARC processing engine
    ├── main.go            # MARC binary parser and indexer
    ├── go.mod             # Go module dependencies
    └── process.sh         # MARC processing script
```