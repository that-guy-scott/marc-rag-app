const GeminiService = require('./gemini-service');

class QueryEnhancer {
  constructor() {
    this.geminiService = new GeminiService();
    
    // Common library science abbreviations and expansions
    this.abbreviations = {
      'AI': 'artificial intelligence',
      'ML': 'machine learning',
      'NLP': 'natural language processing',
      'DL': 'deep learning',
      'IR': 'information retrieval',
      'IS': 'information science',
      'LIS': 'library and information science',
      'MLIS': 'master of library and information science',
      'OPAC': 'online public access catalog',
      'ILL': 'interlibrary loan',
      'DOI': 'digital object identifier',
      'ISBN': 'international standard book number',
      'ISSN': 'international standard serial number',
      'LC': 'library of congress',
      'LCSH': 'library of congress subject headings',
      'DDC': 'dewey decimal classification',
      'MARC': 'machine readable cataloging',
      'RDA': 'resource description and access',
      'FRBR': 'functional requirements for bibliographic records',
      'OAI': 'open archives initiative',
      'PMH': 'protocol for metadata harvesting',
      'XML': 'extensible markup language',
      'API': 'application programming interface',
      'URI': 'uniform resource identifier',
      'URL': 'uniform resource locator',
      'HTTP': 'hypertext transfer protocol',
      'HTTPS': 'hypertext transfer protocol secure',
      'FTP': 'file transfer protocol',
      'TCP': 'transmission control protocol',
      'IP': 'internet protocol',
      'DNS': 'domain name system',
      'SQL': 'structured query language',
      'NoSQL': 'not only structured query language',
      'JSON': 'javascript object notation',
      'CSV': 'comma separated values',
      'PDF': 'portable document format',
      'DOC': 'document',
      'HTML': 'hypertext markup language',
      'CSS': 'cascading style sheets',
      'JS': 'javascript'
    };

    // Subject heading mappings for common topics
    this.subjectMappings = {
      'programming': ['Computer programming', 'Software engineering', 'Programming languages'],
      'databases': ['Database management', 'Database design', 'Information storage and retrieval'],
      'web development': ['Web site development', 'Web programming', 'Internet programming'],
      'libraries': ['Library science', 'Libraries', 'Library administration'],
      'research': ['Research', 'Research methodology', 'Academic research'],
      'education': ['Education', 'Teaching', 'Learning'],
      'technology': ['Technology', 'Information technology', 'Computer science'],
      'digital': ['Digital libraries', 'Digital preservation', 'Digital humanities'],
      'social media': ['Social media', 'Online social networks', 'Social networking'],
      'privacy': ['Privacy', 'Data protection', 'Information privacy'],
      'security': ['Computer security', 'Information security', 'Cybersecurity'],
      'ethics': ['Ethics', 'Computer ethics', 'Information ethics'],
      'management': ['Management', 'Information management', 'Knowledge management']
    };

    // Natural language query patterns to specific search terms
    this.conceptualMappings = [
      {
        patterns: [
          /book.*where.*kids.*want.*become.*wizards?/i,
          /story.*children.*becoming.*wizards?/i,
          /young.*people.*learning.*magic/i,
          /kids.*wizards?.*school/i
        ],
        searchTerms: ['Harry Potter', 'wizard', 'magic', 'school', 'children', 'young adult'],
        description: 'Harry Potter series and similar wizard school stories'
      },
      {
        patterns: [
          /dystopian.*future.*teens?/i,
          /post.*apocalyptic.*young.*adult/i,
          /survival.*games.*teenagers/i
        ],
        searchTerms: ['dystopian', 'young adult', 'survival', 'future', 'teenagers'],
        description: 'Dystopian young adult fiction'
      },
      {
        patterns: [
          /vampire.*romance/i,
          /supernatural.*love.*story/i
        ],
        searchTerms: ['vampire', 'supernatural', 'romance', 'fantasy'],
        description: 'Supernatural romance novels'
      },
      {
        patterns: [
          /detective.*mystery.*solving/i,
          /crime.*investigation/i,
          /murder.*mystery/i
        ],
        searchTerms: ['detective', 'mystery', 'crime', 'investigation', 'police'],
        description: 'Detective and mystery fiction'
      }
    ];

    // Common misspellings and corrections
    this.spellCorrections = {
      'algorythm': 'algorithm',
      'machien': 'machine',
      'learnign': 'learning',
      'databse': 'database',
      'progaming': 'programming',
      'libary': 'library',
      'reserach': 'research',
      'tecnology': 'technology',
      'compter': 'computer',
      'infromation': 'information'
    };
  }

