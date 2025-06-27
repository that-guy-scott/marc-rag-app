const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { Client } = require('@elastic/elasticsearch');
const ragSearchRouter = require('./routes/rag-search');

const app = express();
const PORT = process.env.PORT || 10000;

// Elasticsearch client configuration
const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'https://localhost:9200',
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
    password: process.env.ELASTICSEARCH_PASSWORD || 'pe9hpyozubpw*iSHOhkK'
  },
  tls: {
    rejectUnauthorized: false // For self-signed certificates
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from Angular dist folder
app.use(express.static(path.join(__dirname, 'frontend/dist/frontend/browser')));

// API Routes

// Mount RAG search routes
app.use('/api', ragSearchRouter);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const health = await esClient.cluster.health();
    res.json({
      status: 'healthy',
      elasticsearch: health.status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Primary search endpoint for hybrid search
app.post('/api/search', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query || query.trim() === '') {
      return res.status(400).json({
        error: 'Search query is required',
        results: []
      });
    }

    console.log(`Searching for: "${query}"`);

    const indexName = 'marc-records';
    
    try {
      // Check if index exists and has documents
      const countResponse = await esClient.count({ index: indexName });
      
      if (countResponse.count === 0) {
        console.log('No documents in index, returning mock data');
        return res.json({
          query: query,
          results: getMockResults(query),
          total: getMockResults(query).length,
          timestamp: new Date().toISOString(),
          note: 'Using mock data - no MARC records indexed yet'
        });
      }

      // Generate query embedding using Ollama
      let queryEmbedding = null;
      try {
        const embeddingResponse = await axios.post('http://host.docker.internal:11434/api/embeddings', {
          model: 'nomic-embed-text',
          prompt: query
        }, { timeout: 10000 });
        queryEmbedding = embeddingResponse.data.embedding;
      } catch (embError) {
        console.warn('Failed to generate query embedding:', embError.message);
      }

      // Build hybrid search query (60% semantic + 40% keyword)
      const searchQuery = {
        query: {
          bool: {
            should: []
          }
        },
        size: 20,
        _source: {
          excludes: ['embedding'] // Don't return large embedding arrays
        }
      };

      // Keyword search (40% weight)
      searchQuery.query.bool.should.push({
        bool: {
          should: [
            {
              multi_match: {
                query: query,
                fields: ['title^3', 'author^2', 'publisher', 'subjects^2', 'description'],
                type: 'best_fields',
                fuzziness: 'AUTO'
              }
            },
            {
              match: {
                searchableText: {
                  query: query,
                  boost: 1.5
                }
              }
            }
          ],
          boost: 0.4
        }
      });

      // Semantic search (60% weight) - only if embedding was generated
      if (queryEmbedding) {
        searchQuery.query.bool.should.push({
          script_score: {
            query: { match_all: {} },
            script: {
              source: "cosineSimilarity(params.query_vector, 'embedding') + 1.0",
              params: {
                query_vector: queryEmbedding
              }
            },
            boost: 0.6
          }
        });
      }

      // If no embedding, adjust keyword search weight
      if (!queryEmbedding) {
        searchQuery.query.bool.should[0].bool.boost = 1.0;
      }

      // Execute search
      const searchResponse = await esClient.search({
        index: indexName,
        body: searchQuery
      });

      // Format results
      const results = searchResponse.hits.hits.map(hit => ({
        id: hit._id,
        title: hit._source.title || 'Unknown Title',
        author: hit._source.author || 'Unknown Author',
        publisher: hit._source.publisher || '',
        year: hit._source.publicationYear || '',
        isbn: hit._source.isbn || '',
        subjects: hit._source.subjects || [],
        description: hit._source.description || '',
        score: hit._score,
        marcRecord: hit._source.controlNumber || hit._id
      }));

      res.json({
        query: query,
        results: results,
        total: searchResponse.hits.total.value || searchResponse.hits.total,
        maxScore: searchResponse.hits.max_score,
        searchType: queryEmbedding ? 'hybrid' : 'keyword-only',
        timestamp: new Date().toISOString()
      });

    } catch (searchError) {
      // If index doesn't exist or search fails, return mock data
      console.warn('Search failed, returning mock data:', searchError.message);
      
      res.json({
        query: query,
        results: getMockResults(query),
        total: getMockResults(query).length,
        timestamp: new Date().toISOString(),
        note: 'Using mock data - search index not available',
        error: searchError.message
      });
    }

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Internal server error during search',
      message: error.message,
      results: []
    });
  }
});

