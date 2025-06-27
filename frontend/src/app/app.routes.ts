import { Routes } from '@angular/router';
import { ItemDetailComponent } from './components/item-detail/item-detail.component';
import { SearchComponent } from './components/search/search.component';

export const routes: Routes = [
  { path: '', component: SearchComponent },
  { path: 'item/:id', component: ItemDetailComponent },
  { path: '**', redirectTo: '' }
];
