const { v4: uuidv4 } = require('uuid');

class ContextManager {
  constructor() {
    this.conversations = new Map();
    this.researchSessions = new Map();
    this.contextWindow = parseInt(process.env.RAG_CONTEXT_WINDOW) || 8000;
    this.maxAge = 30 * 60 * 1000; // 30 minutes in milliseconds
    
    // Cleanup old conversations every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  createConversation(userId = 'anonymous') {
    const conversationId = uuidv4();
    const conversation = {
      id: conversationId,
      userId: userId,
      messages: [],
      context: {},
      createdAt: new Date(),
      lastActivity: new Date(),
      searchHistory: [],
      preferences: {}
    };
    
    this.conversations.set(conversationId, conversation);
    return conversationId;
  }

  getConversation(conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.lastActivity = new Date();
      return conversation;
    }
    return null;
  }

  addMessage(conversationId, message, role = 'user') {
    const conversation = this.getConversation(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const messageObj = {
      id: uuidv4(),
      role: role, // 'user', 'assistant', 'system'
      content: message,
      timestamp: new Date(),
      metadata: {}
    };

    conversation.messages.push(messageObj);
    conversation.lastActivity = new Date();

    // Trim conversation if it exceeds context window
    this.trimConversation(conversation);
    
    return messageObj.id;
  }

  addSearchToHistory(conversationId, query, results, aiInsights = null) {
    const conversation = this.getConversation(conversationId);
    if (!conversation) {
      return;
    }

    const searchEntry = {
      id: uuidv4(),
      query: query,
      timestamp: new Date(),
      resultCount: results.length,
      topResults: results.slice(0, 3).map(r => ({
        id: r.id,
        title: r.title,
        author: r.author,
        year: r.year
      })),
      aiInsights: aiInsights
    };

    conversation.searchHistory.push(searchEntry);
    
    // Keep only last 10 searches
    if (conversation.searchHistory.length > 10) {
      conversation.searchHistory = conversation.searchHistory.slice(-10);
    }
  }

  getConversationContext(conversationId) {
    const conversation = this.getConversation(conversationId);
    if (!conversation) {
      return null;
    }

    // Create context string from recent messages and search history
    const recentMessages = conversation.messages.slice(-5);
    const recentSearches = conversation.searchHistory.slice(-3);
    
    let contextParts = [];
    
    // Add conversation context
    if (recentMessages.length > 0) {
      contextParts.push('Recent Conversation:');
      recentMessages.forEach(msg => {
        contextParts.push(`${msg.role}: ${msg.content}`);
      });
    }
    
    // Add search history context
    if (recentSearches.length > 0) {
      contextParts.push('\nRecent Searches:');
      recentSearches.forEach(search => {
        contextParts.push(`Query: "${search.query}" (${search.resultCount} results)`);
        if (search.topResults.length > 0) {
          contextParts.push(`Top result: ${search.topResults[0].title}`);
        }
      });
    }
    
    return contextParts.join('\n');
  }

  updateConversationContext(conversationId, key, value) {
    const conversation = this.getConversation(conversationId);
    if (conversation) {
      conversation.context[key] = value;
      conversation.lastActivity = new Date();
    }
  }

  setUserPreferences(conversationId, preferences) {
    const conversation = this.getConversation(conversationId);
    if (conversation) {
      conversation.preferences = { ...conversation.preferences, ...preferences };
      conversation.lastActivity = new Date();
    }
  }

  getUserPreferences(conversationId) {
    const conversation = this.getConversation(conversationId);
    return conversation ? conversation.preferences : {};
  }

  createResearchSession(userId, topic, requirements = {}) {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      userId: userId,
      topic: topic,
      requirements: requirements,
      queries: [],
      resources: [],
      notes: '',
      milestones: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active' // active, completed, archived
    };
    
    this.researchSessions.set(sessionId, session);
    return sessionId;
  }

  getResearchSession(sessionId) {
    return this.researchSessions.get(sessionId);
  }

  addResourceToSession(sessionId, resource) {
    const session = this.getResearchSession(sessionId);
    if (session) {
      const resourceEntry = {
        id: uuidv4(),
        ...resource,
        addedAt: new Date(),
        tags: resource.tags || [],
        notes: resource.notes || ''
      };
      
      session.resources.push(resourceEntry);
      session.updatedAt = new Date();
      
      return resourceEntry.id;
    }
    return null;
  }

  addQueryToSession(sessionId, query, results = []) {
    const session = this.getResearchSession(sessionId);
    if (session) {
      const queryEntry = {
        id: uuidv4(),
        query: query,
        timestamp: new Date(),
        resultCount: results.length,
        effectiveness: null // can be rated later
      };
      
      session.queries.push(queryEntry);
      session.updatedAt = new Date();
      
      return queryEntry.id;
    }
    return null;
  }

  updateSessionNotes(sessionId, notes) {
    const session = this.getResearchSession(sessionId);
    if (session) {
      session.notes = notes;
      session.updatedAt = new Date();
    }
  }

  getSessionSummary(sessionId) {
    const session = this.getResearchSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      topic: session.topic,
      duration: new Date() - session.createdAt,
      queryCount: session.queries.length,
      resourceCount: session.resources.length,
      lastActivity: session.updatedAt,
      status: session.status,
      requirements: session.requirements
    };
  }

  trimConversation(conversation) {
    // Calculate approximate character count
    let totalChars = 0;
    const messages = [...conversation.messages].reverse(); // Start from most recent
    const trimmedMessages = [];
    
    for (const message of messages) {
      const messageChars = JSON.stringify(message).length;
      if (totalChars + messageChars > this.contextWindow && trimmedMessages.length > 0) {
        break;
      }
      totalChars += messageChars;
      trimmedMessages.unshift(message); // Add to beginning to maintain order
    }
    
    conversation.messages = trimmedMessages;
  }

  cleanup() {
    const now = new Date();
    
    // Clean up old conversations
    for (const [id, conversation] of this.conversations) {
      if (now - conversation.lastActivity > this.maxAge) {
        this.conversations.delete(id);
      }
    }
    
    // Clean up old research sessions (keep for 24 hours)
    const sessionMaxAge = 24 * 60 * 60 * 1000; // 24 hours
    for (const [id, session] of this.researchSessions) {
      if (now - session.updatedAt > sessionMaxAge && session.status === 'active') {
        session.status = 'archived';
      }
    }
    
    console.log(`Context cleanup: ${this.conversations.size} active conversations, ${this.researchSessions.size} research sessions`);
  }

  getStats() {
    return {
      activeConversations: this.conversations.size,
      researchSessions: this.researchSessions.size,
      totalMessages: Array.from(this.conversations.values()).reduce((total, conv) => total + conv.messages.length, 0),
      totalSearches: Array.from(this.conversations.values()).reduce((total, conv) => total + conv.searchHistory.length, 0)
    };
  }

  exportConversation(conversationId) {
    const conversation = this.getConversation(conversationId);
    if (!conversation) {
      return null;
    }

    return {
      id: conversation.id,
      createdAt: conversation.createdAt,
      messages: conversation.messages,
      searchHistory: conversation.searchHistory,
      context: conversation.context
    };
  }

  exportResearchSession(sessionId) {
    const session = this.getResearchSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      ...session,
      export_timestamp: new Date()
    };
  }
}

module.exports = ContextManager;