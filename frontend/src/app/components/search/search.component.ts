import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [HttpClientModule, FormsModule, CommonModule],
  templateUrl: './search.component.html',
  styleUrl: './search.component.css'
})
export class SearchComponent {
  searchQuery: string = '';
  searchResults: any[] = [];
  isLoading: boolean = false;
  
  // RAG-specific data
  aiInsights: any = null;
  recommendations: any = null;
  queryEnhancement: any = null;
  citations: any = {};
  conversationId: string = '';
  showAdvancedFeatures: boolean = false;
  
  // UI state
  activeTab: string = 'results';
  showCitations: boolean = false;
  selectedSortBy: string = 'best_match';

  constructor(private http: HttpClient, private router: Router) {}

  onSearch() {
    if (!this.searchQuery.trim()) {
      return;
    }

    this.isLoading = true;
    
    // Use RAG search endpoint with preferences
    const searchRequest = {
      query: this.searchQuery,
      conversationId: this.conversationId,
      sortBy: this.selectedSortBy,
      preferences: {
        academicLevel: 'general',
        maxResults: 20
      }
    };

    this.http.post('/api/rag-search', searchRequest)
      .subscribe({
        next: (response: any) => {
          console.log('RAG Response:', response);
          
          // Store all RAG data
          this.searchResults = response.results || [];
          this.aiInsights = response.aiInsights;
          this.recommendations = response.recommendations;
          this.queryEnhancement = response.queryEnhancement;
          this.citations = response.citations;
          this.conversationId = response.conversationId;
          
          // Show advanced features if we have AI insights
          this.showAdvancedFeatures = !!(this.aiInsights || this.recommendations);
          
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Search error:', error);
          this.searchResults = [];
          this.aiInsights = null;
          this.recommendations = null;
          this.queryEnhancement = null;
          this.citations = {};
          this.isLoading = false;
        }
      });
  }

  onInputChange() {
    // For future live search implementation
  }

  viewItemDetail(itemId: string) {
    console.log('Navigating to item detail:', itemId);
    this.router.navigate(['/item', itemId]);
  }

  saveItem(item: any) {
    console.log('Saving item:', item);
    // TODO: Implement save to favorites/reading list
    alert(`Save functionality not yet implemented. Item: ${item.title}`);
  }

  // New methods for RAG features
  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  toggleCitations() {
    this.showCitations = !this.showCitations;
  }

  searchRelatedQuery(query: string) {
    this.searchQuery = query;
    this.onSearch();
  }

  getReadingLevelClass(level: string): string {
    switch(level) {
      case 'beginner': return 'reading-level-beginner';
      case 'intermediate': return 'reading-level-intermediate';
      case 'advanced': return 'reading-level-advanced';
      default: return 'reading-level-intermediate';
    }
  }

  getQualityClass(score: number): string {
    if (score >= 0.8) return 'quality-high';
    if (score >= 0.6) return 'quality-good';
    if (score >= 0.4) return 'quality-moderate';
    return 'quality-basic';
  }

  onSortChange() {
    if (this.searchResults.length > 0 && this.searchQuery.trim()) {
      // Re-run the search with the new sort order
      this.onSearch();
    }
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    });
  }
}