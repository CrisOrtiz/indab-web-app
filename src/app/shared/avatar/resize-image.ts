/** Side, in pixels, of the square profile photo we store. */
export const PHOTO_SIZE = 192;

/** Longest `data:` URL we store; `firestore.rules` accepts up to 100,000 characters. */
export const MAX_PHOTO_LENGTH = 90_000;

/** Biggest file we try to read; phones take 5-15 MB photos. */
export const MAX_PHOTO_FILE_BYTES = 20 * 1024 * 1024;

export class PhotoError extends Error {
  constructor(readonly reason: 'notImage' | 'tooBig' | 'unreadable') {
    super(reason);
  }
}

/**
 * Crops an image file to its centre square and shrinks it to a `PHOTO_SIZE` JPEG `data:` URL
 * (about 10-20 KB), small enough to keep inside the user's Firestore profile.
 */
export async function resizeImage(file: File, size = PHOTO_SIZE): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new PhotoError('notImage');
  }
  if (file.size > MAX_PHOTO_FILE_BYTES) {
    throw new PhotoError('tooBig');
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // e.g. HEIC photos, which most browsers cannot decode.
    throw new PhotoError('unreadable');
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context || side === 0) {
      throw new PhotoError('unreadable');
    }
    // JPEG has no transparency: paint transparent PNGs on white, like the site.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    for (const quality of [0.85, 0.7, 0.5]) {
      const url = canvas.toDataURL('image/jpeg', quality);
      if (url.length <= MAX_PHOTO_LENGTH) {
        return url;
      }
    }
    throw new PhotoError('tooBig');
  } finally {
    bitmap.close();
  }
}
