const express = require('express');
const GeminiService = require('../services/gemini-service');
const ContextManager = require('../services/context-manager');
const QueryEnhancer = require('../services/query-enhancer');
const ResultAugmenter = require('../services/result-augmenter');
const RecommendationEngine = require('../services/recommendation-engine');
const AIQueryOptimizer = require('../services/ai-query-optimizer');
const SchemaExtractor = require('../services/schema-extractor');
const ResultSorter = require('../services/result-sorter');
const { Client } = require('@elastic/elasticsearch');
const axios = require('axios');

const router = express.Router();

// Initialize services
const geminiService = new GeminiService();
const contextManager = new ContextManager();
const queryEnhancer = new QueryEnhancer();
const resultAugmenter = new ResultAugmenter();
const recommendationEngine = new RecommendationEngine();
const aiQueryOptimizer = new AIQueryOptimizer();
const resultSorter = new ResultSorter();

// Initialize Elasticsearch client
const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'https://localhost:9200',
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
    password: process.env.ELASTICSEARCH_PASSWORD || 'pe9hpyozubpw*iSHOhkK'
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Initialize schema extractor
const schemaExtractor = new SchemaExtractor(esClient);

// Enhanced RAG search endpoint
router.post('/rag-search', async (req, res) => {
  try {
    const { 
      query, 
      context = '', 
      conversationId,
      preferences = {},
      userId = 'anonymous',
      sortBy = 'best_match'
    } = req.body;
    
    if (!query || query.trim() === '') {
      return res.status(400).json({
        error: 'Search query is required',
        results: []
      });
    }

    console.log(`RAG Search: "${query}" (conversation: ${conversationId})`);

    // Get or create conversation
    let activeConversationId = conversationId;
    if (!activeConversationId || !contextManager.getConversation(activeConversationId)) {
      activeConversationId = contextManager.createConversation(userId);
    }

    // Add user query to conversation
    contextManager.addMessage(activeConversationId, query, 'user');
    
    // Get conversation context
    const conversationContext = contextManager.getConversationContext(activeConversationId);
    const fullContext = [conversationContext, context].filter(Boolean).join('\n\n');

    // Set user preferences
    if (Object.keys(preferences).length > 0) {
      contextManager.setUserPreferences(activeConversationId, preferences);
    }

    const indexName = 'marc-records';
    let searchResults = [];
    let searchMetadata = {};
    let aiOptimization = null;

    try {
      console.log(`🔍 Multi-stage AI-powered search for: "${query}"`);
      
      // Stage 1: Get index schema for AI optimization
      const indexSchema = await schemaExtractor.getIndexSchema(indexName);
      console.log('📋 Retrieved index schema with', Object.keys(indexSchema.searchableFields).length, 'searchable fields');

      // Stage 2: Initial hybrid search
      const initialResults = await performInitialHybridSearch(query, indexName, preferences);
      console.log('🎯 Initial search returned', initialResults.results.length, 'results');

      // Stage 3: AI query optimization (if we have results to work with)
      if (initialResults.results.length > 0 && await geminiService.isServiceAvailable()) {
        console.log('🤖 Starting AI query optimization...');
        
        try {
          aiOptimization = await aiQueryOptimizer.optimizeQuery(
            query, 
            initialResults.results, 
            indexSchema
          );

          if (aiOptimization.success && aiOptimization.confidence > 0.4) {
            console.log(`✨ AI optimization confidence: ${aiOptimization.confidence}`);
            console.log(`💡 Strategy: ${aiOptimization.reasoning}`);
            
            // Stage 4: Execute AI-optimized query
            const optimizedResults = await aiQueryOptimizer.executeOptimizedQuery(
              esClient,
              indexName,
              aiOptimization.optimizedQuery,
              initialResults.results
            );

            searchResults = optimizedResults.results;
            searchMetadata = {
              ...optimizedResults.metadata,
              aiOptimized: !optimizedResults.usedFallback,
              optimization: aiOptimization,
              initialResults: initialResults.results.length,
              finalResults: optimizedResults.results.length
            };

            if (!optimizedResults.usedFallback) {
              console.log('🚀 Using AI-optimized results:', searchResults.length, 'items');
            } else {
              console.log('⚠️ AI optimization failed, using initial results');
            }
          } else {
            console.log('⚠️ AI optimization confidence too low, using initial results');
            searchResults = initialResults.results;
            searchMetadata = initialResults.metadata;
          }
        } catch (optimizationError) {
          console.warn('AI optimization failed:', optimizationError.message);
          searchResults = initialResults.results;
          searchMetadata = initialResults.metadata;
        }
      } else {
        // Use initial results if no AI available or no results to optimize
        console.log('📚 Using initial search results (no AI optimization)');
        searchResults = initialResults.results;
        searchMetadata = initialResults.metadata;
      }

      // Add overall search metadata
      searchMetadata.searchApproach = 'multi-stage-ai-optimized';
      searchMetadata.stagesUsed = aiOptimization?.success ? ['initial', 'ai-optimization'] : ['initial-only'];

      // Enhanced result processing with new services
      let augmentedResults = null;
      let enhancedRecommendations = null;
      let aiInsights = null;
      let citations = null;

      if (searchResults.length > 0) {
        try {
          // Augment results with detailed analysis
          augmentedResults = await resultAugmenter.augmentResults(searchResults, query, fullContext);
          
          // Generate comprehensive recommendations
          const searchHistory = contextManager.getConversation(activeConversationId)?.searchHistory || [];
          enhancedRecommendations = await recommendationEngine.generateRecommendations(
            searchResults, query, fullContext, searchHistory
          );

          // Generate AI insights using Gemini
          const geminiAvailable = await geminiService.isServiceAvailable();
          if (geminiAvailable) {
            try {
              const [summaryData, researchData] = await Promise.all([
                geminiService.summarizeResults(searchResults, query),
                geminiService.generateResearchInsights(query, searchResults, fullContext)
              ]);

              aiInsights = {
                ...summaryData,
                ...researchData
              };

              // Generate citations for top results
              citations = {
                apa: await geminiService.generateCitations(searchResults.slice(0, 5), 'apa'),
                mla: await geminiService.generateCitations(searchResults.slice(0, 5), 'mla')
              };

            } catch (aiError) {
              console.warn('AI insights generation failed:', aiError.message);
              aiInsights = generateFallbackInsights(searchResults, query);
            }
          } else {
            aiInsights = generateFallbackInsights(searchResults, query);
          }

        } catch (enhancementError) {
          console.warn('Result enhancement failed:', enhancementError.message);
          aiInsights = generateFallbackInsights(searchResults, query);
          enhancedRecommendations = generateFallbackRecommendations(query);
        }
      } else {
        aiInsights = generateFallbackInsights(searchResults, query);
        enhancedRecommendations = generateFallbackRecommendations(query);
      }

      // Stage 5: Generate AI explanation of results (if AI optimization was used)
      let aiExplanation = null;
      if (aiOptimization?.success && await geminiService.isServiceAvailable()) {
        try {
          aiExplanation = await aiQueryOptimizer.explainResults(query, searchResults, aiOptimization);
        } catch (error) {
          console.warn('AI explanation failed:', error.message);
        }
      }

      // Add search to conversation history
      contextManager.addSearchToHistory(activeConversationId, query, searchResults, aiInsights);

      // Sort results based on sortBy parameter
      let finalResults = augmentedResults?.results || searchResults;
      
      if (finalResults.length > 0) {
        console.log(`🔄 Sorting ${finalResults.length} results by: ${sortBy}`);
        
        // Validate sort type
        if (resultSorter.isValidSortType(sortBy)) {
          const sortStartTime = Date.now();
          finalResults = resultSorter.sortResults(finalResults, sortBy);
          const sortTime = Date.now() - sortStartTime;
          
          console.log(`✅ Results sorted in ${sortTime}ms`);
          
          // Update metadata with sort info
          searchMetadata.sortBy = sortBy;
          searchMetadata.sortTime = sortTime;
        } else {
          console.warn(`Invalid sort type: ${sortBy}, using default sorting`);
          finalResults = resultSorter.sortResults(finalResults, 'best_match');
          searchMetadata.sortBy = 'best_match';
        }
      }

      // Add AI response to conversation
      const aiResponseSummary = aiExplanation || `Found ${finalResults.length} resources. ${aiInsights?.summary || 'Search completed successfully.'}`;
      contextManager.addMessage(activeConversationId, aiResponseSummary, 'assistant');

      // Build enhanced response
      const response = {
        query: query,
        originalQuery: query,
        enhancedQuery: query, // No longer using the old query enhancement
        conversationId: activeConversationId,
        results: finalResults,
        augmentedResults: augmentedResults,
        aiInsights: aiInsights,
        aiExplanation: aiExplanation,
        aiOptimization: aiOptimization,
        recommendations: enhancedRecommendations || generateFallbackRecommendations(query),
        citations: citations || {},
        metadata: {
          ...searchMetadata,
          timestamp: new Date().toISOString(),
          geminiEnabled: await geminiService.isServiceAvailable(),
          aiOptimizationUsed: !!aiOptimization?.success,
          processingTime: {
            resultAugmentation: augmentedResults?.processingTime || 0,
            recommendations: enhancedRecommendations?.processingTime || 0
          }
        }
      };

      res.json(response);

    } catch (searchError) {
      console.warn('Search failed, returning mock data:', searchError.message);
      
      searchResults = getMockResults(query);
      const fallbackInsights = generateFallbackInsights(searchResults, query);
      
      res.json({
        query: query,
        conversationId: activeConversationId,
        results: searchResults,
        aiInsights: fallbackInsights,
        recommendations: generateFallbackRecommendations(query),
        citations: {},
        metadata: {
          total: searchResults.length,
          timestamp: new Date().toISOString(),
          note: 'Using mock data - search index not available',
          error: searchError.message,
          geminiEnabled: await geminiService.isServiceAvailable()
        }
      });
    }

  } catch (error) {
    console.error('RAG search error:', error);
    res.status(500).json({
      error: 'Internal server error during RAG search',
      message: error.message,
      results: []
    });
  }
});

