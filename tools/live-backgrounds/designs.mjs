/**
 * Virtual backgrounds for the live room (story 18.3), drawn as SVG: geometric patterns and
 * architecture with Muslim motifs, our own drawings (no photos, no calligraphy, no third-party
 * artwork). `render.mjs` turns them into the JPEG files the app ships.
 *
 * The centre of each picture stays calm, because the teacher stands in front of it.
 */

export const WIDTH = 1280;
export const HEIGHT = 720;

const round = (n) => Math.round(n * 100) / 100;

function svg(body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><defs>${defs}</defs>${body}</svg>`;
}

/** The eight-pointed star of two squares (khatam), as one outline around (cx, cy). */
function star(cx, cy, half) {
  const outer = half * Math.SQRT2;
  const inner = half / Math.cos(Math.PI / 8);
  const points = [];
  for (let i = 0; i < 16; i += 1) {
    const angle = (i * Math.PI) / 8;
    const r = i % 2 === 0 ? outer : inner;
    points.push(`${round(cx + r * Math.cos(angle))},${round(cy + r * Math.sin(angle))}`);
  }
  return points.join(' ');
}

/** Sterne: a tiling of eight-pointed stars on deep teal, with gold lines. */
function stars() {
  const tile = 160;
  const defs = `
    <radialGradient id="glow" cx="50%" cy="45%" r="70%">
      <stop offset="0" stop-color="#1d5a56"/>
      <stop offset="1" stop-color="#0b2b2a"/>
    </radialGradient>
    <radialGradient id="calm" cx="50%" cy="50%" r="45%">
      <stop offset="0" stop-color="#1a514d" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#1a514d" stop-opacity="0"/>
    </radialGradient>
    <pattern id="khatam" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse">
      <polygon points="${star(tile / 2, tile / 2, 40)}" fill="#174a47" stroke="#c9a253" stroke-opacity="0.55" stroke-width="3"/>
      <polygon points="${star(0, 0, 22)}" fill="#12403e" stroke="#c9a253" stroke-opacity="0.4" stroke-width="2"/>
      <polygon points="${star(tile, 0, 22)}" fill="#12403e" stroke="#c9a253" stroke-opacity="0.4" stroke-width="2"/>
      <polygon points="${star(0, tile, 22)}" fill="#12403e" stroke="#c9a253" stroke-opacity="0.4" stroke-width="2"/>
      <polygon points="${star(tile, tile, 22)}" fill="#12403e" stroke="#c9a253" stroke-opacity="0.4" stroke-width="2"/>
      <path d="M${tile / 2} 0V${tile / 2 - 52}M${tile / 2} ${tile}V${tile / 2 + 52}M0 ${tile / 2}H${tile / 2 - 52}M${tile} ${tile / 2}H${tile / 2 + 52}" stroke="#c9a253" stroke-opacity="0.3" stroke-width="2"/>
    </pattern>`;
  return svg(
    `<rect width="100%" height="100%" fill="url(#glow)"/>
     <rect width="100%" height="100%" fill="url(#khatam)" opacity="0.9"/>
     <rect width="100%" height="100%" fill="url(#calm)"/>`,
    defs
  );
}

/** One pointed (Moorish) arch opening from x0 to x0 + w, springing at ys, down to yb. */
function arch(x0, w, ys, yb) {
  const r = 0.8 * w;
  const apex = ys - Math.sqrt(r * r - (w / 2 - r) ** 2);
  const x1 = x0 + w;
  return `M${round(x0)} ${yb}V${ys}A${round(r)} ${round(r)} 0 0 1 ${round(x0 + w / 2)} ${round(apex)}A${round(r)} ${round(r)} 0 0 1 ${round(x1)} ${ys}V${yb}Z`;
}

/** Bögen: an arcade of pointed arches in warm sand, opening onto a soft evening sky. */
function arches() {
  const count = 5;
  const column = 56;
  const w = (WIDTH - column * (count + 1)) / count;
  const springing = 300;
  const floor = 600;
  const openings = Array.from({ length: count }, (_, i) =>
    arch(column + i * (w + column), w, springing, floor)
  ).join('');
  const defs = `
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ecdfc6"/>
      <stop offset="1" stop-color="#d8c19b"/>
    </linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b9d4e3"/>
      <stop offset="0.7" stop-color="#f3d7b6"/>
      <stop offset="1" stop-color="#e9b98c"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b98d5c"/>
      <stop offset="1" stop-color="#8c6339"/>
    </linearGradient>
    <pattern id="zellige" width="48" height="48" patternUnits="userSpaceOnUse">
      <rect width="48" height="48" fill="#2f6f6a"/>
      <polygon points="${star(24, 24, 12)}" fill="#e8d6b0"/>
    </pattern>`;
  return svg(
    `<rect width="100%" height="100%" fill="url(#sky)"/>
     <path d="M0 0H${WIDTH}V${floor}H0Z${openings}" fill="url(#wall)" fill-rule="evenodd"/>
     <path d="${openings}" fill="none" stroke="#b4935f" stroke-width="6"/>
     <rect y="${floor}" width="${WIDTH}" height="24" fill="url(#zellige)"/>
     <rect y="${floor + 24}" width="${WIDTH}" height="${HEIGHT - floor - 24}" fill="url(#floor)"/>
     <rect y="${floor - 6}" width="${WIDTH}" height="6" fill="#b4935f"/>`,
    defs
  );
}

/** A minaret: shaft, balcony and a pointed cap, standing on the ground line. */
function minaret(cx, ground, height, width) {
  const top = ground - height;
  const balcony = top + height * 0.28;
  return `<rect x="${cx - width / 2}" y="${top}" width="${width}" height="${height}"/>
    <rect x="${cx - width * 0.85}" y="${balcony}" width="${width * 1.7}" height="${width * 0.35}"/>
    <rect x="${cx - width * 0.35}" y="${top - width * 1.6}" width="${width * 0.7}" height="${width * 1.6}"/>
    <path d="M${cx - width * 0.55} ${top - width * 1.6}Q${cx} ${top - width * 2.2} ${cx} ${top - width * 4}Q${cx} ${top - width * 2.2} ${cx + width * 0.55} ${top - width * 1.6}Z"/>`;
}

/** A dome on a drum, standing on the ground line. */
function dome(cx, ground, radius, drum) {
  const base = ground - drum;
  return `<rect x="${cx - radius}" y="${base}" width="${radius * 2}" height="${drum}"/>
    <path d="M${cx - radius} ${base}C${cx - radius} ${base - radius * 1.1} ${cx - radius * 0.2} ${base - radius * 1.25} ${cx} ${base - radius * 1.55}C${cx + radius * 0.2} ${base - radius * 1.25} ${cx + radius} ${base - radius * 1.1} ${cx + radius} ${base}Z"/>
    <rect x="${cx - 2}" y="${base - radius * 1.55 - 26}" width="4" height="26"/>`;
}

/** Abend: a mosque skyline under the evening sky, with the crescent and the first stars. */
function mosque() {
  const ground = 640;
  const defs = `
    <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c2147"/>
      <stop offset="0.55" stop-color="#4a3a6b"/>
      <stop offset="0.85" stop-color="#c7758a"/>
      <stop offset="1" stop-color="#f0b27a"/>
    </linearGradient>
    <mask id="crescent">
      <rect width="100%" height="100%" fill="#000"/>
      <circle cx="1060" cy="130" r="46" fill="#fff"/>
      <circle cx="1080" cy="116" r="40" fill="#000"/>
    </mask>`;
  const sky = [
    [140, 90, 2.2],
    [260, 170, 1.6],
    [380, 70, 1.8],
    [520, 140, 1.4],
    [700, 60, 2],
    [860, 160, 1.5],
    [960, 60, 1.8],
    [1180, 220, 1.6],
    [80, 250, 1.4],
    [1220, 90, 2],
  ]
    .map(
      ([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#f6eedd" opacity="0.9"/>`
    )
    .join('');
  const skyline = `<g fill="#1b1830">
      <rect x="0" y="${ground}" width="${WIDTH}" height="${HEIGHT - ground}"/>
      <rect x="250" y="${ground - 70}" width="780" height="70"/>
      ${dome(640, ground - 70, 120, 60)}
      ${dome(420, ground - 70, 60, 34)}
      ${dome(860, ground - 70, 60, 34)}
      ${minaret(250, ground, 300, 26)}
      ${minaret(1030, ground, 300, 26)}
    </g>`;
  return svg(
    `<rect width="100%" height="100%" fill="url(#dusk)"/>
     ${sky}
     <rect width="100%" height="100%" fill="#f6eedd" mask="url(#crescent)"/>
     ${skyline}`,
    defs
  );
}

