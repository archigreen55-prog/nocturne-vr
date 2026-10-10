// W17 «Стиль»: how much ink line a part of the world gets (the `ink` vertex attribute, read by the style's
// shader in style/materials.js). Decided by the part's shape, so a new map gets lines without a word:
//   furniture, doors, the van (boxes)                     1
//   walls (tall and thin)                                 0.7
//   floors, rugs, slabs, ceilings (flat and wide)         0: a floor of lines is a grid
//   cylinders, spheres, cones, anything without UVs       0: their UV seams are not edges
export function inkWeight(geo) {
  if (!geo.attributes.uv) return 0;
  const p = geo.parameters || {};
  if (geo.type === 'BoxGeometry') {
    const { width: w, height: h, depth: d } = p;
    if (h < 0.08 && w * d > 0.5) return 0;
    if (h > 1.8 && Math.min(w, d) < 0.36 && Math.max(w, d) > 0.6) return 0.7;
    return 1;
  }
  return 0;
}