// Chat interface endpoint
router.post('/chat', async (req, res) => {
  try {
    const { 
      message, 
      conversationId,
      userId = 'anonymous' 
    } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({
        error: 'Message is required'
      });
    }

    // Get or create conversation
    let activeConversationId = conversationId;
    if (!activeConversationId || !contextManager.getConversation(activeConversationId)) {
      activeConversationId = contextManager.createConversation(userId);
    }

    // Add user message
    contextManager.addMessage(activeConversationId, message, 'user');

    // Get conversation context
    const conversationContext = contextManager.getConversationContext(activeConversationId);

    // Check if this is a search request or general chat
    const isSearchRequest = message.toLowerCase().includes('search') || 
                           message.toLowerCase().includes('find') ||
                           message.toLowerCase().includes('look for');

    let response;
    
    if (isSearchRequest) {
      // Extract search terms and redirect to RAG search
      const searchTerms = extractSearchTerms(message);
      
      if (searchTerms) {
        // Perform RAG search
        const searchResponse = await performInternalRAGSearch(searchTerms, conversationContext, activeConversationId);
        
        response = {
          conversationId: activeConversationId,
          message: `I found ${searchResponse.results.length} resources for "${searchTerms}". ${searchResponse.aiInsights.summary}`,
          type: 'search_results',
          searchResults: searchResponse.results.slice(0, 3), // Top 3 results
          aiInsights: searchResponse.aiInsights,
          suggestions: searchResponse.recommendations?.relatedQueries || []
        };
      } else {
        response = {
          conversationId: activeConversationId,
          message: "I'd be happy to help you search for library resources. Could you please specify what you're looking for?",
          type: 'clarification',
          suggestions: [
            "Search for books about machine learning",
            "Find articles on climate change",
            "Look for resources about digital libraries"
          ]
        };
      }
    } else {
      // General library assistance
      const geminiAvailable = await geminiService.isServiceAvailable();
      let assistantResponse;

      if (geminiAvailable) {
        try {
          const prompt = `You are a helpful research librarian assistant. Respond to this user message in the context of library and research services:

User message: "${message}"
Conversation context: ${conversationContext}

Provide a helpful, concise response focused on library and research assistance. If the user needs to search for resources, guide them on how to search effectively.`;

          assistantResponse = await geminiService.generateResponse(prompt);
        } catch (error) {
          console.warn('Gemini chat response failed:', error.message);
          assistantResponse = generateFallbackChatResponse(message);
        }
      } else {
        assistantResponse = generateFallbackChatResponse(message);
      }

      response = {
        conversationId: activeConversationId,
        message: assistantResponse,
        type: 'assistant_response',
        suggestions: [
          "Search for resources",
          "Help with citations",
          "Research strategies"
        ]
      };
    }

    // Add assistant response to conversation
    contextManager.addMessage(activeConversationId, response.message, 'assistant');

    res.json(response);

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Internal server error during chat',
      message: error.message
    });
  }
});

