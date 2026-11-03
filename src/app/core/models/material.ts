import { Timestamp } from 'firebase/firestore';

/** What a piece of study material is, for its badge and the students' filter. */
export type MaterialKind = 'video' | 'presentation' | 'document' | 'link';

export const MATERIAL_KINDS: readonly MaterialKind[] = [
  'video',
  'presentation',
  'document',
  'link',
];

/**
 * Who sees a piece of material: every student with academy access, or the ones in `studentIds`
 * plus the members of `mentorshipIds`.
 */
export type MaterialAudience = 'all' | 'selected';

/**
 * Stored at `materials/{id}`: a video, presentation, document or link in the academy's study
 * material, set up by a trainer or admin at `/admin/material`. Files are not uploaded (Firebase
 * Storage needs the paid Blaze plan): `url` points to where they already live, such as an
 * unlisted YouTube video, a Google Slides deck or a PDF in Google Drive, and the app embeds it
 * when it knows the site (`materialEmbed`).
 */
export interface Material {
  id: string;
  title: string;
  description: string;
  kind: MaterialKind;
  /** https link to the video, presentation or file. */
  url: string;
  /** Free text that groups the material on the students' page (e.g. "Gestión de riesgo"). */
  category: string;
  audience: MaterialAudience;
  studentIds: string[];
  mentorshipIds: string[];
  /** Drafts are hidden from students. */
  published: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Sites whose links the app shows inside the page. */
export type MaterialProvider =
  'youtube' | 'vimeo' | 'drive' | 'slides' | 'docs' | 'canva' | 'pdf' | 'web';

export interface MaterialEmbed {
  provider: MaterialProvider;
  /** Address for an iframe, or null when the link can only be opened in a new tab. */
  embedUrl: string | null;
  /** A preview picture (YouTube only), or null. */
  thumbnailUrl: string | null;
  /** The kind this link most likely is, to fill in the form. */
  kind: MaterialKind;
}

/** Longest link the rules accept. */
export const MAX_MATERIAL_URL = 1000;

const YOUTUBE_ID = /^[\w-]{11}$/;
const DRIVE_ID = /^[\w-]{10,}$/;

/** The URL when `value` is an https link, otherwise null. */
export function httpsUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname.includes('.') ? url : null;
  } catch {
    return null;
  }
}

