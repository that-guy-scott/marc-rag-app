const GeminiService = require('./gemini-service');

class RecommendationEngine {
  constructor() {
    this.geminiService = new GeminiService();
    
    // Subject hierarchy for related topic suggestions
    this.subjectHierarchy = {
      'Computer Science': {
        children: ['Artificial Intelligence', 'Machine Learning', 'Database Systems', 'Software Engineering', 'Human-Computer Interaction'],
        parent: 'Technology'
      },
      'Artificial Intelligence': {
        children: ['Machine Learning', 'Natural Language Processing', 'Computer Vision', 'Robotics'],
        parent: 'Computer Science'
      },
      'Machine Learning': {
        children: ['Deep Learning', 'Neural Networks', 'Data Mining', 'Pattern Recognition'],
        parent: 'Artificial Intelligence'
      },
      'Information Science': {
        children: ['Information Retrieval', 'Knowledge Management', 'Digital Libraries', 'Information Systems'],
        parent: 'Library Science'
      },
      'Library Science': {
        children: ['Information Science', 'Cataloging', 'Collection Development', 'Reference Services'],
        parent: null
      },
      'Database Systems': {
        children: ['Database Design', 'Query Processing', 'Data Warehousing', 'NoSQL'],
        parent: 'Computer Science'
      }
    };

    // Research methodology recommendations
    this.researchMethodologies = {
      'quantitative': {
        description: 'Statistical analysis and numerical data',
        keywords: ['survey', 'experiment', 'statistics', 'measurement'],
        recommendedSources: ['research articles', 'statistical reports', 'empirical studies']
      },
      'qualitative': {
        description: 'In-depth understanding through non-numerical data',
        keywords: ['interview', 'case study', 'ethnography', 'observation'],
        recommendedSources: ['case studies', 'interviews', 'field studies']
      },
      'mixed-methods': {
        description: 'Combination of quantitative and qualitative approaches',
        keywords: ['triangulation', 'convergent', 'sequential'],
        recommendedSources: ['comprehensive studies', 'multi-method research']
      },
      'systematic-review': {
        description: 'Comprehensive review of existing literature',
        keywords: ['meta-analysis', 'systematic', 'literature review'],
        recommendedSources: ['review articles', 'meta-analyses', 'bibliographies']
      }
    };

    // Academic level indicators
    this.academicLevels = {
      'undergraduate': {
        characteristics: ['textbook', 'introduction', 'basics', 'fundamentals'],
        recommendations: ['Start with textbooks', 'Look for introductory materials', 'Use educational resources']
      },
      'graduate': {
        characteristics: ['research', 'advanced', 'theory', 'methodology'],
        recommendations: ['Focus on peer-reviewed articles', 'Examine recent research', 'Consider primary sources']
      },
      'professional': {
        characteristics: ['practice', 'application', 'case study', 'implementation'],
        recommendations: ['Look for practical guides', 'Seek industry reports', 'Find best practices']
      }
    };
  }

  async generateRecommendations(searchResults, originalQuery, userContext = '', searchHistory = []) {
    const startTime = Date.now();
    
    try {
      const recommendations = {
        relatedQueries: await this.generateRelatedQueries(originalQuery, searchResults, userContext),
        topicExpansion: this.generateTopicExpansion(originalQuery, searchResults),
        methodologyGuidance: this.generateMethodologyGuidance(originalQuery, userContext),
        sourceDiversification: this.generateSourceDiversification(searchResults),
        researchStrategy: await this.generateResearchStrategy(originalQuery, searchResults, userContext),
        expertRecommendations: this.generateExpertRecommendations(searchResults),
        interdisciplinaryConnections: this.generateInterdisciplinaryConnections(originalQuery, searchResults),
        nextSteps: await this.generateNextSteps(originalQuery, searchResults, userContext, searchHistory),
        processingTime: Date.now() - startTime
      };
      
      return recommendations;
      
    } catch (error) {
      console.error('Recommendation generation error:', error);
      return this.getFallbackRecommendations(originalQuery, searchResults);
    }
  }

