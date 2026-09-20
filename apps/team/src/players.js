// Manhattan SC Independiente - Male U9 (WYSL Fall 2026).
//
// `slug` doubles as the photo filename: public/photos/<slug>.jpg
// `inDeck: false` keeps a player on the roster but out of the quiz.
export const PLAYERS = [
  { slug: 'raphael-cheney', first: 'Raphael', last: 'Cheney', inDeck: true },
  { slug: 'luca-del-rio', first: 'Luca', last: 'Del Rio', inDeck: true },
  { slug: 'ethan-eisner', first: 'Ethan', last: 'Eisner', inDeck: true },
  // Daniel already knows his own name, so he stays on the roster but out of
  // the quiz. Flip `inDeck` to true to deal him in.
  { slug: 'daniel-galebach', first: 'Daniel', last: 'Galebach', inDeck: false },
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

// How many deck players share each first name. The team has two Ethans
// (Eisner and Waldman), so those cards must show a last name to be a fair
// question; everyone else is unambiguous on their first name alone.
const FIRST_NAME_COUNTS = DECK.reduce((counts, player) => {
  counts[player.first] = (counts[player.first] || 0) + 1;
  return counts;
}, {});

export function needsLastName(player) {
  return FIRST_NAME_COUNTS[player.first] > 1;
}
