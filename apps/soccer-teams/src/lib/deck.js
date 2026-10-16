// Round logic for the "What city is this team in?" flashcards. Pure functions
// only: every call returns a new round object and never mutates its input.
//
// A round is a queue of teams. The front of the queue is the card on screen.
// - "Got it" drops the card from the queue for good.
// - "Missed it" puts the card back a few places later, so it comes round again
//   soon, and remembers it in `missed` for the summary.
// The round is complete once the queue is empty, which means every team has
// been "Got it" exactly once.

export const COUNTRY_FILTERS = ['All', 'Spain', 'Italy'];

// How many other cards are shown before a missed card returns.
export const MISSED_GAP = 3;

// Fisher-Yates on a copy, so the caller's array is never mutated.
export function shuffle(items, random = Math.random) {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

export function filterTeams(teams, country = 'All') {
  if (!country || country === 'All') return [...teams];

  return teams.filter((team) => team.country === country);
}

// A fresh shuffled round for one country filter. `avoidFirstSlug` is the last
// card of the previous round: if it lands first again it swaps with a later
// card, so the same crest never shows twice in a row across rounds.
export function startRound(teams, country = 'All', { avoidFirstSlug = null, random = Math.random } = {}) {
  const queue = shuffle(filterTeams(teams, country), random);

  if (queue.length > 1 && avoidFirstSlug && queue[0].slug === avoidFirstSlug) {
    const swapWith = 1 + Math.floor(random() * (queue.length - 1));
    [queue[0], queue[swapWith]] = [queue[swapWith], queue[0]];
  }

  return {
    country,
    total: queue.length,
    queue,
    missed: [],
    lastSlug: null,
  };
}

export function currentCard(round) {
  return round.queue[0] ?? null;
}

export function isRoundComplete(round) {
  return round.queue.length === 0;
}

export function markGot(round) {
  const [card, ...rest] = round.queue;
  if (!card) return round;

  return { ...round, queue: rest, lastSlug: card.slug };
}

export function markMissed(round, gap = MISSED_GAP) {
  const [card, ...rest] = round.queue;
  if (!card) return round;

  const position = Math.min(gap, rest.length);
  const queue = [...rest.slice(0, position), card, ...rest.slice(position)];
  const missed = round.missed.some((team) => team.slug === card.slug)
    ? round.missed
    : [...round.missed, card];

  return { ...round, queue, missed, lastSlug: card.slug };
}