// Get available sort options
router.get('/sort-options', (req, res) => {
  try {
    const sortOptions = resultSorter.getAvailableSortOptions();
    res.json({
      sortOptions: sortOptions,
      defaultSort: 'best_match'
    });
  } catch (error) {
    console.error('Get sort options error:', error);
    res.status(500).json({
      error: 'Failed to retrieve sort options',
      message: error.message
    });
  }
});

// Get conversation history
router.get('/conversation/:conversationId', (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = contextManager.getConversation(conversationId);
    
    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found'
      });
    }

    res.json({
      id: conversation.id,
      messages: conversation.messages,
      searchHistory: conversation.searchHistory,
      createdAt: conversation.createdAt,
      lastActivity: conversation.lastActivity
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversation',
      message: error.message
    });
  }
});

// Helper functions

function buildEnhancedSearchQuery(searchQuery, keywords, queryEmbedding, preferences = {}) {
  const query = {
    query: {
      bool: {
        should: []
      }
    },
    size: preferences.maxResults || 20,
    _source: {
      excludes: ['embedding']
    }
  };

  // Keyword search component (enhanced with additional keywords)
  const keywordQueries = [];
  
  // Main multi-match query
  keywordQueries.push({
    multi_match: {
      query: searchQuery,
      fields: ['title^3', 'author^2', 'publisher', 'subjects^2', 'description'],
      type: 'best_fields',
      fuzziness: 'AUTO'
    }
  });

  // Additional keyword queries
  keywords.forEach(keyword => {
    if (keyword !== searchQuery) {
      keywordQueries.push({
        multi_match: {
          query: keyword,
          fields: ['title^2', 'author', 'subjects', 'searchableText'],
          type: 'best_fields',
          boost: 0.7
        }
      });
    }
  });

  // Searchable text query
  keywordQueries.push({
    match: {
      searchableText: {
        query: searchQuery,
        boost: 1.5
      }
    }
  });

  query.query.bool.should.push({
    bool: {
      should: keywordQueries,
      boost: queryEmbedding ? 0.4 : 1.0
    }
  });

  // Semantic search component
  if (queryEmbedding) {
    query.query.bool.should.push({
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

  // Add filters based on preferences
  if (preferences.dateRange) {
    const [startYear, endYear] = preferences.dateRange.split('-').map(Number);
    if (startYear && endYear) {
      query.query.bool.filter = query.query.bool.filter || [];
      query.query.bool.filter.push({
        range: {
          publicationYear: {
            gte: startYear,
            lte: endYear
          }
        }
      });
    }
  }

  if (preferences.formats && preferences.formats.length > 0) {
    query.query.bool.filter = query.query.bool.filter || [];
    query.query.bool.filter.push({
      terms: {
        format: preferences.formats
      }
    });
  }

  return query;
}

async function performInternalRAGSearch(searchTerms, context, conversationId) {
  // This is a simplified version for internal use
  // In a real implementation, you might want to refactor the main search logic
  // into a shared service to avoid code duplication
  
  const mockResults = getMockResults(searchTerms);
  const mockInsights = generateFallbackInsights(mockResults, searchTerms);
  const mockRecommendations = generateFallbackRecommendations(searchTerms);
  
  return {
    results: mockResults,
    aiInsights: mockInsights,
    recommendations: mockRecommendations
  };
}

function extractSearchTerms(message) {
  // Simple extraction - in production, you might want more sophisticated NLP
  const searchPatterns = [
    /search for (.+)/i,
    /find (.+)/i,
    /look for (.+)/i,
    /looking for (.+)/i,
    /need (.+)/i
  ];
  
  for (const pattern of searchPatterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1].replace(/books about|articles on|resources about/i, '').trim();
    }
  }
  
  return null;
}

function generateFallbackInsights(results, query) {
  return {
    summary: `Found ${results.length} resources related to "${query}". The results include various publications covering different aspects of the topic.`,
    keyTopics: [...new Set(results.flatMap(r => r.subjects || []))].slice(0, 5),
    keyAuthors: [...new Set(results.map(r => r.author).filter(Boolean))].slice(0, 5),
    publicationTrends: 'Results span multiple years with recent publications available.',
    researchGaps: [],
    methodology: 'Review the retrieved resources and consider expanding search terms for comprehensive coverage.',
    qualityIndicators: 'Results include scholarly and peer-reviewed sources.',
    researchStrategy: 'Systematic review approach recommended',
    sourceQuality: 'Mixed quality sources requiring individual evaluation',
    coverageAnalysis: 'Good coverage of main topic areas',
    nextSteps: ['Review top results', 'Expand search terms', 'Check recent publications']
  };
}

function generateFallbackRecommendations(query) {
  return {
    relatedQueries: [
      `Recent research on ${query}`,
      `${query} methodology`,
      `${query} case studies`
    ],
    researchDirections: [
      'Explore recent developments',
      'Look for systematic reviews',
      'Check conference proceedings'
    ],
    additionalSources: [
      'Academic journals',
      'Conference papers',
      'Dissertations'
    ],
    experts: [],
    interdisciplinaryConnections: []
  };
}

function generateFallbackChatResponse(message) {
  const responses = {
    greeting: "Hello! I'm here to help you with your research and finding library resources. What can I help you search for today?",
    help: "I can help you search for books, articles, and other resources in our catalog. I can also provide research guidance and generate citations.",
    thanks: "You're welcome! Feel free to ask if you need help finding more resources or have other research questions.",
    default: "I'm a research librarian assistant. I can help you search for resources, provide research guidance, and assist with citations. What would you like to explore?"
  };
  
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return responses.greeting;
  } else if (lowerMessage.includes('help')) {
    return responses.help;
  } else if (lowerMessage.includes('thank')) {
    return responses.thanks;
  } else {
    return responses.default;
  }
}

