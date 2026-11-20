// TOY BOX — modelling clay. Every toy is a handful of primitives baked into one geometry
// (one draw call per toy, colours in the vertices), so the room costs dozens of draws, not hundreds.

export function makeGeo(THREE) {
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const P = new THREE.Vector3(), S = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);

  class Bag {
    constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; }

    // Bake `geo` (consumed) in: o = { p:[x,y,z], r:[rx,ry,rz], s:number|[x,y,z], q:Quaternion, color, uv:[ox,oy,sx,sy] }.
    add(geo, o = {}) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      if (g !== geo) geo.dispose();
      const s = o.s === undefined ? 1 : o.s;
      P.set(...(o.p || [0, 0, 0]));
      if (typeof s === 'number') S.set(s, s, s); else S.set(...s);
      if (o.q) q.copy(o.q); else q.setFromEuler(e.set(...(o.r || [0, 0, 0])));
      m.compose(P, q, S);
      nm.getNormalMatrix(m);
      c.set(o.color === undefined ? '#ffffff' : o.color);
      const gp = g.attributes.position, gn = g.attributes.normal, gu = g.attributes.uv, t = o.uv;
      for (let i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i).applyMatrix4(m);
        this.pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize();
        this.nor.push(v.x, v.y, v.z);
        const ux = gu ? gu.getX(i) : 0, uy = gu ? gu.getY(i) : 0;
        if (t) this.uv.push(t[0] + ux * t[2], t[1] + uy * t[3]); else this.uv.push(ux, uy);
        this.col.push(c.r, c.g, c.b);
      }
      g.dispose();
      return this;
    }

    // A round bar from a to b (arrays), radius r0 at a and r1 at b, with a ball on each end.
    limb(a, b, r0, r1 = r0, color, balls = true) {
      v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = v.length();
      q.setFromUnitVectors(up, v.normalize());
      const qq = q.clone();
      this.add(new THREE.CylinderGeometry(r1, r0, len, 10, 1), { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], q: qq, color });
      if (balls) { this.add(new THREE.SphereGeometry(r0, 10, 8), { p: a, color }); this.add(new THREE.SphereGeometry(r1, 10, 8), { p: b, color }); }
      return this;
    }

    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      g.computeBoundingSphere();
      this.pos = this.nor = this.uv = this.col = null;
      return g;
    }
  }

  // A box with its edges rolled over — every wooden toy is one of these. Each face keeps the
  // plain 0..1 UVs of BoxGeometry, so a face can be pointed at a cell of an atlas.
  function rbox(w, h, d, r = 0.1, seg = 3) {
    const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal;
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const ix = Math.max(-hx, Math.min(hx, v.x)), iy = Math.max(-hy, Math.min(hy, v.y)), iz = Math.max(-hz, Math.min(hz, v.z));
      P.set(v.x - ix, v.y - iy, v.z - iz);
      if (P.lengthSq() < 1e-12) continue; // (a face's interior keeps its flat normal)
      P.normalize();
      p.setXYZ(i, ix + P.x * r, iy + P.y * r, iz + P.z * r);
      n.setXYZ(i, P.x, P.y, P.z);
    }
    return g;
  }

  // Point each face of a (non-indexed) box at a cell of a cols x rows atlas. cells: [+x, -x, +y, -y, +z, -z].
  function faceCells(g, cells, cols, rows) {
    const u = g.attributes.uv, per = u.count / 6;
    for (let f = 0; f < 6; f++) {
      const cx = cells[f] % cols, cy = Math.floor(cells[f] / cols);
      for (let i = f * per; i < (f + 1) * per; i++) u.setXY(i, (cx + u.getX(i)) / cols, 1 - (cy + 1 - u.getY(i)) / rows);
    }
    return g;
  }

  return {
    Bag, rbox, faceCells,
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    cyl: (rt, rb, h, seg = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
    ball: (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs),
    dome: (r, ws = 16, hs = 8) => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2),
    torus: (r, t, rs = 10, ts = 24) => new THREE.TorusGeometry(r, t, rs, ts),
    cone: (r, h, seg = 16) => new THREE.ConeGeometry(r, h, seg),
    lathe: (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg),
  };
}
