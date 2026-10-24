import { Component, inject, input } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';

export interface SocialLink {
  id: 'instagram' | 'tiktok';
  network: string;
  handle: string;
  url: string;
}

/** INDAB Academy's official social networks (Cris, 2026-10-24). */
export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    id: 'instagram',
    network: 'Instagram',
    handle: '@indabacademylp',
    url: 'https://www.instagram.com/indabacademylp/',
  },
  {
    id: 'tiktok',
    network: 'TikTok',
    handle: '@indab.academy',
    url: 'https://www.tiktok.com/@indab.academy',
  },
];

/**
 * Links to INDAB's social networks: icons only, or icon, network and handle with `labels`.
 * Icons are inline SVG so they render without another download.
 */
@Component({
  selector: 'app-social-links',
  template: `
    @let t = i18n.messages().social;
    <ul [class.labels]="labels()">
      @for (link of links; track link.id) {
        <li>
          <a
            [href]="link.url"
            target="_blank"
            rel="noopener"
            [attr.aria-label]="labels() ? null : t.followOn(link.network)"
            [attr.title]="labels() ? null : t.followOn(link.network)"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              @switch (link.id) {
                @case ('instagram') {
                  <g fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                  </g>
                  <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
                }
                @case ('tiktok') {
                  <path
                    fill="currentColor"
                    d="M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"
                  />
                }
              }
            </svg>
            @if (labels()) {
              <span class="network">{{ link.network }}</span>
              <span class="handle">{{ link.handle }}</span>
            }
          </a>
        </li>
      }
    </ul>
  `,
  styles: `
    ul {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    a {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--color-muted);
      text-decoration: none;

      &:hover,
      &:focus-visible {
        color: var(--color-text);
      }
    }

    .labels {
      flex-direction: column;
      gap: 0;

      li {
        padding: 16px 0;
        border-bottom: 1px solid var(--color-border);
      }

      a {
        width: 100%;
        color: var(--color-text);
      }

      .network {
        flex: 1;
        color: var(--color-muted);
      }
    }
  `,
})
export class SocialLinks {
  protected readonly i18n = inject(I18n);
  protected readonly links = SOCIAL_LINKS;
  /** Shows the network name and the handle next to each icon. */
  readonly labels = input(false);
}