  async generateRelatedQueries(originalQuery, searchResults, userContext) {
    const relatedQueries = new Set();
    
    // Extract key terms from successful results
    if (searchResults.length > 0) {
      const topResults = searchResults.slice(0, 3);
      topResults.forEach(result => {
        // Add variations based on title keywords
        const titleWords = result.title.toLowerCase().split(' ').filter(word => word.length > 3);
        titleWords.forEach(word => {
          if (!originalQuery.toLowerCase().includes(word)) {
            relatedQueries.add(`${originalQuery} ${word}`);
          }
        });
        
        // Add subject-based queries
        result.subjects?.forEach(subject => {
          if (!originalQuery.toLowerCase().includes(subject.toLowerCase())) {
            relatedQueries.add(`${originalQuery} "${subject}"`);
            relatedQueries.add(subject);
          }
        });
      });
    }
    
    // Add hierarchical related queries
    const hierarchicalQueries = this.getHierarchicalQueries(originalQuery);
    hierarchicalQueries.forEach(query => relatedQueries.add(query));
    
    // Add temporal variations
    relatedQueries.add(`recent research ${originalQuery}`);
    relatedQueries.add(`${originalQuery} trends`);
    relatedQueries.add(`${originalQuery} future`);
    
    // Add methodological variations
    relatedQueries.add(`${originalQuery} methodology`);
    relatedQueries.add(`${originalQuery} case study`);
    relatedQueries.add(`${originalQuery} review`);
    
    // AI-generated related queries
    if (await this.geminiService.isServiceAvailable()) {
      try {
        const aiQueries = await this.getAIRelatedQueries(originalQuery, userContext, searchResults);
        aiQueries.forEach(query => relatedQueries.add(query));
      } catch (error) {
        console.warn('AI-generated related queries failed:', error.message);
      }
    }
    
    return Array.from(relatedQueries).slice(0, 10);
  }

  getHierarchicalQueries(originalQuery) {
    const queries = [];
    const queryLower = originalQuery.toLowerCase();
    
    Object.entries(this.subjectHierarchy).forEach(([subject, data]) => {
      if (queryLower.includes(subject.toLowerCase())) {
        // Add parent topic
        if (data.parent) {
          queries.push(data.parent);
        }
        
        // Add child topics
        data.children.forEach(child => {
          queries.push(child);
          queries.push(`${child} ${originalQuery}`);
        });
      }
    });
    
    return queries;
  }

  async getAIRelatedQueries(originalQuery, userContext, searchResults) {
    const resultContext = searchResults.slice(0, 3).map(r => 
      `${r.title} by ${r.author}`
    ).join('; ');
    
    const prompt = `Based on this search query and results, suggest 5 related search queries:

Original Query: "${originalQuery}"
User Context: "${userContext}"
Sample Results: ${resultContext}

Provide related queries that would help expand or refine the research:
1. Broader perspective queries
2. More specific queries  
3. Alternative approaches
4. Current trends
5. Methodological variations

Return as a JSON array: ["query1", "query2", "query3", "query4", "query5"]`;

    try {
      const response = await this.geminiService.generateResponse(prompt, '', 0.7);
      return this.geminiService.parseJSONResponse(response);
    } catch (error) {
      console.warn('AI related queries parsing failed:', error);
      return [];
    }
  }

