const GeminiService = require('./gemini-service');

class ResultAugmenter {
  constructor() {
    this.geminiService = new GeminiService();
    
    // Reading level indicators
    this.readingLevelKeywords = {
      beginner: ['introduction', 'basics', 'fundamentals', 'overview', 'primer', 'guide'],
      intermediate: ['principles', 'methods', 'analysis', 'concepts', 'theory'],
      advanced: ['advanced', 'research', 'analysis', 'theoretical', 'methodology', 'dissertation']
    };
    
    // Format-specific insights
    this.formatInsights = {
      book: {
        strengths: ['Comprehensive coverage', 'Structured learning', 'Authoritative content'],
        considerations: ['May not have latest developments', 'Broad rather than specific focus']
      },
      article: {
        strengths: ['Current research', 'Specific findings', 'Peer-reviewed'],
        considerations: ['Narrow focus', 'Requires background knowledge']
      },
      thesis: {
        strengths: ['Original research', 'Detailed methodology', 'Comprehensive bibliography'],
        considerations: ['Single perspective', 'May be very specialized']
      },
      conference: {
        strengths: ['Latest developments', 'Emerging trends', 'Community discussions'],
        considerations: ['Preliminary findings', 'Limited peer review']
      }
    };
    
    // Subject area expertise indicators
    this.expertiseIndicators = {
      'computer science': ['ACM', 'IEEE', 'algorithm', 'programming', 'software'],
      'library science': ['ALA', 'IFLA', 'cataloging', 'MARC', 'information literacy'],
      'information science': ['ASIS&T', 'information retrieval', 'knowledge management'],
      'education': ['pedagogy', 'curriculum', 'learning outcomes', 'assessment'],
      'social science': ['survey', 'qualitative', 'quantitative', 'methodology']
    };
  }

  async augmentResults(searchResults, originalQuery, userContext = '') {
    if (!searchResults || searchResults.length === 0) {
      return searchResults;
    }

    const startTime = Date.now();
    
    try {
      const augmentedResults = await Promise.all(
        searchResults.map(result => this.augmentSingleResult(result, originalQuery, userContext))
      );
      
      // Add collection-level insights
      const collectionInsights = await this.generateCollectionInsights(augmentedResults, originalQuery);
      
      return {
        results: augmentedResults,
        collectionInsights: collectionInsights,
        processingTime: Date.now() - startTime
      };
      
    } catch (error) {
      console.error('Result augmentation error:', error);
      return {
        results: searchResults.map(result => ({
          ...result,
          augmentation: { error: 'Augmentation failed', basicInsights: this.getBasicInsights(result) }
        })),
        collectionInsights: null,
        processingTime: Date.now() - startTime
      };
    }
  }

  async augmentSingleResult(result, originalQuery, userContext) {
    try {
      const augmentation = {
        readingLevel: this.assessReadingLevel(result),
        relevanceAnalysis: this.analyzeRelevance(result, originalQuery),
        contentAnalysis: this.analyzeContent(result),
        formatInsights: this.getFormatInsights(result),
        subjectExpertise: this.assessSubjectExpertise(result),
        qualityIndicators: this.assessQuality(result),
        usageRecommendations: this.generateUsageRecommendations(result, userContext),
        aiInsights: null
      };

      // Add AI-powered insights if available
      if (await this.geminiService.isServiceAvailable()) {
        try {
          augmentation.aiInsights = await this.generateAIInsights(result, originalQuery, userContext);
        } catch (error) {
          console.warn('AI insights generation failed for result:', result.id, error.message);
        }
      }

      return {
        ...result,
        augmentation: augmentation
      };
      
    } catch (error) {
      console.error('Single result augmentation error:', error);
      return {
        ...result,
        augmentation: { error: error.message, basicInsights: this.getBasicInsights(result) }
      };
    }
  }

