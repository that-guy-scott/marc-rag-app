# MARC RAG Search System - `/api/search` Endpoint

## Overview

The `/api/search` endpoint implements a **hybrid search system** that combines traditional keyword search with semantic search using vector embeddings to provide comprehensive and relevant results from MARC bibliographic records.

## How It Works

### 1. Request Processing
- **Method**: `POST /api/search`
- **Input**: JSON body with `{"query": "search terms"}`
- **Validation**: Ensures query is provided and not empty

### 2. Index Verification
- Checks if the `marc-records` Elasticsearch index exists and contains documents
- Falls back to mock data if no real records are available

### 3. Hybrid Search Architecture

The system uses a **two-pronged approach** combining:

#### A. Semantic Search (60% weight)
- **Vector Embeddings**: Converts user query to embedding using Ollama's `nomic-embed-text` model
- **Similarity Calculation**: Uses cosine similarity to find semantically related documents
- **Purpose**: Finds conceptually related content even when exact keywords don't match

#### B. Keyword Search (40% weight)
- **Multi-field Search**: Searches across multiple MARC fields with different weights:
  - `title^3` (3x boost - highest priority)
  - `author^2` (2x boost)
  - `subjects^2` (2x boost)
  - `publisher` (1x weight)
  - `description` (1x weight)
- **Full-text Search**: Also searches the combined `searchableText` field (1.5x boost)
- **Fuzzy Matching**: Uses `AUTO` fuzziness to handle typos and variations

### 4. Elasticsearch Query Structure

```json
{
  "query": {
    "bool": {
      "should": [
        {
          "bool": {
            "should": [
              {
                "multi_match": {
                  "query": "user query",
                  "fields": ["title^3", "author^2", "publisher", "subjects^2", "description"],
                  "type": "best_fields",
                  "fuzziness": "AUTO"
                }
              },
              {
                "match": {
                  "searchableText": {
                    "query": "user query",
                    "boost": 1.5
                  }
                }
              }
            ],
            "boost": 0.4
          }
        },
        {
          "script_score": {
            "query": { "match_all": {} },
            "script": {
              "source": "cosineSimilarity(params.query_vector, 'embedding') + 1.0",
              "params": {
                "query_vector": [embedded_query_vector]
              }
            },
            "boost": 0.6
          }
        }
      ]
    }
  },
  "size": 20
}
```

### 5. Fallback Mechanisms

#### No Embedding Service
- If Ollama is unavailable, falls back to **keyword-only search**
- Adjusts keyword search boost to 100% (from 40%)

#### No Index/Data
- Returns curated mock results that match the query
- Maintains consistent API response format

### 6. Response Format

```json
{
  "query": "user search terms",
  "results": [
    {
      "id": "marc_record_id",
      "title": "Book Title",
      "author": "Author Name",
      "publisher": "Publisher Name",
      "year": 2023,
      "isbn": "978-0-123456-78-9",
      "subjects": ["Subject 1", "Subject 2"],
      "description": "Book description",
      "score": 15.995066,
      "marcRecord": "control_number"
    }
  ],
  "total": 7700,
  "maxScore": 15.995066,
  "searchType": "hybrid|keyword-only",
  "timestamp": "2025-07-02T01:01:19.864Z"
}
```

## Technical Components

### Dependencies
- **Elasticsearch**: Document storage and keyword search
- **Ollama**: Semantic embedding generation (optional)
- **axios**: HTTP client for embedding service
- **@elastic/elasticsearch**: Elasticsearch Node.js client

### Performance Optimizations
- **Excluded Fields**: Embeddings excluded from response to reduce payload size
- **Result Limiting**: Returns top 20 results
- **Timeout Handling**: 10-second timeout for embedding generation
- **Async Processing**: Non-blocking embedding generation

### Error Handling
- Graceful degradation when embedding service fails
- Mock data fallback for missing indices
- Comprehensive error logging and user feedback

## Search Quality Features

### Field Weighting Strategy
1. **Title** (3x): Most important for relevance
2. **Author & Subjects** (2x): High relevance indicators  
3. **Searchable Text** (1.5x): Comprehensive full-text match
4. **Publisher & Description** (1x): Supporting context

### Semantic Enhancement
- Understands conceptual relationships
- Handles synonyms and related terms
- Provides contextual relevance beyond keyword matching

## Use Cases

### Perfect For:
- **Conceptual Searches**: "artificial intelligence in education"
- **Cross-field Queries**: "machine learning databases"
- **Fuzzy Searches**: Handles typos and variations
- **Comprehensive Research**: Finds both exact and related materials

### Examples:
- Query: "database" → Finds both "Database Systems" and "Information Management"
- Query: "AI" → Matches "Artificial Intelligence" and "Machine Learning"
- Query: "shakespear" → Corrects to "Shakespeare" via fuzzy matching

This hybrid approach ensures users get both precise keyword matches and semantically relevant results, making it ideal for academic and research applications.