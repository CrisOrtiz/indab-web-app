import { Timestamp } from 'firebase/firestore';
import { Material, groupByCategory, httpsUrl, materialEmbed } from './material';

const embed = (url: string) => materialEmbed(url)?.embedUrl;

describe('materialEmbed', () => {
  it('embeds YouTube videos, shorts and playlists without cookies', () => {
    const watch = materialEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s');
    expect(watch).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=90',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      kind: 'video',
    });
    expect(embed('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0',
    );
    expect(embed('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toContain('/embed/dQw4w9WgXcQ');
    expect(embed('https://www.youtube.com/playlist?list=PL123abc')).toBe(
      'https://www.youtube-nocookie.com/embed/videoseries?list=PL123abc',
    );
    // A YouTube link without a video id is still recognised, but opens in a new tab.
    expect(materialEmbed('https://www.youtube.com/@indab')).toMatchObject({
      provider: 'youtube',
      embedUrl: null,
    });
  });

  it('embeds Vimeo, keeping the private hash of unlisted videos', () => {
    expect(embed('https://vimeo.com/123456789')).toBe('https://player.vimeo.com/video/123456789');
    expect(embed('https://vimeo.com/123456789/abc123def0')).toBe(
      'https://player.vimeo.com/video/123456789?h=abc123def0',
    );
    expect(embed('https://player.vimeo.com/video/42?h=ff00')).toBe(
      'https://player.vimeo.com/video/42?h=ff00',
    );
  });

  it('previews Google Drive files, Slides decks and Docs', () => {
    expect(
      materialEmbed('https://drive.google.com/file/d/1AbCdEfGhIjK_lm/view?usp=sharing'),
    ).toEqual({
      provider: 'drive',
      embedUrl: 'https://drive.google.com/file/d/1AbCdEfGhIjK_lm/preview',
      thumbnailUrl: null,
      kind: 'document',
    });
    expect(embed('https://drive.google.com/open?id=1AbCdEfGhIjK_lm')).toBe(
      'https://drive.google.com/file/d/1AbCdEfGhIjK_lm/preview',
    );
    expect(
      materialEmbed('https://docs.google.com/presentation/d/1SlideDeckId_x/edit#slide=id.p'),
    ).toMatchObject({
      provider: 'slides',
      embedUrl: 'https://docs.google.com/presentation/d/1SlideDeckId_x/embed',
      kind: 'presentation',
    });
    expect(
      embed('https://docs.google.com/presentation/d/e/2PACX-1vPublished/pub?start=false'),
    ).toBe('https://docs.google.com/presentation/d/e/2PACX-1vPublished/embed');
    expect(embed('https://docs.google.com/document/d/1DocumentIdAbc/edit')).toBe(
      'https://docs.google.com/document/d/1DocumentIdAbc/preview',
    );
  });

  it('embeds shared Canva designs', () => {
    expect(
      materialEmbed('https://www.canva.com/design/DAGabc123/Xyz-789/view?utm_content=x'),
    ).toMatchObject({
      provider: 'canva',
      embedUrl: 'https://www.canva.com/design/DAGabc123/Xyz-789/view?embed',
      kind: 'presentation',
    });
  });

  it('opens other links in a new tab and refuses anything but https', () => {
    expect(materialEmbed('https://example.com/guia.PDF')).toEqual({
      provider: 'pdf',
      embedUrl: null,
      thumbnailUrl: null,
      kind: 'document',
    });
    expect(materialEmbed('https://www.investing.com/')).toMatchObject({
      provider: 'web',
      kind: 'link',
    });
    expect(materialEmbed('http://example.com/video')).toBeNull();
    expect(materialEmbed('javascript:alert(1)')).toBeNull();
    expect(materialEmbed('no es un enlace')).toBeNull();
    expect(httpsUrl('  https://indab.test/a  ')?.hostname).toBe('indab.test');
  });
});

describe('groupByCategory', () => {
  const item = (id: string, category: string, ms: number): Material =>
    ({ id, category, createdAt: Timestamp.fromMillis(ms) }) as Material;

  it('sorts categories by name, uncategorized last, newest first inside each', () => {
    const groups = groupByCategory([
      item('a', 'Psicología', 1),
      item('b', '', 2),
      item('c', 'Gestión de riesgo', 3),
      item('d', 'Psicología', 4),
    ]);
    expect(groups.map((g) => [g.category, g.items.map((i) => i.id)])).toEqual([
      ['Gestión de riesgo', ['c']],
      ['Psicología', ['d', 'a']],
      ['', ['b']],
    ]);
  });
});