// Helper function for mock results
function getMockResults(query) {
  const mockResults = [
    {
      title: "Introduction to Information Science",
      author: "Jane Smith",
      publisher: "Academic Press",
      year: "2023",
      isbn: "978-0-123456-78-9",
      score: 0.95,
      marcRecord: "mock_001234567",
      subjects: ["Information Science", "Library Science"]
    },
    {
      title: "Database Systems and Design",
      author: "John Doe",
      publisher: "Tech Publications",
      year: "2022",
      isbn: "978-0-987654-32-1",
      score: 0.87,
      marcRecord: "mock_001234568",
      subjects: ["Database Design", "Computer Science"]
    },
    {
      title: "Modern Library Science",
      author: "Alice Johnson",
      publisher: "University Press",
      year: "2024",
      isbn: "978-0-456789-01-2",
      score: 0.78,
      marcRecord: "mock_001234569",
      subjects: ["Library Science", "Information Management"]
    }
  ];

  return mockResults.filter(item => 
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.author.toLowerCase().includes(query.toLowerCase()) ||
    item.publisher.toLowerCase().includes(query.toLowerCase()) ||
    item.subjects.some(subject => subject.toLowerCase().includes(query.toLowerCase()))
  );
}

// Get item detail by ID
app.get('/api/item/:id', async (req, res) => {
  try {
    const itemId = req.params.id;
    
    if (!itemId) {
      return res.status(400).json({
        error: 'Item ID is required'
      });
    }

    console.log(`Getting item detail for: ${itemId}`);

    const indexName = 'marc-records';
    
    try {
      // Try to get the actual document
      const getResponse = await esClient.get({
        index: indexName,
        id: itemId,
        _source: {
          excludes: ['embedding'] // Don't return large embedding arrays
        }
      });

      // Format the response
      const item = {
        id: getResponse._id,
        title: getResponse._source.title || 'Unknown Title',
        subtitle: getResponse._source.subtitle || '',
        author: getResponse._source.author || 'Unknown Author',
        publisher: getResponse._source.publisher || '',
        year: getResponse._source.publicationYear || '',
        isbn: getResponse._source.isbn || '',
        subjects: getResponse._source.subjects || [],
        description: getResponse._source.description || '',
        marcRecord: getResponse._source.controlNumber || getResponse._id,
        callNumber: getResponse._source.callNumber || '',
        format: getResponse._source.format || 'Book',
        language: getResponse._source.language || 'English',
        pages: getResponse._source.pages || '',
        location: getResponse._source.location || 'Main Library',
        availability: getResponse._source.availability || 'Available',
        notes: getResponse._source.notes || ''
      };

      res.json(item);

    } catch (searchError) {
      // If document doesn't exist, return mock data for demonstration
      console.warn(`Item ${itemId} not found, returning mock data`);
      
      res.json(getMockItemDetail(itemId));
    }

  } catch (error) {
    console.error('Item detail error:', error);
    res.status(500).json({
      error: 'Failed to retrieve item details',
      message: error.message
    });
  }
});

// Get similar items by ID  
app.get('/api/item/:id/similar', async (req, res) => {
  try {
    const itemId = req.params.id;
    
    if (!itemId) {
      return res.status(400).json({
        error: 'Item ID is required',
        results: []
      });
    }

    console.log(`Getting similar items for: ${itemId}`);

    const indexName = 'marc-records';
    
    try {
      // First get the source item to extract its embedding
      const sourceItem = await esClient.get({
        index: indexName,
        id: itemId
      });

      if (!sourceItem._source.embedding) {
        // No embedding available, return mock data
        return res.json({
          itemId: itemId,
          results: getMockSimilarItems(itemId),
          total: getMockSimilarItems(itemId).length,
          note: 'Using mock data - no embeddings available'
        });
      }

      // Use the item's embedding to find similar items
      const similarityQuery = {
        query: {
          script_score: {
            query: {
              bool: {
                must_not: {
                  term: { _id: itemId } // Exclude the source item
                }
              }
            },
            script: {
              source: "cosineSimilarity(params.query_vector, 'embedding') + 1.0",
              params: {
                query_vector: sourceItem._source.embedding
              }
            }
          }
        },
        size: 8,
        _source: {
          excludes: ['embedding']
        }
      };

      const searchResponse = await esClient.search({
        index: indexName,
        body: similarityQuery
      });

      // Format results
      const results = searchResponse.hits.hits.map(hit => ({
        id: hit._id,
        title: hit._source.title || 'Unknown Title',
        author: hit._source.author || 'Unknown Author',
        year: hit._source.publicationYear || '',
        score: (hit._score - 1.0) // Normalize back to 0-1 range
      }));

      res.json({
        itemId: itemId,
        results: results,
        total: searchResponse.hits.total.value || searchResponse.hits.total,
        maxScore: searchResponse.hits.max_score
      });

    } catch (searchError) {
      // If index doesn't exist or search fails, return mock data
      console.warn(`Similar items search failed for ${itemId}, returning mock data:`, searchError.message);
      
      res.json({
        itemId: itemId,
        results: getMockSimilarItems(itemId),
        total: getMockSimilarItems(itemId).length,
        note: 'Using mock data - search index not available'
      });
    }

  } catch (error) {
    console.error('Similar items error:', error);
    res.status(500).json({
      error: 'Failed to retrieve similar items',
      message: error.message,
      results: []
    });
  }
});

