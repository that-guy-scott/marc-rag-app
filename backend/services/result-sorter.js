class ResultSorter {
  constructor() {
    // Define sort type constants
    this.SORT_TYPES = {
      BEST_MATCH: 'best_match',          // Hybrid quality + relevance (default)
      QUALITY: 'quality',                // Quality score descending
      RELEVANCE: 'relevance',           // Elasticsearch score descending
      NEWEST: 'newest',                 // Publication year descending
      OLDEST: 'oldest',                 // Publication year ascending
      TITLE_AZ: 'title_az',             // Title A-Z
      TITLE_ZA: 'title_za',             // Title Z-A
      AUTHOR_AZ: 'author_az',           // Author A-Z
      AUTHOR_ZA: 'author_za'            // Author Z-A
    };
  }

  /**
   * Sort search results by specified criteria
   * @param {Array} results - Array of search results
   * @param {string} sortBy - Sort type from SORT_TYPES
   * @param {Object} options - Additional sorting options
   * @returns {Array} Sorted results
   */
  sortResults(results, sortBy = this.SORT_TYPES.BEST_MATCH, options = {}) {
    if (!results || results.length === 0) {
      return results;
    }

    // Clone array to avoid mutating original
    const sortedResults = [...results];

    switch (sortBy) {
      case this.SORT_TYPES.BEST_MATCH:
        return this.sortByBestMatch(sortedResults, options);
      
      case this.SORT_TYPES.QUALITY:
        return this.sortByQuality(sortedResults);
      
      case this.SORT_TYPES.RELEVANCE:
        return this.sortByRelevance(sortedResults);
      
      case this.SORT_TYPES.NEWEST:
        return this.sortByDate(sortedResults, 'desc');
      
      case this.SORT_TYPES.OLDEST:
        return this.sortByDate(sortedResults, 'asc');
      
      case this.SORT_TYPES.TITLE_AZ:
        return this.sortByTitle(sortedResults, 'asc');
      
      case this.SORT_TYPES.TITLE_ZA:
        return this.sortByTitle(sortedResults, 'desc');
      
      case this.SORT_TYPES.AUTHOR_AZ:
        return this.sortByAuthor(sortedResults, 'asc');
      
      case this.SORT_TYPES.AUTHOR_ZA:
        return this.sortByAuthor(sortedResults, 'desc');
      
      default:
        console.warn(`Unknown sort type: ${sortBy}, using best match`);
        return this.sortByBestMatch(sortedResults, options);
    }
  }

  /**
   * Sort by hybrid quality + relevance score (default)
   * Quality weight: 60%, Relevance weight: 40%
   */
  sortByBestMatch(results, options = {}) {
    const qualityWeight = options.qualityWeight || 0.6;
    const relevanceWeight = options.relevanceWeight || 0.4;

    return results.sort((a, b) => {
      const aQuality = this.getQualityScore(a);
      const bQuality = this.getQualityScore(b);
      
      const aRelevance = this.getRelevanceScore(a);
      const bRelevance = this.getRelevanceScore(b);
      
      // Normalize relevance scores (0-1 range)
      const maxRelevance = Math.max(...results.map(r => this.getRelevanceScore(r)));
      const aNormalizedRelevance = maxRelevance > 0 ? aRelevance / maxRelevance : 0;
      const bNormalizedRelevance = maxRelevance > 0 ? bRelevance / maxRelevance : 0;
      
      // Calculate hybrid scores
      const aHybrid = (aQuality * qualityWeight) + (aNormalizedRelevance * relevanceWeight);
      const bHybrid = (bQuality * qualityWeight) + (bNormalizedRelevance * relevanceWeight);
      
      return bHybrid - aHybrid; // Descending order
    });
  }

  /**
   * Sort by quality score (highest first)
   */
  sortByQuality(results) {
    return results.sort((a, b) => {
      const aQuality = this.getQualityScore(a);
      const bQuality = this.getQualityScore(b);
      
      // If quality scores are equal, use relevance as tiebreaker
      if (Math.abs(aQuality - bQuality) < 0.01) {
        return this.getRelevanceScore(b) - this.getRelevanceScore(a);
      }
      
      return bQuality - aQuality; // Descending order
    });
  }

  /**
   * Sort by relevance score (highest first)
   */
  sortByRelevance(results) {
    return results.sort((a, b) => {
      const aRelevance = this.getRelevanceScore(a);
      const bRelevance = this.getRelevanceScore(b);
      
      // If relevance scores are equal, use quality as tiebreaker
      if (Math.abs(aRelevance - bRelevance) < 0.01) {
        return this.getQualityScore(b) - this.getQualityScore(a);
      }
      
      return bRelevance - aRelevance; // Descending order
    });
  }

  /**
   * Sort by publication date
   */
  sortByDate(results, direction = 'desc') {
    return results.sort((a, b) => {
      const aYear = this.getPublicationYear(a);
      const bYear = this.getPublicationYear(b);
      
      // Handle missing years - put them at the end
      if (!aYear && !bYear) return 0;
      if (!aYear) return 1;
      if (!bYear) return -1;
      
      const diff = bYear - aYear;
      return direction === 'desc' ? diff : -diff;
    });
  }

  /**
   * Sort by title alphabetically
   */
  sortByTitle(results, direction = 'asc') {
    return results.sort((a, b) => {
      const aTitle = (a.title || '').toLowerCase();
      const bTitle = (b.title || '').toLowerCase();
      
      const comparison = aTitle.localeCompare(bTitle);
      return direction === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Sort by author alphabetically
   */
  sortByAuthor(results, direction = 'asc') {
    return results.sort((a, b) => {
      const aAuthor = (a.author || '').toLowerCase();
      const bAuthor = (b.author || '').toLowerCase();
      
      // Handle missing authors - put them at the end
      if (!aAuthor && !bAuthor) return 0;
      if (!aAuthor) return direction === 'asc' ? 1 : -1;
      if (!bAuthor) return direction === 'asc' ? -1 : 1;
      
      const comparison = aAuthor.localeCompare(bAuthor);
      return direction === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Extract quality score from result
   */
  getQualityScore(result) {
    return result.augmentation?.qualityIndicators?.score || 0.5;
  }

  /**
   * Extract relevance score from result
   */
  getRelevanceScore(result) {
    return result.score || 0;
  }

  /**
   * Extract publication year from result
   */
  getPublicationYear(result) {
    const year = result.year || result.publicationYear;
    if (typeof year === 'string') {
      const parsed = parseInt(year);
      return isNaN(parsed) ? null : parsed;
    }
    return typeof year === 'number' ? year : null;
  }

  /**
   * Get available sort options for frontend
   */
  getAvailableSortOptions() {
    return [
      { value: this.SORT_TYPES.BEST_MATCH, label: 'Best Match', description: 'Quality + Relevance' },
      { value: this.SORT_TYPES.QUALITY, label: 'Quality', description: 'Highest quality first' },
      { value: this.SORT_TYPES.RELEVANCE, label: 'Relevance', description: 'Most relevant first' },
      { value: this.SORT_TYPES.NEWEST, label: 'Newest', description: 'Most recent first' },
      { value: this.SORT_TYPES.OLDEST, label: 'Oldest', description: 'Oldest first' },
      { value: this.SORT_TYPES.TITLE_AZ, label: 'Title A-Z', description: 'Alphabetical by title' },
      { value: this.SORT_TYPES.AUTHOR_AZ, label: 'Author A-Z', description: 'Alphabetical by author' }
    ];
  }

  /**
   * Validate sort type
   */
  isValidSortType(sortBy) {
    return Object.values(this.SORT_TYPES).includes(sortBy);
  }

  /**
   * Get sort statistics for debugging
   */
  getSortStatistics(results) {
    if (!results || results.length === 0) {
      return null;
    }

    const qualityScores = results.map(r => this.getQualityScore(r));
    const relevanceScores = results.map(r => this.getRelevanceScore(r));
    const years = results.map(r => this.getPublicationYear(r)).filter(Boolean);

    return {
      count: results.length,
      quality: {
        min: Math.min(...qualityScores),
        max: Math.max(...qualityScores),
        avg: qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length
      },
      relevance: {
        min: Math.min(...relevanceScores),
        max: Math.max(...relevanceScores),
        avg: relevanceScores.reduce((sum, score) => sum + score, 0) / relevanceScores.length
      },
      years: years.length > 0 ? {
        min: Math.min(...years),
        max: Math.max(...years),
        avg: Math.round(years.reduce((sum, year) => sum + year, 0) / years.length)
      } : null
    };
  }
}

module.exports = ResultSorter;