  assessReadingLevel(result) {
    const text = `${result.title} ${result.description || ''}`.toLowerCase();
    const scores = { beginner: 0, intermediate: 0, advanced: 0 };
    
    Object.entries(this.readingLevelKeywords).forEach(([level, keywords]) => {
      keywords.forEach(keyword => {
        if (text.includes(keyword)) {
          scores[level]++;
        }
      });
    });
    
    // Determine primary level
    const maxScore = Math.max(...Object.values(scores));
    const primaryLevel = Object.keys(scores).find(level => scores[level] === maxScore) || 'intermediate';
    
    return {
      primary: primaryLevel,
      scores: scores,
      confidence: maxScore > 0 ? Math.min(maxScore / 3, 1) : 0.5,
      indicators: this.getReadingLevelIndicators(result, primaryLevel)
    };
  }

  getReadingLevelIndicators(result, level) {
    const indicators = [];
    
    if (level === 'beginner') {
      indicators.push('Suitable for newcomers to the field');
      indicators.push('Provides foundational knowledge');
    } else if (level === 'intermediate') {
      indicators.push('Requires some background knowledge');
      indicators.push('Builds on fundamental concepts');
    } else {
      indicators.push('Requires significant expertise');
      indicators.push('Assumes deep familiarity with the field');
    }
    
    return indicators;
  }

  analyzeRelevance(result, originalQuery) {
    const queryTerms = originalQuery.toLowerCase().split(' ');
    const titleRelevance = this.calculateTermRelevance(result.title, queryTerms);
    const descriptionRelevance = this.calculateTermRelevance(result.description || '', queryTerms);
    const subjectRelevance = this.calculateTermRelevance(result.subjects?.join(' ') || '', queryTerms);
    
    const overallRelevance = (titleRelevance * 0.4 + descriptionRelevance * 0.3 + subjectRelevance * 0.3);
    
    return {
      overall: overallRelevance,
      title: titleRelevance,
      description: descriptionRelevance,
      subjects: subjectRelevance,
      matchedTerms: this.getMatchedTerms(result, queryTerms),
      relevanceClass: this.getRelevanceClass(overallRelevance)
    };
  }

  calculateTermRelevance(text, queryTerms) {
    if (!text) return 0;
    
    const textLower = text.toLowerCase();
    const matches = queryTerms.filter(term => textLower.includes(term));
    return matches.length / queryTerms.length;
  }

  getMatchedTerms(result, queryTerms) {
    const allText = `${result.title} ${result.description || ''} ${result.subjects?.join(' ') || ''}`.toLowerCase();
    return queryTerms.filter(term => allText.includes(term));
  }

  getRelevanceClass(relevance) {
    if (relevance >= 0.7) return 'highly-relevant';
    if (relevance >= 0.4) return 'moderately-relevant';
    return 'tangentially-relevant';
  }

  analyzeContent(result) {
    const analysis = {
      hasAbstract: !!(result.description && result.description.length > 100),
      contentLength: result.description ? result.description.length : 0,
      keywordDensity: this.calculateKeywordDensity(result),
      topicCoverage: this.analyzeTopicCoverage(result),
      recency: this.assessRecency(result.year)
    };
    
    return analysis;
  }

  calculateKeywordDensity(result) {
    const text = result.description || '';
    if (text.length === 0) return {};
    
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const frequency = {};
    
    words.forEach(word => {
      if (word.length > 3) { // Skip short words
        frequency[word] = (frequency[word] || 0) + 1;
      }
    });
    
    // Return top 5 keywords with their density
    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .reduce((acc, [word, count]) => {
        acc[word] = count / words.length;
        return acc;
      }, {});
  }

  analyzeTopicCoverage(result) {
    const subjects = result.subjects || [];
    const coverage = {
      breadth: subjects.length,
      depth: subjects.length > 0 ? 'specialized' : 'general',
      primaryDomain: this.identifyPrimaryDomain(subjects),
      interdisciplinary: subjects.length > 2
    };
    
    return coverage;
  }

