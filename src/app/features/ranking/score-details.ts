import type { Messages } from '../../core/i18n/messages/es';
import { MIN_TRADES } from './score';
import { ShownScore } from './standings';

/**
 * A score's parts and why it failed or is unrated, one per line, as its tooltip shows them;
 * null for a grade saved before scores had today's parts.
 */
export function scoreDetails(
  t: Messages['evaluations']['score'],
  score: ShownScore,
  format: (value: number) => string,
): string | null {
  const lines: string[] = [];
  if (score.parts) {
    const { result, risk, discipline, rubric, journal } = score.parts;
    lines.push(
      t.parts(
        format(result),
        format(risk),
        format(discipline),
        format(rubric),
        journal === undefined ? null : format(journal),
      ),
    );
  }
  if (score.failedBy.length) {
    lines.push(t.failedBecause(score.failedBy.map((rule) => t.failedBy[rule]).join(', ')));
  } else if (score.verdict === 'unrated') {
    lines.push(t.unratedHint(MIN_TRADES));
  }
  return lines.length ? lines.join('\n') : null;
}
