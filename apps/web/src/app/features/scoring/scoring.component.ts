import { Component, inject, OnInit, signal } from '@angular/core';

import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-scoring',
  template: `
    <h1>Scoring settings</h1>
    <p class="lede dl-muted">Presets for manual leagues. Sleeper imports map these automatically.</p>
    <div class="grid">
      @for (p of presets(); track p.id) {
        <article class="dl-panel">
          <h2>{{ p.name }}</h2>
          <div class="kv"><span>Variant</span><strong>{{ p.variant }}</strong></div>
          <div class="kv"><span>Preset id</span><strong class="dl-mono">{{ p.id }}</strong></div>
        </article>
      }
    </div>
  `,
  styles: `
    h1 { margin: 0 0 0.25rem; }
    .lede { margin: 0 0 1.25rem; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
    .dl-panel { padding: 1rem; }
    h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
    .kv { display: flex; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px solid var(--dl-border-subtle); font-size: 0.9rem; }
    @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export class ScoringComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly presets = signal<Array<{ id: string; name: string; variant: string }>>([]);

  ngOnInit() {
    this.api.scoringPresets().subscribe((p) => this.presets.set(p));
  }
}