  async enhanceQuery(originalQuery, context = '', userPreferences = {}) {
    const startTime = Date.now();
    
    try {
      // Step 1: Basic preprocessing
      let processedQuery = this.preprocessQuery(originalQuery);
      
      // Step 2: Check for conceptual mappings (most important for user queries)
      const conceptualMatch = this.findConceptualMatch(originalQuery);
      if (conceptualMatch) {
        processedQuery = conceptualMatch.searchTerms.join(' ');
      }
      
      // Step 3: Spell correction
      processedQuery = this.correctSpelling(processedQuery);
      
      // Step 4: Expand abbreviations (only if no conceptual match)
      const expandedQuery = conceptualMatch ? processedQuery : this.expandAbbreviations(processedQuery);
      
      // Step 5: Generate related terms
      const relatedTerms = this.generateRelatedTerms(processedQuery);
      
      // Step 6: Map to subject headings
      const subjectHeadings = this.mapToSubjectHeadings(processedQuery);
      
      // Step 7: AI-powered enhancement (if available and no conceptual match)
      let aiEnhancement = null;
      if (!conceptualMatch && await this.geminiService.isServiceAvailable()) {
        try {
          aiEnhancement = await this.getAIEnhancement(processedQuery, context, userPreferences);
        } catch (error) {
          console.warn('AI enhancement failed:', error.message);
        }
      }
      
      // Step 8: Build final enhancement result
      const enhancement = {
        originalQuery: originalQuery,
        processedQuery: processedQuery,
        expandedQuery: expandedQuery,
        correctedSpelling: processedQuery !== this.preprocessQuery(originalQuery),
        expandedAbbreviations: expandedQuery !== processedQuery,
        conceptualMatch: conceptualMatch,
        relatedTerms: relatedTerms,
        subjectHeadings: subjectHeadings,
        searchVariations: this.generateSearchVariations(processedQuery, relatedTerms),
        searchStrategy: this.generateSearchStrategy(processedQuery, userPreferences),
        aiEnhancement: aiEnhancement,
        processingTime: Date.now() - startTime
      };
      
      return enhancement;
      
    } catch (error) {
      console.error('Query enhancement error:', error);
      return this.getFallbackEnhancement(originalQuery);
    }
  }

  preprocessQuery(query) {
    return query
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ') // Remove special chars except hyphens
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  correctSpelling(query) {
    let corrected = query;
    Object.entries(this.spellCorrections).forEach(([wrong, right]) => {
      const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
      corrected = corrected.replace(regex, right);
    });
    return corrected;
  }

  expandAbbreviations(query) {
    let expanded = query;
    const words = query.split(' ');
    
    words.forEach(word => {
      const upperWord = word.toUpperCase();
      if (this.abbreviations[upperWord]) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        expanded = expanded.replace(regex, `${word} ${this.abbreviations[upperWord]}`);
      }
    });
    
    return expanded;
  }

  generateRelatedTerms(query) {
    const terms = new Set();
    const words = query.split(' ');
    
    // Add synonyms and related terms
    words.forEach(word => {
      switch (word.toLowerCase()) {
        case 'computer':
          terms.add('computing');
          terms.add('technology');
          break;
        case 'data':
          terms.add('information');
          terms.add('dataset');
          break;
        case 'analysis':
          terms.add('analytics');
          terms.add('evaluation');
          break;
        case 'system':
          terms.add('systems');
          terms.add('framework');
          break;
        case 'method':
          terms.add('methodology');
          terms.add('approach');
          break;
        case 'study':
          terms.add('research');
          terms.add('investigation');
          break;
        case 'digital':
          terms.add('electronic');
          terms.add('online');
          break;
        case 'information':
          terms.add('data');
          terms.add('knowledge');
          break;
        case 'management':
          terms.add('administration');
          terms.add('governance');
          break;
        case 'design':
          terms.add('development');
          terms.add('architecture');
          break;
      }
    });
    
    return Array.from(terms);
  }

  mapToSubjectHeadings(query) {
    const headings = new Set();
    
    Object.entries(this.subjectMappings).forEach(([key, subjects]) => {
      if (query.includes(key)) {
        subjects.forEach(subject => headings.add(subject));
      }
    });
    
    return Array.from(headings);
  }

  generateSearchVariations(query, relatedTerms) {
    const variations = [query];
    
    // Add quoted phrases for exact matches
    if (query.includes(' ')) {
      variations.push(`"${query}"`);
    }
    
    // Add variations with related terms
    relatedTerms.slice(0, 3).forEach(term => {
      variations.push(`${query} ${term}`);
    });
    
    // Add boolean variations
    const words = query.split(' ');
    if (words.length > 1) {
      variations.push(words.join(' AND '));
      variations.push(words.join(' OR '));
    }
    
    // Add wildcard variations
    words.forEach(word => {
      if (word.length > 4) {
        variations.push(query.replace(word, `${word}*`));
      }
    });
    
    return [...new Set(variations)]; // Remove duplicates
  }

