const GeminiService = require('./gemini-service');

class AIQueryOptimizer {
  constructor() {
    this.geminiService = new GeminiService();
  }

  /**
   * Main optimization workflow
   */
  async optimizeQuery(userQuery, initialResults, indexSchema) {
    try {
      const optimization = await this.generateOptimizedQuery(
        userQuery, 
        initialResults, 
        indexSchema
      );
      
      return {
        success: true,
        originalQuery: userQuery,
        optimizedQuery: optimization.query,
        confidence: optimization.confidence,
        reasoning: optimization.reasoning,
        strategy: optimization.strategy
      };
    } catch (error) {
      console.warn('AI query optimization failed:', error.message);
      return {
        success: false,
        originalQuery: userQuery,
        optimizedQuery: null,
        error: error.message
      };
    }
  }

  /**
   * Identify specific library materials that match the user's conceptual query
   */
  async identifyLibraryMaterials(userQuery) {
    try {
      const prompt = `You are a library expert helping identify specific materials a user might be looking for.

USER QUERY: "${userQuery}"

Based on this description, what specific library materials (books, movies, TV series, etc.) might the user be looking for? 

Provide a list of 10 specific titles that match this description. Include:
- Book titles and series
- Movie titles  
- TV series
- Popular works that fit the description

Format your response as a simple JSON array of strings:
["Title 1", "Title 2", "Title 3", ...]

Be specific with actual titles, not generic descriptions. For example:
- If they mention "kids going to school to become wizards" → include "Harry Potter and the Philosopher's Stone", "Harry Potter series", "The Magicians"
- If they mention "space battles" → include "Star Wars", "Ender's Game", "The Expanse"

Return only the JSON array, no other text.`;

      const response = await this.geminiService.generateResponse(prompt, null, 0.3);
      
      // Parse the response
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const materials = JSON.parse(cleanResponse);
      
      if (Array.isArray(materials) && materials.length > 0) {
        console.log(`🎯 Identified ${materials.length} potential library materials for "${userQuery}"`);
        return materials;
      } else {
        console.warn('No materials identified or invalid format');
        return [];
      }
    } catch (error) {
      console.warn('Library material identification failed:', error.message);
      return [];
    }
  }

  /**
   * Generate optimized Elasticsearch query using AI
   */
  async generateOptimizedQuery(userQuery, initialResults, indexSchema) {
    // First, identify potential library materials the user might be looking for
    console.log('🔍 Identifying potential library materials...');
    const identifiedMaterials = await this.identifyLibraryMaterials(userQuery);
    
    if (identifiedMaterials.length > 0) {
      console.log(`📚 Found ${identifiedMaterials.length} potential materials:`, identifiedMaterials.slice(0, 3).join(', ') + (identifiedMaterials.length > 3 ? '...' : ''));
    } else {
      console.log('📚 No specific materials identified, using standard optimization');
    }
    
    const prompt = this.buildOptimizationPrompt(userQuery, initialResults, indexSchema, identifiedMaterials);
    
    try {
      const response = await this.geminiService.generateResponse(prompt, null, 0.3); // Lower temperature for more consistent JSON
      
      // Parse AI response
      const optimization = this.parseOptimizationResponse(response);
      
      // Validate the generated query
      this.validateElasticsearchQuery(optimization.query);
      
      // Add material identification info to the optimization result
      optimization.identifiedMaterials = identifiedMaterials;
      
      return optimization;
    } catch (error) {
      throw new Error(`Query optimization failed: ${error.message}`);
    }
  }

  /**
   * Build the optimization prompt for Gemini
   */
  buildOptimizationPrompt(userQuery, initialResults, indexSchema, identifiedMaterials = []) {
    const resultsSample = initialResults.slice(0, 5).map(result => ({
      title: result.title,
      author: result.author,
      subjects: result.subjects,
      description: result.description ? result.description.substring(0, 200) + '...' : '',
      score: result.score
    }));

    const materialsSection = identifiedMaterials.length > 0 ? `
LIKELY MATERIALS USER IS LOOKING FOR:
Based on the user's query, they might be searching for these specific library materials:
${identifiedMaterials.map((material, index) => `${index + 1}. ${material}`).join('\n')}

Use these specific titles, authors, and series names to improve your Elasticsearch query. Consider:
- Exact title matches with high boost
- Author name searches 
- Series searches
- Subject/genre matching
- Related works in the same universe/franchise
` : '';

    return `You are an expert Elasticsearch query optimizer for a library catalog system.

TASK: Analyze the user's search and current results, then generate an improved Elasticsearch query.

INDEX SCHEMA:
${JSON.stringify(indexSchema, null, 2)}

USER QUERY: "${userQuery}"
${materialsSection}
CURRENT RESULTS (${initialResults.length} found):
${JSON.stringify(resultsSample, null, 2)}

ANALYSIS:
1. The user query seems to be looking for: ${this.inferSearchIntent(userQuery)}
2. Current results quality: ${this.assessResultsQuality(initialResults, userQuery)}
3. Potential improvements: ${this.suggestImprovements(userQuery, initialResults)}

INSTRUCTIONS:
Generate an optimized Elasticsearch query that:
- Uses appropriate field boosting based on query intent
- Combines semantic and keyword search effectively  
- Leverages the most relevant fields from the schema
- Improves precision and recall
- Handles natural language queries intelligently

REQUIRED OUTPUT FORMAT (JSON only, no markdown):
{
  "query": {
    // Your optimized Elasticsearch query here
  },
  "confidence": 0.8,
  "reasoning": "Explanation of why this query should work better",
  "strategy": "Brief description of the search strategy used"
}

IMPORTANT: Return only valid JSON. No markdown, no explanation outside the JSON.`;
  }

