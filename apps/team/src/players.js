// Manhattan SC Independiente - Male U9 (WYSL Fall 2026).
//
// `slug` doubles as the photo filename: public/photos/<slug>.jpg
// `last` is reference data - it backs the slugs and identifies who each kid
// actually is - but it is never shown in the app; cards and choice buttons are
// first name only.
// `inDeck: false` keeps a player on the roster but out of the quiz.
export const PLAYERS = [
  { slug: 'raphael-cheney', first: 'Raphael', last: 'Cheney', inDeck: true },
  { slug: 'luca-del-rio', first: 'Luca', last: 'Del Rio', inDeck: true },
  { slug: 'ethan-eisner', first: 'Ethan', last: 'Eisner', inDeck: true },
  { slug: 'daniel-galebach', first: 'Daniel', last: 'Galebach', inDeck: true },
  { slug: 'dylan-hersch', first: 'Dylan', last: 'Hersch', inDeck: true },
  { slug: 'isa-jafri', first: 'Isa', last: 'Jafri', inDeck: true },
  { slug: 'naadir-khan', first: 'Naadir', last: 'Khan', inDeck: true },
  { slug: 'oliver-mank', first: 'Oliver', last: 'Mank', inDeck: true },
  { slug: 'levi-resnick', first: 'Levi', last: 'Resnick', inDeck: true },
  { slug: 'leo-rubinstein', first: 'Leo', last: 'Rubinstein', inDeck: true },
  { slug: 'sam-saliterman', first: 'Sam', last: 'Saliterman', inDeck: true },
  { slug: 'jamie-sporn', first: 'Jamie', last: 'Sporn', inDeck: true },
  { slug: 'ethan-waldman', first: 'Ethan', last: 'Waldman', inDeck: true },
];

// The players actually quizzed, in roster order. Shuffled per round.
export const DECK = PLAYERS.filter((player) => player.inDeck);

// The one place that decides how a name is written: first name only, for
// everybody, always. The revealed answer and the multiple-choice buttons both
// go through here, so a choice button can never say something the answer would
// not - including for the two Ethans, who simply both read "Ethan".
export function displayName(player) {
  return player.first;
}