  generateTopicExpansion(originalQuery, searchResults) {
    const expansion = {
      broaderTopics: [],
      narrowerTopics: [],
      relatedFields: [],
      emergingAreas: []
    };
    
    // Analyze subjects from results to find patterns
    const allSubjects = searchResults.flatMap(r => r.subjects || []);
    const subjectFrequency = {};
    
    allSubjects.forEach(subject => {
      subjectFrequency[subject] = (subjectFrequency[subject] || 0) + 1;
    });
    
    // Most common subjects become related fields
    const commonSubjects = Object.entries(subjectFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([subject]) => subject);
    
    expansion.relatedFields = commonSubjects;
    
    // Use hierarchy to find broader/narrower topics
    Object.entries(this.subjectHierarchy).forEach(([subject, data]) => {
      if (originalQuery.toLowerCase().includes(subject.toLowerCase()) || 
          commonSubjects.some(cs => cs.toLowerCase().includes(subject.toLowerCase()))) {
        
        if (data.parent && !expansion.broaderTopics.includes(data.parent)) {
          expansion.broaderTopics.push(data.parent);
        }
        
        data.children.forEach(child => {
          if (!expansion.narrowerTopics.includes(child)) {
            expansion.narrowerTopics.push(child);
          }
        });
      }
    });
    
    // Identify emerging areas based on recent publications
    const recentResults = searchResults.filter(r => 
      parseInt(r.year) >= new Date().getFullYear() - 3
    );
    
    if (recentResults.length > 0) {
      const recentSubjects = recentResults.flatMap(r => r.subjects || []);
      const uniqueRecentSubjects = [...new Set(recentSubjects)];
      expansion.emergingAreas = uniqueRecentSubjects.slice(0, 3);
    }
    
    return expansion;
  }

  generateMethodologyGuidance(originalQuery, userContext) {
    const guidance = {
      recommendedApproach: 'systematic-review',
      relevantMethodologies: [],
      researchQuestions: [],
      dataCollectionTips: []
    };
    
    // Determine appropriate methodology based on query and context
    Object.entries(this.researchMethodologies).forEach(([method, data]) => {
      const relevanceScore = data.keywords.filter(keyword => 
        originalQuery.toLowerCase().includes(keyword) || 
        userContext.toLowerCase().includes(keyword)
      ).length;
      
      if (relevanceScore > 0) {
        guidance.relevantMethodologies.push({
          method: method,
          description: data.description,
          relevance: relevanceScore,
          recommendedSources: data.recommendedSources
        });
      }
    });
    
    // Sort by relevance
    guidance.relevantMethodologies.sort((a, b) => b.relevance - a.relevance);
    
    if (guidance.relevantMethodologies.length > 0) {
      guidance.recommendedApproach = guidance.relevantMethodologies[0].method;
    }
    
    // Generate research questions
    guidance.researchQuestions = [
      `What are the current trends in ${originalQuery}?`,
      `How has ${originalQuery} evolved over time?`,
      `What are the main challenges in ${originalQuery}?`,
      `What methodologies are used to study ${originalQuery}?`
    ];
    
    // Data collection tips
    guidance.dataCollectionTips = [
      'Start with recent systematic reviews',
      'Check multiple databases for comprehensive coverage',
      'Include both academic and practical sources',
      'Consider grey literature for emerging topics'
    ];
    
    return guidance;
  }

  generateSourceDiversification(searchResults) {
    const diversification = {
      currentTypes: this.analyzeCurrentSourceTypes(searchResults),
      recommendations: [],
      missingTypes: [],
      qualityIndicators: []
    };
    
    const availableTypes = [...new Set(searchResults.map(r => r.format || 'book'))];
    const allPossibleTypes = ['book', 'article', 'thesis', 'conference', 'report', 'website'];
    
    diversification.missingTypes = allPossibleTypes.filter(type => !availableTypes.includes(type));
    
    // Generate recommendations based on missing types
    diversification.missingTypes.forEach(type => {
      switch (type) {
        case 'article':
          diversification.recommendations.push('Search academic databases for peer-reviewed articles');
          break;
        case 'thesis':
          diversification.recommendations.push('Check institutional repositories for theses and dissertations');
          break;
        case 'conference':
          diversification.recommendations.push('Look for conference proceedings for latest research');
          break;
        case 'report':
          diversification.recommendations.push('Find industry or government reports for practical insights');
          break;
        case 'website':
          diversification.recommendations.push('Consider authoritative websites and online resources');
          break;
      }
    });
    
    // Quality indicators
    const hasRecentSources = searchResults.some(r => parseInt(r.year) >= new Date().getFullYear() - 3);
    const hasAuthorityPublishers = searchResults.some(r => this.isAuthorityPublisher(r.publisher));
    const hasISBNs = searchResults.some(r => r.isbn && r.isbn.length > 0);
    
    diversification.qualityIndicators = [
      { indicator: 'Recent sources', present: hasRecentSources },
      { indicator: 'Authority publishers', present: hasAuthorityPublishers },
      { indicator: 'Proper identifiers', present: hasISBNs }
    ];
    
    return diversification;
  }