  identifyPrimaryDomain(subjects) {
    if (!subjects || subjects.length === 0) return 'general';
    
    // Simple domain classification based on subject headings
    const domains = {
      'technology': ['computer', 'software', 'digital', 'electronic', 'information technology'],
      'science': ['research', 'methodology', 'analysis', 'data', 'statistics'],
      'education': ['education', 'teaching', 'learning', 'curriculum', 'pedagogy'],
      'social': ['social', 'society', 'cultural', 'community', 'human'],
      'business': ['management', 'business', 'economics', 'finance', 'marketing']
    };
    
    const subjectText = subjects.join(' ').toLowerCase();
    
    for (const [domain, keywords] of Object.entries(domains)) {
      if (keywords.some(keyword => subjectText.includes(keyword))) {
        return domain;
      }
    }
    
    return 'general';
  }

  assessRecency(year) {
    if (!year) return { class: 'unknown', message: 'Publication year not available' };
    
    const currentYear = new Date().getFullYear();
    const age = currentYear - parseInt(year);
    
    if (age <= 2) return { class: 'very-recent', message: 'Very recent publication' };
    if (age <= 5) return { class: 'recent', message: 'Recent publication' };
    if (age <= 10) return { class: 'moderate', message: 'Moderately recent' };
    return { class: 'older', message: 'Older publication - check for updated information' };
  }

  getFormatInsights(result) {
    const format = result.format?.toLowerCase() || 'book';
    const insights = this.formatInsights[format] || this.formatInsights.book;
    
    return {
      format: format,
      strengths: insights.strengths,
      considerations: insights.considerations,
      recommendedUse: this.getRecommendedUse(format)
    };
  }

  getRecommendedUse(format) {
    const uses = {
      book: 'Comprehensive learning and reference',
      article: 'Current research and specific findings',
      thesis: 'In-depth research and methodology',
      conference: 'Latest trends and emerging ideas',
      report: 'Practical applications and case studies'
    };
    
    return uses[format] || 'General reference and learning';
  }

  assessSubjectExpertise(result) {
    const subjects = result.subjects?.join(' ').toLowerCase() || '';
    const title = result.title.toLowerCase();
    const allText = `${title} ${subjects}`;
    
    const expertise = {};
    
    Object.entries(this.expertiseIndicators).forEach(([field, indicators]) => {
      const matches = indicators.filter(indicator => allText.includes(indicator));
      if (matches.length > 0) {
        expertise[field] = {
          confidence: matches.length / indicators.length,
          indicators: matches
        };
      }
    });
    
    return expertise;
  }

  assessQuality(result) {
    const indicators = {
      hasISBN: !!(result.isbn && result.isbn.length > 0),
      hasDescription: !!(result.description && result.description.length > 50),
      hasSubjects: !!(result.subjects && result.subjects.length > 0),
      hasPublisher: !!(result.publisher && result.publisher.length > 0),
      hasYear: !!(result.year && result.year > 1900),
      authorityPublisher: this.isAuthorityPublisher(result.publisher),
      recentPublication: result.year >= new Date().getFullYear() - 10
    };
    
    const score = Object.values(indicators).filter(Boolean).length / Object.keys(indicators).length;
    
    return {
      score: score,
      indicators: indicators,
      class: this.getQualityClass(score),
      recommendations: this.getQualityRecommendations(indicators)
    };
  }

  isAuthorityPublisher(publisher) {
    if (!publisher) return false;
    
    const authorityPublishers = [
      'oxford', 'cambridge', 'harvard', 'mit', 'stanford', 'princeton',
      'academic press', 'springer', 'elsevier', 'wiley', 'sage',
      'university press', 'association for computing machinery', 'ieee'
    ];
    
    const publisherLower = publisher.toLowerCase();
    return authorityPublishers.some(authority => publisherLower.includes(authority));
  }

  getQualityClass(score) {
    if (score >= 0.8) return 'high-quality';
    if (score >= 0.6) return 'good-quality';
    if (score >= 0.4) return 'moderate-quality';
    return 'basic-quality';
  }

  getQualityRecommendations(indicators) {
    const recommendations = [];
    
    if (!indicators.hasDescription) {
      recommendations.push('Limited description available - may need additional research');
    }
    if (!indicators.hasSubjects) {
      recommendations.push('No subject headings - verify topic relevance');
    }
    if (!indicators.recentPublication) {
      recommendations.push('Consider checking for more recent sources');
    }
    if (indicators.authorityPublisher) {
      recommendations.push('Published by recognized authority in the field');
    }
    
    return recommendations;
  }

