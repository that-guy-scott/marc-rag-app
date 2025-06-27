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

### 3. Test the Search

Use the web interface or test the API directly:

```bash
curl -X POST http://localhost:10000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "database"}'
```

## Container Details

### marc-app (Frontend + Backend)
- **Ports**: 10000:10000
- **Technology**: Angular 20 + Express.js + Node.js 20
- **Health Check**: http://localhost:10000/api/health
- **Features**:
  - Serves Angular SPA from root path
  - RESTful API endpoints under `/api/*`
  - Mock search data (pending real MARC implementation)

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

- `POST /api/search` - Primary search endpoint
- `GET /api/health` - Health check and Elasticsearch status
- `POST /api/index-marc` - MARC record indexing (pending)
- `GET /api/stats` - Search statistics (pending)

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
- `NODE_ENV=production`
- `PORT=10000`
- `ELASTICSEARCH_URL=http://elasticsearch:9200`
- `ELASTICSEARCH_USERNAME=elastic`
- `ELASTICSEARCH_PASSWORD=marc-rag-password-2024`

### Environment Variables (elasticsearch)
- `discovery.type=single-node`
- `ES_JAVA_OPTS=-Xms1g -Xmx1g`
- `xpack.security.enabled=true`
- `ELASTIC_PASSWORD=marc-rag-password-2024`
- `xpack.security.http.ssl.enabled=false`

## Next Steps

1. **MARC Processing**: Implement actual MARC record parsing and indexing
2. **Hybrid Search**: Replace mock data with real Elasticsearch queries
3. **Ollama Integration**: Add semantic embedding generation
4. **Volume Mounting**: Mount MARC data files for processing
5. **Production Setup**: Add proper SSL, security hardening, and monitoring

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

## File Structure

```
├── Dockerfile              # Multi-stage build for app container
├── docker-compose.yml      # Service orchestration
├── start.sh                # Convenience startup script
├── .dockerignore           # Docker build exclusions
├── frontend/               # Angular application
│   ├── src/               # Angular source code
│   └── dist/              # Built Angular app (created during build)
└── backend/               # Express.js API server
    ├── server.js          # Main server file
    └── package.json       # Node.js dependencies
```