  analyzeCurrentSourceTypes(searchResults) {
    const types = {};
    searchResults.forEach(result => {
      const type = result.format || 'book';
      types[type] = (types[type] || 0) + 1;
    });
    return types;
  }

  isAuthorityPublisher(publisher) {
    if (!publisher) return false;
    
    const authorities = [
      'oxford', 'cambridge', 'harvard', 'mit', 'stanford', 'princeton',
      'academic press', 'springer', 'elsevier', 'wiley', 'sage', 'ieee', 'acm'
    ];
    
    return authorities.some(authority => publisher.toLowerCase().includes(authority));
  }

  async generateResearchStrategy(originalQuery, searchResults, userContext) {
    const strategy = {
      phase1: 'Exploratory research',
      phase2: 'Focused investigation',
      phase3: 'Synthesis and analysis',
      timeline: this.estimateTimeline(originalQuery, userContext),
      resources: this.recommendResources(searchResults),
      skills: this.identifyRequiredSkills(originalQuery, userContext),
      challenges: this.identifyPotentialChallenges(originalQuery, searchResults)
    };
    
    // Determine research phases based on current results
    if (searchResults.length === 0) {
      strategy.phase1 = 'Broaden search terms and explore related topics';
    } else if (searchResults.length < 5) {
      strategy.phase1 = 'Expand search with alternative terms and sources';
    } else {
      strategy.phase1 = 'Review and synthesize current findings';
    }
    
    // AI-enhanced strategy if available
    if (await this.geminiService.isServiceAvailable()) {
      try {
        const aiStrategy = await this.getAIResearchStrategy(originalQuery, searchResults, userContext);
        strategy.aiRecommendations = aiStrategy;
      } catch (error) {
        console.warn('AI research strategy failed:', error.message);
      }
    }
    
    return strategy;
  }

  estimateTimeline(originalQuery, userContext) {
    // Basic timeline estimation based on complexity
    const queryComplexity = originalQuery.split(' ').length;
    const isResearchProject = userContext.toLowerCase().includes('research') || 
                             userContext.toLowerCase().includes('thesis') ||
                             userContext.toLowerCase().includes('dissertation');
    
    if (isResearchProject) {
      return {
        total: '6-12 weeks',
        phases: {
          'Literature review': '2-3 weeks',
          'Source analysis': '2-3 weeks', 
          'Synthesis': '1-2 weeks',
          'Writing': '1-4 weeks'
        }
      };
    } else {
      return {
        total: '1-3 weeks',
        phases: {
          'Initial search': '1-2 days',
          'Source review': '3-5 days',
          'Final selection': '1-2 days'
        }
      };
    }
  }

  recommendResources(searchResults) {
    const resources = [];
    
    // Based on current results
    if (searchResults.length > 0) {
      resources.push('Start with highest-rated results from current search');
      
      const hasRecent = searchResults.some(r => parseInt(r.year) >= new Date().getFullYear() - 3);
      if (!hasRecent) {
        resources.push('Seek more recent sources for current perspectives');
      }
    }
    
    // Standard resource recommendations
    resources.push('Check multiple academic databases');
    resources.push('Include grey literature (reports, working papers)');
    resources.push('Consult subject-specific encyclopedias');
    resources.push('Review bibliographies of key sources');
    
    return resources;
  }

