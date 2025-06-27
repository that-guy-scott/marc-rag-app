const axios = require('axios');

class GeminiService {
  constructor() {
    this.apiUrl = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';
    this.apiKey = process.env.GEMINI_API_KEY;
    this.model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    
    if (!this.apiKey) {
      console.warn('⚠️  GEMINI_API_KEY not found in environment variables');
    }
  }

  /**
   * Clean and parse JSON response from Gemini
   */
  parseJSONResponse(response) {
    try {
      // Clean potential markdown formatting
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Remove any leading/trailing whitespace and non-JSON content
      const jsonStart = cleanResponse.indexOf('{');
      const jsonEnd = cleanResponse.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanResponse = cleanResponse.substring(jsonStart, jsonEnd + 1);
      }

      return JSON.parse(cleanResponse);
    } catch (error) {
      console.warn('JSON parsing failed:', error.message);
      console.warn('Raw response:', response.substring(0, 200) + '...');
      throw new Error(`Failed to parse JSON response: ${error.message}`);
    }
  }

  async generateResponse(prompt, context = null, temperature = 0.7) {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const requestBody = {
      contents: [{
        parts: [{
          text: context ? `${context}\n\n${prompt}` : prompt
        }]
      }],
      generationConfig: {
        temperature: temperature,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    };

    try {
      const response = await axios.post(
        `${this.apiUrl}?key=${this.apiKey}`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000
        }
      );

      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return response.data.candidates[0].content.parts[0].text;
      } else {
        throw new Error('Invalid response format from Gemini API');
      }
    } catch (error) {
      console.error('Gemini API error:', error.response?.data || error.message);
      throw new Error(`Gemini API request failed: ${error.message}`);
    }
  }

  async enhanceQuery(userQuery, context = '') {
    const prompt = `You are a research librarian assistant. Analyze and enhance this search query for a library catalog search.

Original Query: "${userQuery}"
Context: "${context}"

Tasks:
1. Identify key concepts and expand any abbreviations
2. Suggest related subject headings and keywords
3. Identify potential search variations and synonyms
4. Recommend search strategies

Respond in JSON format:
{
  "enhancedQuery": "improved search terms",
  "keywords": ["keyword1", "keyword2"],
  "subjectHeadings": ["heading1", "heading2"],
  "searchVariations": ["variation1", "variation2"],
  "searchStrategy": "recommended approach"
}`;

    try {
      const response = await this.generateResponse(prompt);
      return this.parseJSONResponse(response);
    } catch (error) {
      console.error('Query enhancement failed:', error);
      return {
        enhancedQuery: userQuery,
        keywords: [userQuery],
        subjectHeadings: [],
        searchVariations: [userQuery],
        searchStrategy: 'Basic keyword search'
      };
    }
  }

  async summarizeResults(searchResults, originalQuery) {
    if (!searchResults || searchResults.length === 0) {
      return {
        summary: 'No results found for the given query.',
        keyTopics: [],
        researchGaps: [],
        methodology: ''
      };
    }

    const resultsText = searchResults.slice(0, 10).map(result => 
      `Title: ${result.title}\nAuthor: ${result.author}\nYear: ${result.year}\nSubjects: ${result.subjects?.join(', ') || 'N/A'}\nDescription: ${result.description || 'N/A'}`
    ).join('\n\n');

    const prompt = `Based on these library catalog search results, create a comprehensive research summary:

Original Query: "${originalQuery}"

Search Results:
${resultsText}

Analyze these resources and provide insights in JSON format:
{
  "summary": "2-3 paragraph thematic overview of the resources",
  "keyTopics": ["main topic areas covered"],
  "keyAuthors": ["prominent authors in results"],
  "publicationTrends": "analysis of publication dates and trends",
  "researchGaps": ["potential areas needing more research"],
  "methodology": "suggested research approach based on available resources",
  "qualityIndicators": "assessment of resource quality and reliability"
}`;

    try {
      const response = await this.generateResponse(prompt);
      return this.parseJSONResponse(response);
    } catch (error) {
      console.error('Result summarization failed:', error);
      return {
        summary: `Found ${searchResults.length} resources related to "${originalQuery}". Results include various publications spanning multiple years and subject areas.`,
        keyTopics: [...new Set(searchResults.flatMap(r => r.subjects || []))].slice(0, 5),
        keyAuthors: [...new Set(searchResults.map(r => r.author).filter(Boolean))].slice(0, 5),
        publicationTrends: 'Mixed publication dates across the result set.',
        researchGaps: [],
        methodology: 'Review the retrieved resources and expand search terms as needed.',
        qualityIndicators: 'Results include peer-reviewed and scholarly sources.'
      };
    }
  }

  async generateCitations(marcRecords, format = 'apa') {
    if (!marcRecords || marcRecords.length === 0) {
      return [];
    }

    const recordsText = marcRecords.slice(0, 5).map(record => 
      `Title: ${record.title}\nAuthor: ${record.author}\nPublisher: ${record.publisher}\nYear: ${record.year}\nISBN: ${record.isbn || 'N/A'}`
    ).join('\n\n');

    const prompt = `Generate ${format.toUpperCase()} format citations for these library resources:

${recordsText}

Respond with a JSON array of properly formatted citations:
{
  "citations": ["properly formatted citation 1", "properly formatted citation 2"]
}`;

    try {
      const response = await this.generateResponse(prompt);
      const parsed = JSON.parse(response);
      return parsed.citations || [];
    } catch (error) {
      console.error('Citation generation failed:', error);
      return marcRecords.map(record => 
        `${record.author || 'Unknown Author'}. (${record.year || 'n.d.'}). ${record.title}. ${record.publisher || 'Publisher unknown'}.`
      );
    }
  }

  async suggestFollowUps(originalQuery, searchResults, context = '') {
    const resultsContext = searchResults.slice(0, 5).map(r => 
      `${r.title} by ${r.author} (${r.year})`
    ).join('; ');

    const prompt = `Based on this library search and results, suggest follow-up research directions:

Original Query: "${originalQuery}"
Context: "${context}"
Retrieved Resources: ${resultsContext}

Provide suggestions in JSON format:
{
  "relatedQueries": ["specific follow-up search queries"],
  "researchDirections": ["broader research areas to explore"],
  "additionalSources": ["types of sources to look for"],
  "experts": ["suggested authors or researchers to investigate"],
  "interdisciplinaryConnections": ["related fields or disciplines"]
}`;

    try {
      const response = await this.generateResponse(prompt);
      return this.parseJSONResponse(response);
    } catch (error) {
      console.error('Follow-up suggestion failed:', error);
      return {
        relatedQueries: [`More about ${originalQuery}`, `Recent research on ${originalQuery}`],
        researchDirections: ['Expand search terms', 'Look for recent publications'],
        additionalSources: ['Academic journals', 'Conference proceedings'],
        experts: [],
        interdisciplinaryConnections: []
      };
    }
  }

  async generateResearchInsights(query, results, userContext = '') {
    const prompt = `As a research librarian, provide comprehensive insights for this research query:

Query: "${query}"
User Context: "${userContext}"
Number of Results: ${results.length}

Key Resources Found:
${results.slice(0, 3).map(r => `- ${r.title} by ${r.author} (${r.year})`).join('\n')}

Provide research insights in JSON format:
{
  "researchStrategy": "recommended approach for this topic",
  "sourceQuality": "assessment of the retrieved sources",
  "coverageAnalysis": "analysis of topic coverage and gaps",
  "nextSteps": ["specific recommendations for continuing research"],
  "timelineEstimate": "estimated time needed for thorough research",
  "skillsRequired": ["research skills or tools needed"],
  "potentialChallenges": ["research challenges to anticipate"]
}`;

    try {
      const response = await this.generateResponse(prompt);
      return this.parseJSONResponse(response);
    } catch (error) {
      console.error('Research insights generation failed:', error);
      return {
        researchStrategy: 'Systematic review of available literature',
        sourceQuality: 'Mixed quality sources requiring evaluation',
        coverageAnalysis: 'Partial coverage of the topic',
        nextSteps: ['Expand search terms', 'Consult additional databases'],
        timelineEstimate: '2-4 weeks for comprehensive research',
        skillsRequired: ['Database searching', 'Source evaluation'],
        potentialChallenges: ['Limited recent sources', 'Broad topic scope']
      };
    }
  }

  async isServiceAvailable() {
    return !!this.apiKey;
  }
}

module.exports = GeminiService;