  generateUsageRecommendations(result, userContext) {
    const recommendations = [];
    
    // Based on result characteristics
    if (result.description && result.description.includes('introduction')) {
      recommendations.push('Good starting point for the topic');
    }
    
    if (result.year >= new Date().getFullYear() - 3) {
      recommendations.push('Contains current information');
    }
    
    if (result.subjects && result.subjects.length > 3) {
      recommendations.push('Covers multiple related topics');
    }
    
    // Based on user context
    if (userContext.includes('research')) {
      recommendations.push('Suitable for research purposes');
    }
    
    if (userContext.includes('student') || userContext.includes('learning')) {
      recommendations.push('Appropriate for educational use');
    }
    
    return recommendations;
  }

  async generateAIInsights(result, originalQuery, userContext) {
    const prompt = `Analyze this library resource and provide insights:

Title: "${result.title}"
Author: "${result.author}"
Year: ${result.year}
Publisher: "${result.publisher}"
Subjects: ${result.subjects?.join(', ') || 'None listed'}
Description: "${result.description || 'No description available'}"

Original Search Query: "${originalQuery}"
User Context: "${userContext}"

Provide analysis in JSON format:
{
  "contentSummary": "Brief summary of what this resource covers",
  "relevanceToQuery": "How this resource relates to the search query",
  "strengthsAndLimitations": ["key strengths", "potential limitations"],
  "recommendedFor": "Who would benefit most from this resource",
  "complementaryResources": "What other types of resources would complement this",
  "keyTakeaways": ["main points or insights this resource likely provides"],
  "academicValue": "Assessment of scholarly/academic value"
}`;

    try {
      const response = await this.geminiService.generateResponse(prompt, '', 0.3);
      return this.geminiService.parseJSONResponse(response);
    } catch (error) {
      console.warn('AI insights generation failed:', error);
      return null;
    }
  }

  async generateCollectionInsights(results, originalQuery) {
    try {
      const insights = {
        overallQuality: this.assessCollectionQuality(results),
        topicCoverage: this.analyzeCollectionCoverage(results),
        temporalDistribution: this.analyzeTemporalDistribution(results),
        diversityAnalysis: this.analyzeDiversity(results),
        gapAnalysis: this.identifyGaps(results, originalQuery),
        recommendations: this.generateCollectionRecommendations(results)
      };
      
      return insights;
      
    } catch (error) {
      console.error('Collection insights generation error:', error);
      return null;
    }
  }

  assessCollectionQuality(results) {
    const qualities = results.map(r => r.augmentation?.qualityIndicators?.score || 0.5);
    const average = qualities.reduce((sum, q) => sum + q, 0) / qualities.length;
    
    return {
      averageScore: average,
      distribution: {
        high: qualities.filter(q => q >= 0.8).length,
        good: qualities.filter(q => q >= 0.6 && q < 0.8).length,
        moderate: qualities.filter(q => q >= 0.4 && q < 0.6).length,
        basic: qualities.filter(q => q < 0.4).length
      },
      recommendation: this.getQualityRecommendation(average)
    };
  }

  getQualityRecommendation(averageScore) {
    if (averageScore >= 0.8) return 'Excellent collection of high-quality resources';
    if (averageScore >= 0.6) return 'Good collection with reliable sources';
    if (averageScore >= 0.4) return 'Mixed quality - verify individual sources';
    return 'Lower quality collection - seek additional authoritative sources';
  }