/** Maschrabiyya: a carved wooden lattice with warm light behind it. */
function lattice() {
  const tile = 96;
  const defs = `
    <radialGradient id="light" cx="50%" cy="45%" r="75%">
      <stop offset="0" stop-color="#fbe6bd"/>
      <stop offset="0.6" stop-color="#e3b26f"/>
      <stop offset="1" stop-color="#9a6533"/>
    </radialGradient>
    <pattern id="wood" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse">
      <g fill="none" stroke="#5b3a1d" stroke-width="9">
        <circle cx="0" cy="0" r="${tile / 2}"/>
        <circle cx="${tile}" cy="0" r="${tile / 2}"/>
        <circle cx="0" cy="${tile}" r="${tile / 2}"/>
        <circle cx="${tile}" cy="${tile}" r="${tile / 2}"/>
        <circle cx="${tile / 2}" cy="${tile / 2}" r="${tile / 2}"/>
      </g>
      <circle cx="${tile / 2}" cy="${tile / 2}" r="7" fill="#5b3a1d"/>
    </pattern>
    <linearGradient id="frame" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6e4724"/>
      <stop offset="1" stop-color="#4a2f16"/>
    </linearGradient>`;
  return svg(
    `<rect width="100%" height="100%" fill="url(#light)"/>
     <rect width="100%" height="100%" fill="url(#wood)" opacity="0.92"/>
     <path d="M0 0H${WIDTH}V${HEIGHT}H0Z M40 40V${HEIGHT - 40}H${WIDTH - 40}V40Z" fill="url(#frame)" fill-rule="evenodd"/>`,
    defs
  );
}

/** The backgrounds by id; the ids are the file names in apps/web/public/live/backgrounds. */
export const DESIGNS = { stars, arches, mosque, lattice };
