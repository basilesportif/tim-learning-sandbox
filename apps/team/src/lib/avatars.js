// Placeholder avatars, used until a real photo exists for a player.
//
// No image files are involved: the tile is plain CSS with the player's first
// initial on a color picked deterministically from the slug, so a given player
// always gets the same color on every device and every reload.

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

export function avatarPalette(slug) {
  let hash = 0;

  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }

  return PALETTE[hash % PALETTE.length];
}

// Photos are dropped into public/photos/<slug>.jpg. BASE_URL keeps this
// correct under the app's /team/ base without hardcoding the app name.
export function photoUrl(slug) {
  return `${import.meta.env.BASE_URL}photos/${slug}.jpg`;
}
