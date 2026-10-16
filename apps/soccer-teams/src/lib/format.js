// Display helpers for the answer side of the card.

// Approximate, kid-friendly population: "3.5 million", "846,000", "92,000".
// Millions keep one decimal (dropped when it is .0); everything else is
// rounded to the nearest thousand, or the nearest hundred below 10,000.
export function formatPopulation(value) {
  if (!Number.isFinite(value) || value <= 0) return '';

  if (value >= 999_500) {
    const millions = Math.round(value / 100_000) / 10;
    return `${millions.toLocaleString('en-US', { maximumFractionDigits: 1 })} million`;
  }

  const step = value >= 10_000 ? 1_000 : 100;
  return (Math.round(value / step) * step).toLocaleString('en-US');
}

// "RS" for Real Sociedad, "A" for Atalanta: the fallback crest badge.
export function initials(name) {
  return name
    .split(/[\s-]+/)
    .filter((word) => /^\p{Lu}/u.test(word))
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('') || name.charAt(0).toUpperCase();
}

// "INE Padrón municipal, 1 Jan 2025 (via Wikidata Q2807 P1082)" ->
// "INE Padrón municipal, 1 Jan 2025": the per-city detail stays in DATA.md.
export function sourceLabel(populationSource) {
  return populationSource.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// [background, ink] pairs, all high contrast against each other.
const PALETTE = [
  ['#f97316', '#3b1503'],
  ['#38bdf8', '#04293d'],
  ['#a3e635', '#1d2c05'],
  ['#f472b6', '#4a0f2c'],
  ['#facc15', '#3d2f02'],
  ['#818cf8', '#131a4d'],
  ['#2dd4bf', '#03312c'],
  ['#fb7185', '#4c0519'],
];

export function badgePalette(slug) {
  let hash = 0;

  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }

  return PALETTE[hash % PALETTE.length];
}

// Rough time until the next review: "5 min", "3 hours", "12 days".
export function formatWait(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}
