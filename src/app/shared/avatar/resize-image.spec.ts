import { vi } from 'vitest';
import { MAX_PHOTO_LENGTH, PHOTO_SIZE, PhotoError, resizeImage } from './resize-image';

describe('resizeImage', () => {
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
  const close = vi.fn();
  let toDataURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 400, height: 300, close })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    toDataURL = vi.fn(() => 'data:image/jpeg;base64,AAAA');
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(toDataURL as never);
  });

  afterEach(() => vi.unstubAllGlobals());

  const file = (type = 'image/png', bytes = 10) =>
    new File([new Uint8Array(bytes)], 'photo', { type });

  it('crops the centre square into a small JPEG', async () => {
    expect(await resizeImage(file())).toBe('data:image/jpeg;base64,AAAA');
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      50,
      0,
      300,
      300,
      0,
      0,
      PHOTO_SIZE,
      PHOTO_SIZE,
    );
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
    expect(close).toHaveBeenCalled();
  });

  it('lowers the quality until the photo fits', async () => {
    toDataURL
      .mockReturnValueOnce('x'.repeat(MAX_PHOTO_LENGTH + 1))
      .mockReturnValueOnce('data:image/jpeg;base64,BBBB');
    expect(await resizeImage(file())).toBe('data:image/jpeg;base64,BBBB');
    expect(toDataURL).toHaveBeenLastCalledWith('image/jpeg', 0.7);
  });

  it('rejects files that are not images, too big or unreadable', async () => {
    await expect(resizeImage(file('application/pdf'))).rejects.toEqual(new PhotoError('notImage'));
    await expect(resizeImage(file('image/png', 21 * 1024 * 1024))).rejects.toMatchObject({
      reason: 'tooBig',
    });
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('HEIC'));
    await expect(resizeImage(file('image/heic'))).rejects.toMatchObject({ reason: 'unreadable' });
    toDataURL.mockReturnValue('x'.repeat(MAX_PHOTO_LENGTH + 1));
    await expect(resizeImage(file())).rejects.toMatchObject({ reason: 'tooBig' });
  });
});
