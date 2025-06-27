import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-item-detail',
  standalone: true,
  imports: [CommonModule, HttpClientModule, RouterModule],
  templateUrl: './item-detail.component.html',
  styleUrl: './item-detail.component.css'
})
export class ItemDetailComponent implements OnInit {
  itemId: string = '';
  item: any = null;
  similarItems: any[] = [];
  isLoading = true;
  activeTab = 'overview';
  error: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.itemId = params['id'];
      if (this.itemId) {
        this.loadItemDetail();
        this.loadSimilarItems();
      }
    });
  }

  loadItemDetail() {
    this.isLoading = true;
    this.http.get(`/api/item/${this.itemId}`)
      .subscribe({
        next: (response: any) => {
          this.item = response;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading item detail:', error);
          this.error = 'Failed to load item details';
          this.isLoading = false;
          // For now, create mock data for demonstration
          this.createMockItem();
        }
      });
  }

  loadSimilarItems() {
    this.http.get(`/api/item/${this.itemId}/similar`)
      .subscribe({
        next: (response: any) => {
          this.similarItems = response.results || [];
        },
        error: (error) => {
          console.error('Error loading similar items:', error);
          // Create mock similar items for demonstration
          this.createMockSimilarItems();
        }
      });
  }

  createMockItem() {
    // Create mock data based on itemId for demonstration
    this.item = {
      id: this.itemId,
      title: "Introduction to Information Science",
      subtitle: "Theory and Practice",
      author: "Jane Smith",
      publisher: "Academic Press",
      year: "2023",
      isbn: "978-0-123456-78-9",
      subjects: ["Information Science", "Library Science", "Academic Research", "Data Management"],
      description: "This comprehensive introduction to information science covers the fundamental theories, methods, and practices in the field. The book explores how information is created, organized, stored, retrieved, and used in various contexts, from traditional libraries to digital environments.",
      marcRecord: this.itemId,
      callNumber: "Z665 .S64 2023",
      format: "Book",
      language: "English",
      pages: "456",
      location: "Main Library - 3rd Floor",
      availability: "Available",
      notes: "Includes bibliographical references and index."
    };
    this.isLoading = false;
  }

  createMockSimilarItems() {
    this.similarItems = [
      {
        id: "mock_002",
        title: "Digital Libraries and Information Systems",
        author: "Robert Brown",
        year: "2022",
        score: 0.87
      },
      {
        id: "mock_003", 
        title: "Library Science Fundamentals",
        author: "Alice Johnson",
        year: "2024",
        score: 0.82
      },
      {
        id: "mock_004",
        title: "Information Architecture",
        author: "David Wilson",
        year: "2023",
        score: 0.78
      },
      {
        id: "mock_005",
        title: "Data Science for Libraries",
        author: "Sarah Davis",
        year: "2023",
        score: 0.75
      }
    ];
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  goBack() {
    this.router.navigate(['/']);
  }

  viewSimilarItem(itemId: string) {
    this.router.navigate(['/item', itemId]);
  }

  printItem() {
    window.print();
  }

  shareItem() {
    if (navigator.share) {
      navigator.share({
        title: this.item.title,
        text: `${this.item.title} by ${this.item.author}`,
        url: window.location.href
      });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  }

  saveItem() {
    alert('Save functionality not yet implemented');
  }
}