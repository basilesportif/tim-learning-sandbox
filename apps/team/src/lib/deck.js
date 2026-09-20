// Round building for the flashcard deck.

// Fisher-Yates on a copy, so the caller's array is never mutated.
export function shuffle(items) {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

// A round is every in-deck player exactly once, so nobody repeats until the
// whole team has been seen. `avoidFirstSlug` is the last card of the previous
// round: if it lands first again it gets swapped with a random later card, so
// the same face never shows twice in a row across a round boundary.
export function buildRound(players, avoidFirstSlug = null) {
  const round = shuffle(players);

  if (round.length > 1 && avoidFirstSlug && round[0].slug === avoidFirstSlug) {
    const swapWith = 1 + Math.floor(Math.random() * (round.length - 1));
    [round[0], round[swapWith]] = [round[swapWith], round[0]];
  }

  return round;
}

// The options for one multiple-choice card: the right answer plus distractors
// drawn from the rest of the team, all shuffled so the answer is not parked in
// the same slot every time. Distractors are real teammates rather than made-up
// names, which is what makes the question worth answering.
export function buildChoices(players, answer, count = 4) {
  const distractors = shuffle(players.filter((player) => player.slug !== answer.slug));

  return shuffle([answer, ...distractors.slice(0, Math.max(0, count - 1))]);
}
