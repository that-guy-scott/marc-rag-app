class SchemaExtractor {
  constructor(esClient) {
    this.esClient = esClient;
    this.cachedSchema = null;
    this.cacheExpiry = null;
    this.cacheValidityMs = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get simplified schema for AI query optimization
   */
  async getIndexSchema(indexName = 'marc-records') {
    // Return cached schema if still valid
    if (this.cachedSchema && this.cacheExpiry && Date.now() < this.cacheExpiry) {
      return this.cachedSchema;
    }

    try {
      // Try to get actual mapping from Elasticsearch
      const mapping = await this.esClient.indices.getMapping({ index: indexName });
      const schema = this.extractSearchableFields(mapping);
      
      // Cache the result
      this.cachedSchema = schema;
      this.cacheExpiry = Date.now() + this.cacheValidityMs;
      
      return schema;
    } catch (error) {
      console.warn('Could not retrieve ES mapping, using fallback schema:', error.message);
      return this.getFallbackSchema();
    }
  }

  /**
   * Extract searchable fields from Elasticsearch mapping
   */
  extractSearchableFields(mapping) {
    try {
      const indexName = Object.keys(mapping)[0];
      const properties = mapping[indexName].mappings.properties || {};
      
      const schema = {
        indexName: indexName,
        searchableFields: {},
        boostableFields: [],
        filterableFields: [],
        description: 'MARC bibliographic records with embedded metadata'
      };

      // Process each field in the mapping
      Object.entries(properties).forEach(([fieldName, fieldConfig]) => {
        const fieldInfo = this.analyzeField(fieldName, fieldConfig);
        if (fieldInfo.searchable) {
          schema.searchableFields[fieldName] = fieldInfo;
          
          if (fieldInfo.boostable) {
            schema.boostableFields.push(fieldName);
          }
          if (fieldInfo.filterable) {
            schema.filterableFields.push(fieldName);
          }
        }
      });

      return schema;
    } catch (error) {
      console.warn('Error extracting schema from mapping:', error.message);
      return this.getFallbackSchema();
    }
  }

  /**
   * Analyze individual field configuration
   */
  analyzeField(fieldName, fieldConfig) {
    const fieldInfo = {
      name: fieldName,
      type: fieldConfig.type || 'text',
      searchable: false,
      boostable: false,
      filterable: false,
      description: this.getFieldDescription(fieldName)
    };

    // Determine if field is searchable
    if (fieldConfig.type === 'text' || !fieldConfig.type) {
      fieldInfo.searchable = true;
      fieldInfo.boostable = true;
    } else if (fieldConfig.type === 'keyword') {
      fieldInfo.searchable = true;
      fieldInfo.filterable = true;
    } else if (['integer', 'long', 'date'].includes(fieldConfig.type)) {
      fieldInfo.filterable = true;
    }

    // Special handling for specific fields
    if (['title', 'author', 'subjects', 'description'].includes(fieldName)) {
      fieldInfo.searchable = true;
      fieldInfo.boostable = true;
    }

    return fieldInfo;
  }

  /**
   * Get human-readable field descriptions
   */
  getFieldDescription(fieldName) {
    const descriptions = {
      'title': 'Main title of the work',
      'subtitle': 'Subtitle or secondary title',
      'author': 'Primary author or creator',
      'publisher': 'Publishing organization',
      'publicationYear': 'Year of publication',
      'isbn': 'International Standard Book Number',
      'subjects': 'Library of Congress subject headings',
      'description': 'Abstract or summary of content',
      'controlNumber': 'MARC control number',
      'callNumber': 'Library classification number',
      'format': 'Physical format (book, DVD, etc.)',
      'language': 'Language of the work',
      'pages': 'Number of pages',
      'searchableText': 'Combined searchable content',
      'embedding': 'Vector embedding for semantic search'
    };

    return descriptions[fieldName] || `Field containing ${fieldName} information`;
  }

  /**
   * Fallback schema when ES mapping is unavailable
   */
  getFallbackSchema() {
    return {
      indexName: 'marc-records',
      description: 'MARC bibliographic records with embedded metadata',
      searchableFields: {
        title: {
          name: 'title',
          type: 'text',
          searchable: true,
          boostable: true,
          filterable: false,
          description: 'Main title of the work - highest relevance for title searches'
        },
        author: {
          name: 'author',
          type: 'text', 
          searchable: true,
          boostable: true,
          filterable: false,
          description: 'Primary author or creator - use for author searches'
        },
        subjects: {
          name: 'subjects',
          type: 'text',
          searchable: true,
          boostable: true,
          filterable: true,
          description: 'Library subject headings - excellent for topic searches'
        },
        description: {
          name: 'description',
          type: 'text',
          searchable: true,
          boostable: true,
          filterable: false,
          description: 'Content summary - good for detailed concept matching'
        },
        publisher: {
          name: 'publisher',
          type: 'text',
          searchable: true,
          boostable: false,
          filterable: true,
          description: 'Publishing organization'
        },
        publicationYear: {
          name: 'publicationYear',
          type: 'integer',
          searchable: false,
          boostable: false,
          filterable: true,
          description: 'Publication year - use for date range filters'
        },
        searchableText: {
          name: 'searchableText',
          type: 'text',
          searchable: true,
          boostable: true,
          filterable: false,
          description: 'Combined searchable content from all fields'
        }
      },
      boostableFields: ['title', 'author', 'subjects', 'description', 'searchableText'],
      filterableFields: ['subjects', 'publisher', 'publicationYear'],
      recommendedQueryStrategies: [
        'Use title^3 for title-focused searches',
        'Use subjects^2 for topic searches', 
        'Use multi_match across title, author, subjects for general searches',
        'Use fuzzy matching for partial or misspelled terms',
        'Combine with semantic search using embedding field'
      ]
    };
  }

  /**
   * Get query strategy recommendations based on user query
   */
  getQueryRecommendations(userQuery, schema) {
    const recommendations = [];
    const lowerQuery = userQuery.toLowerCase();

    if (lowerQuery.includes('book') && lowerQuery.includes('title')) {
      recommendations.push('High boost on title field (^3)');
    }
    if (lowerQuery.includes('author') || lowerQuery.includes('by')) {
      recommendations.push('Focus search on author field');
    }
    if (lowerQuery.includes('about') || lowerQuery.includes('topic')) {
      recommendations.push('High boost on subjects field (^2)');
    }
    if (userQuery.length > 30) {
      recommendations.push('Use description field for detailed matching');
    }
    if (lowerQuery.includes('like') || lowerQuery.includes('similar')) {
      recommendations.push('Consider semantic search with embeddings');
    }

    return recommendations;
  }
}

module.exports = SchemaExtractor;