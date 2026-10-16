// Map projection shared by the generated country outlines (src/data/maps.json,
// built by scripts/build-maps.mjs) and the UI, so team dots line up exactly.
//
// Each frame is a simple equirectangular projection with cos(lat0) scaling:
//   x = frame.x + (lon - lonMin) * cos(lat0) * scale
//   y = frame.y + (latMax - lat) * scale
// Coordinates are SVG user units inside the country's viewBox (y grows down).
//
// Spain's Canary Islands use a separate inset frame drawn in a box below
// Andalusia (standard practice); `project()` routes any Spanish point with
// lat < 30 into that inset.

const DEG = Math.PI / 180
export const SCALE = 60 // SVG units per degree of latitude

function frame({ lonMin, lonMax, latMin, latMax, lat0, x = 0, y = 0, scale = SCALE }) {
  const kx = Math.cos(lat0 * DEG) * scale
  return {
    lonMin, lonMax, latMin, latMax, lat0, x, y, scale,
    width: Math.round((lonMax - lonMin) * kx),
    height: Math.round((latMax - latMin) * scale),
  }
}

const spainMain = frame({ lonMin: -9.6, lonMax: 4.6, latMin: 35.7, latMax: 44.0, lat0: 40 })
const canaries = frame({
  lonMin: -18.4, lonMax: -13.2, latMin: 27.4, latMax: 29.5, lat0: 28.5,
  x: 6, y: spainMain.height + 8,
})
const italyMain = frame({ lonMin: 6.4, lonMax: 18.8, latMin: 35.3, latMax: 47.3, lat0: 42 })

export const PROJECTIONS = {
  Spain: {
    main: spainMain,
    insets: [{ id: 'canary-islands', name: 'Canary Islands', ...canaries, contains: (lat) => lat < 30 }],
    width: spainMain.width,
    height: canaries.y + canaries.height + 6,
  },
  Italy: {
    main: italyMain,
    insets: [],
    width: italyMain.width,
    height: italyMain.height,
  },
}

export function frameFor(country, lat) {
  const p = PROJECTIONS[country]
  if (!p) throw new Error(`Unknown country: ${country}`)
  return p.insets.find((inset) => inset.contains(lat)) || p.main
}

export function projectInFrame(f, lat, lon) {
  return {
    x: f.x + (lon - f.lonMin) * Math.cos(f.lat0 * DEG) * f.scale,
    y: f.y + (f.latMax - lat) * f.scale,
  }
}

/** Project a WGS84 point to SVG coordinates in the country's map viewBox. */
export function project(country, lat, lon) {
  return projectInFrame(frameFor(country, lat), lat, lon)
}