  analyzeCollectionCoverage(results) {
    const allSubjects = results.flatMap(r => r.subjects || []);
    const subjectFrequency = {};
    
    allSubjects.forEach(subject => {
      subjectFrequency[subject] = (subjectFrequency[subject] || 0) + 1;
    });
    
    const topSubjects = Object.entries(subjectFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    return {
      totalSubjects: Object.keys(subjectFrequency).length,
      topSubjects: topSubjects,
      breadth: Object.keys(subjectFrequency).length > 10 ? 'broad' : 'focused',
      dominantTopics: topSubjects.slice(0, 3).map(([subject]) => subject)
    };
  }

  analyzeTemporalDistribution(results) {
    const years = results.map(r => parseInt(r.year)).filter(year => !isNaN(year));
    const currentYear = new Date().getFullYear();
    
    const distribution = {
      veryRecent: years.filter(y => currentYear - y <= 2).length,
      recent: years.filter(y => currentYear - y > 2 && currentYear - y <= 5).length,
      moderate: years.filter(y => currentYear - y > 5 && currentYear - y <= 10).length,
      older: years.filter(y => currentYear - y > 10).length
    };
    
    return {
      distribution: distribution,
      averageAge: years.length > 0 ? currentYear - (years.reduce((sum, y) => sum + y, 0) / years.length) : null,
      recommendation: this.getTemporalRecommendation(distribution)
    };
  }

  getTemporalRecommendation(distribution) {
    const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);
    const recentRatio = (distribution.veryRecent + distribution.recent) / total;
    
    if (recentRatio >= 0.7) return 'Good coverage of recent developments';
    if (recentRatio >= 0.4) return 'Balanced mix of recent and established sources';
    return 'Consider adding more recent sources for current perspectives';
  }

  analyzeDiversity(results) {
    const formats = [...new Set(results.map(r => r.format || 'book'))];
    const publishers = [...new Set(results.map(r => r.publisher).filter(Boolean))];
    const authors = [...new Set(results.map(r => r.author).filter(Boolean))];
    
    return {
      formatDiversity: formats.length,
      publisherDiversity: publishers.length,
      authorDiversity: authors.length,
      diversityScore: (formats.length + Math.min(publishers.length, 10) + Math.min(authors.length, 10)) / 23,
      recommendation: this.getDiversityRecommendation(formats, publishers, authors)
    };
  }

  getDiversityRecommendation(formats, publishers, authors) {
    const recommendations = [];
    
    if (formats.length === 1) {
      recommendations.push('Consider exploring different resource formats');
    }
    
    if (publishers.length < 3) {
      recommendations.push('Seek sources from diverse publishers for broader perspectives');
    }
    
    if (authors.length < results.length * 0.7) {
      recommendations.push('Good author diversity across results');
    }
    
    return recommendations.length > 0 ? recommendations : ['Good diversity across the collection'];
  }

  identifyGaps(results, originalQuery) {
    // This is a simplified gap analysis - in production, you might want more sophisticated analysis
    const gaps = [];
    
    const hasRecent = results.some(r => parseInt(r.year) >= new Date().getFullYear() - 3);
    if (!hasRecent) {
      gaps.push('No very recent sources (last 3 years)');
    }
    
    const hasIntro = results.some(r => 
      r.title.toLowerCase().includes('introduction') || 
      r.description?.toLowerCase().includes('introduction')
    );
    if (!hasIntro) {
      gaps.push('No introductory-level resources identified');
    }
    
    const hasAdvanced = results.some(r => 
      r.title.toLowerCase().includes('advanced') || 
      r.description?.toLowerCase().includes('research')
    );
    if (!hasAdvanced) {
      gaps.push('Limited advanced or research-level resources');
    }
    
    return gaps;
  }

  generateCollectionRecommendations(results) {
    const recommendations = [];
    
    if (results.length < 5) {
      recommendations.push('Consider broadening search terms to find more resources');
    }
    
    if (results.length > 20) {
      recommendations.push('Large result set - consider narrowing search for more precision');
    }
    
    const avgQuality = results.reduce((sum, r) => sum + (r.augmentation?.qualityIndicators?.score || 0.5), 0) / results.length;
    if (avgQuality < 0.6) {
      recommendations.push('Verify quality of sources and seek additional authoritative resources');
    }
    
    return recommendations;
  }

  getBasicInsights(result) {
    return {
      hasDescription: !!(result.description && result.description.length > 0),
      hasSubjects: !!(result.subjects && result.subjects.length > 0),
      estimatedLevel: result.title.toLowerCase().includes('introduction') ? 'beginner' : 'intermediate',
      recency: result.year >= new Date().getFullYear() - 5 ? 'recent' : 'older'
    };
  }
}

module.exports = ResultAugmenter;