function getMockResults(query) {
  const mockResults = [
    {
      id: "mock_001",
      title: "Introduction to Information Science",
      author: "Jane Smith",
      publisher: "Academic Press",
      year: "2023",
      isbn: "978-0-123456-78-9",
      score: 0.95,
      marcRecord: "mock_001234567",
      subjects: ["Information Science", "Library Science"],
      description: "A comprehensive introduction to the field of information science."
    },
    {
      id: "mock_002",
      title: "Database Systems and Design",
      author: "John Doe",
      publisher: "Tech Publications",
      year: "2022",
      isbn: "978-0-987654-32-1",
      score: 0.87,
      marcRecord: "mock_001234568",
      subjects: ["Database Design", "Computer Science"],
      description: "Modern approaches to database design and implementation."
    },
    {
      id: "mock_003",
      title: "Modern Library Science",
      author: "Alice Johnson",
      publisher: "University Press",
      year: "2024",
      isbn: "978-0-456789-01-2",
      score: 0.78,
      marcRecord: "mock_001234569",
      subjects: ["Library Science", "Information Management"],
      description: "Contemporary practices in library and information science."
    }
  ];

  return mockResults.filter(item => 
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.author.toLowerCase().includes(query.toLowerCase()) ||
    item.publisher.toLowerCase().includes(query.toLowerCase()) ||
    item.subjects.some(subject => subject.toLowerCase().includes(query.toLowerCase()))
  );
}