// Helper function for mock item detail
function getMockItemDetail(itemId) {
  return {
    id: itemId,
    title: "Introduction to Information Science",
    subtitle: "Theory and Practice", 
    author: "Jane Smith",
    publisher: "Academic Press",
    year: "2023",
    isbn: "978-0-123456-78-9",
    subjects: ["Information Science", "Library Science", "Academic Research", "Data Management"],
    description: "This comprehensive introduction to information science covers the fundamental theories, methods, and practices in the field. The book explores how information is created, organized, stored, retrieved, and used in various contexts, from traditional libraries to digital environments.",
    marcRecord: itemId,
    callNumber: "Z665 .S64 2023",
    format: "Book",
    language: "English", 
    pages: "456",
    location: "Main Library - 3rd Floor",
    availability: "Available",
    notes: "Includes bibliographical references and index."
  };
}

// Helper function for mock similar items
function getMockSimilarItems(itemId) {
  return [
    {
      id: "mock_similar_001",
      title: "Digital Libraries and Information Systems",
      author: "Robert Brown", 
      year: "2022",
      score: 0.87
    },
    {
      id: "mock_similar_002",
      title: "Library Science Fundamentals", 
      author: "Alice Johnson",
      year: "2024",
      score: 0.82
    },
    {
      id: "mock_similar_003",
      title: "Information Architecture",
      author: "David Wilson",
      year: "2023", 
      score: 0.78
    },
    {
      id: "mock_similar_004",
      title: "Data Science for Libraries",
      author: "Sarah Davis",
      year: "2023",
      score: 0.75
    }
  ];
}

// MARC record processing endpoint
app.post('/api/index-marc', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const path = require('path');
    
    console.log('Starting MARC processing...');
    
    // Execute the Go processor directly
    const processorPath = path.join(__dirname, 'marc-processor');
    const command = `cd ${processorPath} && ELASTICSEARCH_URL=http://elasticsearch:9200 ELASTICSEARCH_USERNAME=elastic ELASTICSEARCH_PASSWORD=marc-rag-password-2024 OLLAMA_URL=http://host.docker.internal:11434 MARC_FILE=/app/marc.mrc BATCH_SIZE=100 ./marc-processor`;
    
    exec(command, { timeout: 300000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('MARC processing error:', error);
        return res.status(500).json({
          error: 'MARC processing failed',
          message: error.message,
          stderr: stderr
        });
      }
      
      console.log('MARC processing completed');
      res.json({
        message: 'MARC processing completed successfully',
        status: 'completed',
        output: stdout,
        timestamp: new Date().toISOString()
      });
    });
    
  } catch (error) {
    console.error('MARC indexing error:', error);
    res.status(500).json({
      error: 'Failed to start MARC processing',
      message: error.message
    });
  }
});

// Get search statistics
app.get('/api/stats', async (req, res) => {
  try {
    const indexName = 'marc-records';
    
    // Get document count
    const countResponse = await esClient.count({
      index: indexName
    });
    
    // Get index stats
    const statsResponse = await esClient.indices.stats({
      index: indexName
    });
    
    const indexStats = statsResponse.indices?.[indexName]?.total;
    
    res.json({
      indexName: indexName,
      totalRecords: countResponse.count || 0,
      indexedRecords: countResponse.count || 0,
      indexSize: indexStats?.store?.size_in_bytes || 0,
      searchesPerformed: indexStats?.search?.query_total || 0,
      lastIndexed: new Date().toISOString()
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      error: 'Failed to retrieve statistics',
      message: error.message,
      indexName: 'marc-records',
      totalRecords: 0,
      indexedRecords: 0,
      indexSize: 0,
      searchesPerformed: 0,
      lastIndexed: null
    });
  }
});

// Serve Angular app for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/frontend/browser/index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MARC RAG Server running on port ${PORT}`);
  console.log(`📊 API endpoints:`);
  console.log(`   - POST /api/search - Primary search endpoint`);
  console.log(`   - POST /api/rag-search - Enhanced RAG search endpoint`);
  console.log(`   - POST /api/chat - Conversational interface`);
  console.log(`   - GET  /api/health - Health check`);
  console.log(`   - POST /api/index-marc - MARC indexing`);
  console.log(`   - GET  /api/stats - Search statistics`);
  console.log(`🌐 Frontend served from: http://localhost:${PORT}/`);
  console.log(`🤖 RAG Features: ${process.env.GEMINI_API_KEY ? '✅ Enabled' : '❌ Disabled (no API key)'}`);
  
  // Test Elasticsearch connection
  esClient.cluster.health()
    .then(health => {
      console.log(`✅ Elasticsearch connected: ${health.status}`);
    })
    .catch(error => {
      console.log(`❌ Elasticsearch connection failed: ${error.message}`);
    });
});