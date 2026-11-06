import { Review, newestFirst, reviewProblem, shareablePhoto } from './review';

const at = (ms: number) => ({ toMillis: () => ms }) as unknown as Review['updatedAt'];

describe('reviews', () => {
  const input = {
    name: 'Ana P.',
    text: 'La mentoría me ayudó mucho a operar.',
    rating: 5,
    photoURL: null,
  };

  it('checks the rating, name and length of a review', () => {
    expect(reviewProblem(input)).toBeNull();
    expect(reviewProblem({ ...input, rating: 0 })).toBe('ratingRequired');
    expect(reviewProblem({ ...input, rating: 3.5 })).toBe('ratingRequired');
    expect(reviewProblem({ ...input, name: '  ' })).toBe('nameRequired');
    expect(reviewProblem({ ...input, text: '   muy bueno        ' })).toBe('textShort');
    expect(reviewProblem({ ...input, text: 'x'.repeat(601) })).toBe('textLong');
  });

  it('only shares photos the rules accept', () => {
    expect(shareablePhoto('data:image/jpeg;base64,AAAA')).toBe('data:image/jpeg;base64,AAAA');
    expect(shareablePhoto('https://lh3.googleusercontent.com/a/x')).toBe(
      'https://lh3.googleusercontent.com/a/x',
    );
    expect(shareablePhoto('https://example.com/me.jpg')).toBeNull();
    expect(shareablePhoto(`data:image/png;base64,${'A'.repeat(100_001)}`)).toBeNull();
    expect(shareablePhoto(null)).toBeNull();
  });

  it('sorts the newest first by the field asked for', () => {
    const list = [
      { id: 'a', featuredAt: at(1), updatedAt: at(3) },
      { id: 'b', featuredAt: at(2), updatedAt: at(1) },
      { id: 'c', featuredAt: null, updatedAt: at(2) },
    ] as Review[];
    expect(newestFirst(list, 'featuredAt').map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(newestFirst(list, 'updatedAt').map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });
});