  /**
   * Parse and validate AI response
   */
  parseOptimizationResponse(response) {
    try {
      // Clean potential markdown formatting
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleanResponse);
      
      // Validate required fields
      if (!parsed.query) {
        throw new Error('Missing query field in AI response');
      }
      if (typeof parsed.confidence !== 'number') {
        parsed.confidence = 0.5; // Default confidence
      }
      if (!parsed.reasoning) {
        parsed.reasoning = 'AI-generated query optimization';
      }
      if (!parsed.strategy) {
        parsed.strategy = 'hybrid_optimization';
      }

      return parsed;
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }
  }

  /**
   * Validate Elasticsearch query syntax
   */
  validateElasticsearchQuery(query) {
    if (!query || typeof query !== 'object') {
      throw new Error('Query must be a valid object');
    }

    // Basic validation - ensure it has recognizable ES query structure
    const validRootKeys = ['query', 'bool', 'match', 'multi_match', 'term', 'terms', 'range', 'exists', 'script_score'];
    const hasValidStructure = Object.keys(query).some(key => validRootKeys.includes(key));
    
    if (!hasValidStructure) {
      throw new Error('Query does not have valid Elasticsearch structure');
    }

    return true;
  }

  /**
   * Infer what the user is searching for
   */
  inferSearchIntent(query) {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('book') && lowerQuery.includes('where')) {
      return 'a specific book they partially remember';
    }
    if (lowerQuery.includes('author')) {
      return 'works by a specific author';
    }
    if (lowerQuery.includes('about') || lowerQuery.includes('on')) {
      return 'books about a specific topic';
    }
    if (lowerQuery.includes('like') || lowerQuery.includes('similar')) {
      return 'books similar to something they know';
    }
    
    return 'resources related to their keywords';
  }

  /**
   * Assess current results quality
   */
  assessResultsQuality(results, query) {
    if (results.length === 0) {
      return 'No results found - query may be too specific or use uncommon terms';
    }
    if (results.length < 3) {
      return 'Very few results - could benefit from broader search terms';
    }
    if (results.length > 50) {
      return 'Many results - could benefit from more specific targeting';
    }
    
    // Check for relevance based on scores
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    if (avgScore < 10) {
      return 'Low relevance scores - query terms may not match well';
    }
    
    return 'Reasonable results but could be improved';
  }

  /**
   * Suggest potential improvements
   */
  suggestImprovements(query, results) {
    const suggestions = [];
    
    if (query.length > 50) {
      suggestions.push('Query is very long - focus on key terms');
    }
    if (query.split(' ').length < 3) {
      suggestions.push('Query is short - add related terms');
    }
    if (results.length === 0) {
      suggestions.push('Try fuzzy matching and broader field search');
    }
    if (results.some(r => r.score > 50)) {
      suggestions.push('Some high-scoring results suggest good term matching');
    }
    
    return suggestions.length > 0 ? suggestions.join(', ') : 'Standard optimization approaches';
  }

  /**
   * Execute optimized query with fallback
   */
  async executeOptimizedQuery(esClient, indexName, optimizedQuery, fallbackResults) {
    try {
      console.log('Executing AI-optimized query:', JSON.stringify(optimizedQuery, null, 2));
      
      // Ensure the query has the proper Elasticsearch structure
      let queryBody;
      if (optimizedQuery.query) {
        // Already has query wrapper
        queryBody = optimizedQuery;
      } else {
        // Wrap in query object
        queryBody = { query: optimizedQuery };
      }
      
      const searchResponse = await esClient.search({
        index: indexName,
        body: {
          ...queryBody,
          size: 20,
          _source: {
            excludes: ['embedding'] // Don't return large embedding arrays
          }
        }
      });

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

      console.log(`AI-optimized query returned ${results.length} results`);
      
      // If AI query performs significantly worse, fall back to original
      if (results.length === 0 && fallbackResults.length > 0) {
        console.log('AI query returned no results, falling back to original');
        return {
          results: fallbackResults,
          usedFallback: true,
          metadata: {
            aiResults: 0,
            originalResults: fallbackResults.length
          }
        };
      }

      return {
        results: results,
        usedFallback: false,
        metadata: {
          total: searchResponse.hits.total.value || searchResponse.hits.total,
          maxScore: searchResponse.hits.max_score,
          searchType: 'ai-optimized'
        }
      };

    } catch (error) {
      console.error('AI-optimized query failed:', error.message);
      console.log('Falling back to original results');
      
      return {
        results: fallbackResults,
        usedFallback: true,
        error: error.message,
        metadata: {
          aiResults: 0,
          originalResults: fallbackResults.length
        }
      };
    }
  }

  /**
   * Generate explanation of results using AI
   */
  async explainResults(userQuery, finalResults, optimization) {
    try {
      const prompt = `You are explaining search results to a user.

USER QUERY: "${userQuery}"
RESULTS FOUND: ${finalResults.length} items
OPTIMIZATION USED: ${optimization.reasoning}

TOP RESULTS:
${finalResults.slice(0, 3).map(r => `- ${r.title} by ${r.author} (Score: ${r.score.toFixed(2)})`).join('\n')}

Provide a helpful explanation that:
1. Explains why these results match their query
2. Highlights the best matches
3. Suggests how to refine their search if needed
4. Is conversational and user-friendly

Keep it concise (2-3 sentences).`;

      const explanation = await this.geminiService.generateResponse(prompt, null, 0.7);
      return explanation;
    } catch (error) {
      console.warn('Result explanation failed:', error.message);
      return `Found ${finalResults.length} results for "${userQuery}". The search focused on matching your key terms across titles, authors, and subject areas.`;
    }
  }
}

module.exports = AIQueryOptimizer;