// New function for initial hybrid search
async function performInitialHybridSearch(query, indexName, preferences = {}) {
  try {
    // Check if index exists and has documents
    const countResponse = await esClient.count({ index: indexName });
    
    if (countResponse.count === 0) {
      console.log('No documents in index, returning mock data');
      return {
        results: getMockResults(query),
        metadata: {
          total: getMockResults(query).length,
          searchType: 'mock',
          note: 'Using mock data - no MARC records indexed yet'
        }
      };
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

    // Build initial hybrid search query
    const elasticQuery = buildEnhancedSearchQuery(query, [query], queryEmbedding, preferences);

    // Execute search
    const searchResponse = await esClient.search({
      index: indexName,
      body: elasticQuery
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

    return {
      results: results,
      metadata: {
        total: searchResponse.hits.total.value || searchResponse.hits.total,
        maxScore: searchResponse.hits.max_score,
        searchType: queryEmbedding ? 'hybrid' : 'keyword-only'
      }
    };

  } catch (searchError) {
    console.warn('Initial search failed, returning mock data:', searchError.message);
    
    return {
      results: getMockResults(query),
      metadata: {
        total: getMockResults(query).length,
        searchType: 'mock-fallback',
        note: 'Using mock data - search index not available',
        error: searchError.message
      }
    };
  }
}

module.exports = router;