  generateSearchStrategy(query, preferences = {}) {
    const strategies = [];
    
    // Basic strategy
    strategies.push('Start with broad terms, then narrow down');
    
    // Based on query characteristics
    if (query.split(' ').length === 1) {
      strategies.push('Consider adding related terms or context');
    } else {
      strategies.push('Try individual keywords if no results found');
    }
    
    // Based on preferences
    if (preferences.academicLevel === 'graduate') {
      strategies.push('Focus on peer-reviewed sources and recent publications');
    } else if (preferences.academicLevel === 'undergraduate') {
      strategies.push('Include textbooks and introductory materials');
    }
    
    if (preferences.timeframe === 'recent') {
      strategies.push('Limit search to last 5 years for current information');
    }
    
    return strategies;
  }

  async getAIEnhancement(query, context, preferences) {
    const prompt = `As a research librarian, enhance this search query for a library catalog:

Query: "${query}"
Context: "${context}"
User Preferences: ${JSON.stringify(preferences)}

Provide enhancements in JSON format:
{
  "enhancedKeywords": ["additional relevant keywords"],
  "conceptualTerms": ["broader conceptual terms"],
  "specificTerms": ["more specific variants"],
  "disciplinaryConnections": ["related academic disciplines"],
  "searchTips": ["specific search strategy recommendations"],
  "potentialChallenges": ["possible search difficulties to anticipate"]
}`;

    try {
      const response = await this.geminiService.generateResponse(prompt, '', 0.5);
      return JSON.parse(response);
    } catch (error) {
      console.warn('AI enhancement parsing failed:', error);
      return null;
    }
  }

  getFallbackEnhancement(originalQuery) {
    return {
      originalQuery: originalQuery,
      processedQuery: this.preprocessQuery(originalQuery),
      expandedQuery: this.expandAbbreviations(this.preprocessQuery(originalQuery)),
      correctedSpelling: false,
      expandedAbbreviations: false,
      relatedTerms: this.generateRelatedTerms(originalQuery),
      subjectHeadings: this.mapToSubjectHeadings(originalQuery),
      searchVariations: [originalQuery],
      searchStrategy: ['Use basic keyword search', 'Try related terms if needed'],
      aiEnhancement: null,
      processingTime: 0
    };
  }

  // Utility method to get query suggestions based on partial input
  getQuerySuggestions(partialQuery, limit = 5) {
    const suggestions = [];
    const partial = partialQuery.toLowerCase();
    
    // Check abbreviations
    Object.entries(this.abbreviations).forEach(([abbr, full]) => {
      if (abbr.toLowerCase().startsWith(partial) || full.includes(partial)) {
        suggestions.push(full);
      }
    });
    
    // Check subject mappings
    Object.keys(this.subjectMappings).forEach(topic => {
      if (topic.includes(partial)) {
        suggestions.push(topic);
      }
    });
    
    // Common search topics
    const commonTopics = [
      'artificial intelligence',
      'machine learning',
      'data science',
      'digital libraries',
      'information systems',
      'computer science',
      'library science',
      'research methods',
      'database design',
      'web development'
    ];
    
    commonTopics.forEach(topic => {
      if (topic.includes(partial)) {
        suggestions.push(topic);
      }
    });
    
    return [...new Set(suggestions)].slice(0, limit);
  }

  // Find conceptual matches for natural language queries
  findConceptualMatch(query) {
    for (const mapping of this.conceptualMappings) {
      for (const pattern of mapping.patterns) {
        if (pattern.test(query)) {
          console.log(`Conceptual match found: ${mapping.description}`);
          return mapping;
        }
      }
    }
    return null;
  }

  // Method to analyze query complexity and provide difficulty assessment
  analyzeQueryComplexity(query) {
    const words = query.split(' ');
    const complexity = {
      wordCount: words.length,
      hasSpecialTerms: words.some(word => this.abbreviations[word.toUpperCase()]),
      hasMultipleConcepts: words.length > 3,
      difficulty: 'medium',
      recommendations: []
    };
    
    if (words.length === 1) {
      complexity.difficulty = 'simple';
      complexity.recommendations.push('Consider adding more specific terms');
    } else if (words.length > 5) {
      complexity.difficulty = 'complex';
      complexity.recommendations.push('Try breaking into multiple simpler searches');
    }
    
    if (complexity.hasSpecialTerms) {
      complexity.recommendations.push('Specialized terminology detected - good for precise searches');
    }
    
    return complexity;
  }
}

module.exports = QueryEnhancer;