/** YouTube's `t` (90, 90s, 1m30s) in seconds, or 0. */
function startSeconds(value: string | null): number {
  if (!value) {
    return 0;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  return match
    ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
    : 0;
}

function youtube(url: URL): MaterialEmbed | null {
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = url.pathname.split('/');
    id =
      first === 'watch'
        ? url.searchParams.get('v')
        : ['embed', 'shorts', 'live'].includes(first)
          ? second
          : null;
    const list = url.searchParams.get('list');
    if (!id && first === 'playlist' && list && /^[\w-]+$/.test(list)) {
      return {
        provider: 'youtube',
        embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`,
        thumbnailUrl: null,
        kind: 'video',
      };
    }
  } else {
    return null;
  }
  if (!id || !YOUTUBE_ID.test(id)) {
    return { provider: 'youtube', embedUrl: null, thumbnailUrl: null, kind: 'video' };
  }
  const start = startSeconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return {
    provider: 'youtube',
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0${start ? `&start=${start}` : ''}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    kind: 'video',
  };
}

function vimeo(url: URL): MaterialEmbed | null {
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') {
    return null;
  }
  // vimeo.com/123456789, vimeo.com/123456789/abcdef (unlisted), player.vimeo.com/video/123?h=abc
  const parts = url.pathname.split('/').filter(Boolean);
  const at = parts.findIndex((p) => /^\d+$/.test(p));
  if (at < 0) {
    return { provider: 'vimeo', embedUrl: null, thumbnailUrl: null, kind: 'video' };
  }
  const hash = url.searchParams.get('h') ?? parts[at + 1] ?? null;
  const safeHash = hash && /^[\da-f]+$/i.test(hash) ? `?h=${hash}` : '';
  return {
    provider: 'vimeo',
    embedUrl: `https://player.vimeo.com/video/${parts[at]}${safeHash}`,
    thumbnailUrl: null,
    kind: 'video',
  };
}

function google(url: URL): MaterialEmbed | null {
  const host = url.hostname;
  const parts = url.pathname.split('/').filter(Boolean);
  if (host === 'drive.google.com') {
    // drive.google.com/file/d/ID/view, drive.google.com/open?id=ID
    const id = parts[0] === 'file' && parts[1] === 'd' ? parts[2] : url.searchParams.get('id');
    return {
      provider: 'drive',
      embedUrl: id && DRIVE_ID.test(id) ? `https://drive.google.com/file/d/${id}/preview` : null,
      thumbnailUrl: null,
      kind: 'document',
    };
  }
  if (host !== 'docs.google.com') {
    return null;
  }
  // docs.google.com/presentation/d/ID/edit, or a published deck: /presentation/d/e/ID/pub
  const [type, d, ...rest] = parts;
  if (d !== 'd') {
    return null;
  }
  const published = rest[0] === 'e';
  const id = published ? rest[1] : rest[0];
  const valid = !!id && DRIVE_ID.test(id);
  const base = `https://docs.google.com/${type}/d/${published ? 'e/' : ''}${id}`;
  if (type === 'presentation') {
    return {
      provider: 'slides',
      embedUrl: valid ? `${base}/embed` : null,
      thumbnailUrl: null,
      kind: 'presentation',
    };
  }
  if (type === 'document' || type === 'spreadsheets') {
    return {
      provider: 'docs',
      embedUrl: valid ? `${base}/${published ? 'pub?embedded=true' : 'preview'}` : null,
      thumbnailUrl: null,
      kind: 'document',
    };
  }
  return null;
}

function canva(url: URL): MaterialEmbed | null {
  if (url.hostname.replace(/^www\./, '') !== 'canva.com') {
    return null;
  }
  // canva.com/design/DESIGN_ID/SHARE_KEY/view (shared as "anyone with the link")
  const parts = url.pathname.split('/').filter(Boolean);
  const path = ['view', 'edit', 'watch'].includes(parts.at(-1) ?? '') ? parts.slice(0, -1) : parts;
  const ok = path[0] === 'design' && path.length >= 2 && path.every((p) => /^[\w-]+$/.test(p));
  return {
    provider: 'canva',
    embedUrl: ok ? `https://www.canva.com/${path.join('/')}/view?embed` : null,
    thumbnailUrl: null,
    kind: 'presentation',
  };
}

/**
 * How the app shows a material's link: inside the page for YouTube, Vimeo, Google Drive,
 * Slides, Docs and Canva (only from their own addresses, never the link as typed), or as a
 * link that opens in a new tab for anything else.
 */
export function materialEmbed(value: string): MaterialEmbed | null {
  const url = httpsUrl(value);
  if (!url) {
    return null;
  }
  const known = youtube(url) ?? vimeo(url) ?? google(url) ?? canva(url);
  if (known) {
    return known;
  }
  const pdf = url.pathname.toLowerCase().endsWith('.pdf');
  return {
    provider: pdf ? 'pdf' : 'web',
    embedUrl: null,
    thumbnailUrl: null,
    kind: pdf ? 'document' : 'link',
  };
}

/** Material in category groups (alphabetical, uncategorized last), newest first in each. */
export function groupByCategory(
  list: readonly Material[],
): { category: string; items: Material[] }[] {
  const groups = new Map<string, Material[]>();
  for (const m of [...list].sort(byNewest)) {
    const key = m.category.trim();
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b, 'es')))
    .map(([category, items]) => ({ category, items }));
}

export const byNewest = (a: Material, b: Material): number =>
  (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