  identifyRequiredSkills(originalQuery, userContext) {
    const skills = ['Information literacy', 'Source evaluation'];
    
    if (userContext.includes('research') || userContext.includes('academic')) {
      skills.push('Academic writing', 'Citation management');
    }
    
    if (originalQuery.includes('data') || originalQuery.includes('statistics')) {
      skills.push('Data analysis', 'Statistical interpretation');
    }
    
    if (originalQuery.includes('technology') || originalQuery.includes('digital')) {
      skills.push('Digital literacy', 'Technology evaluation');
    }
    
    return skills;
  }

  identifyPotentialChallenges(originalQuery, searchResults) {
    const challenges = [];
    
    if (searchResults.length === 0) {
      challenges.push('Limited available sources - may need to broaden scope');
    } else if (searchResults.length > 50) {
      challenges.push('Information overload - need better filtering strategies');
    }
    
    const oldSources = searchResults.filter(r => parseInt(r.year) < new Date().getFullYear() - 10);
    if (oldSources.length > searchResults.length * 0.7) {
      challenges.push('Many older sources - current information may be limited');
    }
    
    const queryWords = originalQuery.split(' ');
    if (queryWords.length === 1) {
      challenges.push('Very broad topic - may need more specific focus');
    } else if (queryWords.length > 6) {
      challenges.push('Very specific query - may need to simplify');
    }
    
    return challenges;
  }

  async getAIResearchStrategy(originalQuery, searchResults, userContext) {
    const resultSummary = searchResults.slice(0, 5).map(r => 
      `${r.title} (${r.year})`
    ).join('; ');
    
    const prompt = `Develop a research strategy for this topic:

Topic: "${originalQuery}"
Context: "${userContext}"
Current Results: ${resultSummary}

Provide a structured research strategy in JSON format:
{
  "overallApproach": "recommended research methodology",
  "keyQuestions": ["main research questions to investigate"],
  "searchStrategy": ["specific search recommendations"],
  "sourceTypes": ["recommended types of sources to find"],
  "timelinePhases": ["phase 1", "phase 2", "phase 3"],
  "qualityChecks": ["how to evaluate source quality"],
  "synthesisApproach": "how to combine and analyze findings"
}`;

    try {
      const response = await this.geminiService.generateResponse(prompt, '', 0.5);
      return this.geminiService.parseJSONResponse(response);
    } catch (error) {
      console.warn('AI research strategy parsing failed:', error);
      return null;
    }
  }

  generateExpertRecommendations(searchResults) {
    const experts = {
      identifiedAuthors: [],
      suggestedExperts: [],
      institutions: [],
      researchGroups: []
    };
    
    // Extract frequent authors
    const authorFrequency = {};
    searchResults.forEach(result => {
      if (result.author) {
        authorFrequency[result.author] = (authorFrequency[result.author] || 0) + 1;
      }
    });
    
    experts.identifiedAuthors = Object.entries(authorFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([author, count]) => ({ author, publications: count }));
    
    // Extract institutions from publishers
    const institutionPublishers = searchResults
      .map(r => r.publisher)
      .filter(p => p && (p.includes('University') || p.includes('Institute')))
      .slice(0, 5);
    
    experts.institutions = [...new Set(institutionPublishers)];
    
    return experts;
  }

  generateInterdisciplinaryConnections(originalQuery, searchResults) {
    const connections = {
      relatedDisciplines: [],
      crossoverTopics: [],
      methodologicalConnections: [],
      applicationAreas: []
    };
    
    // Analyze subjects to find interdisciplinary patterns
    const allSubjects = searchResults.flatMap(r => r.subjects || []);
    const disciplineKeywords = {
      'Psychology': ['psychology', 'cognitive', 'behavior', 'mental'],
      'Sociology': ['social', 'society', 'community', 'cultural'],
      'Economics': ['economic', 'finance', 'market', 'business'],
      'Engineering': ['engineering', 'technical', 'system', 'design'],
      'Education': ['education', 'teaching', 'learning', 'pedagogy'],
      'Medicine': ['medical', 'health', 'clinical', 'patient'],
      'Law': ['legal', 'law', 'policy', 'regulation']
    };
    
    Object.entries(disciplineKeywords).forEach(([discipline, keywords]) => {
      const relevance = keywords.filter(keyword => 
        allSubjects.some(subject => subject.toLowerCase().includes(keyword)) ||
        originalQuery.toLowerCase().includes(keyword)
      ).length;
      
      if (relevance > 0) {
        connections.relatedDisciplines.push({ discipline, relevance });
      }
    });
    
    // Sort by relevance
    connections.relatedDisciplines.sort((a, b) => b.relevance - a.relevance);
    connections.relatedDisciplines = connections.relatedDisciplines.slice(0, 5);
    
    return connections;
  }

  async generateNextSteps(originalQuery, searchResults, userContext, searchHistory) {
    const nextSteps = {
      immediate: [],
      shortTerm: [],
      longTerm: [],
      prioritized: []
    };
    
    // Immediate next steps based on current results
    if (searchResults.length === 0) {
      nextSteps.immediate.push('Broaden search terms');
      nextSteps.immediate.push('Try alternative keywords');
      nextSteps.immediate.push('Check spelling and terminology');
    } else if (searchResults.length < 3) {
      nextSteps.immediate.push('Expand search with related terms');
      nextSteps.immediate.push('Search additional databases');
    } else {
      nextSteps.immediate.push('Review top 3-5 most relevant results');
      nextSteps.immediate.push('Check bibliographies for additional sources');
    }
    
    // Short-term steps
    nextSteps.shortTerm.push('Develop a systematic search strategy');
    nextSteps.shortTerm.push('Create a source evaluation framework');
    nextSteps.shortTerm.push('Set up citation management system');
    
    // Long-term steps
    nextSteps.longTerm.push('Synthesize findings across sources');
    nextSteps.longTerm.push('Identify research gaps');
    nextSteps.longTerm.push('Consider primary research opportunities');
    
    // Prioritize based on user context
    if (userContext.includes('urgent') || userContext.includes('deadline')) {
      nextSteps.prioritized = [...nextSteps.immediate, ...nextSteps.shortTerm.slice(0, 2)];
    } else {
      nextSteps.prioritized = [
        ...nextSteps.immediate.slice(0, 2),
        ...nextSteps.shortTerm.slice(0, 3),
        ...nextSteps.longTerm.slice(0, 1)
      ];
    }
    
    return nextSteps;
  }

  getFallbackRecommendations(originalQuery, searchResults) {
    return {
      relatedQueries: [
        `${originalQuery} review`,
        `recent ${originalQuery}`,
        `${originalQuery} methodology`
      ],
      topicExpansion: {
        broaderTopics: ['Related research area'],
        narrowerTopics: ['Specific aspect of topic'],
        relatedFields: ['Connected disciplines']
      },
      methodologyGuidance: {
        recommendedApproach: 'systematic-review',
        relevantMethodologies: [
          {
            method: 'literature-review',
            description: 'Comprehensive review of existing sources',
            recommendedSources: ['academic articles', 'books', 'reports']
          }
        ]
      },
      sourceDiversification: {
        recommendations: [
          'Seek multiple source types',
          'Include recent publications',
          'Check authoritative publishers'
        ]
      },
      nextSteps: {
        immediate: ['Review available results', 'Expand search terms'],
        shortTerm: ['Develop search strategy', 'Evaluate sources'],
        longTerm: ['Synthesize findings']
      }
    };
  }
}

module.exports = RecommendationEngine;