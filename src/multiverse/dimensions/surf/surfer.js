// BREAK POINT — the two riders. A sniper on a surfboard has no animation clips: every frame
// the joints are worked out from what the board and the rifle are doing (feet planted,
// hips over the board, chest squared to the aim, hands on the rifle, elbows and knees by
// two-bone IK) and a cylinder is laid between each pair. Dark wetsuit, a vest and a board in
// the player's colour that glow a little, so both read against a low sun.
import { clamp, lerp, angDiff, mixHex } from '../../kit.js';
import { HAZE_GLSL } from './sky.js';

// Every lit material in this world fades into the same haze as the sea, and can carry a rim light.
export function makeHaze(THREE) {
  const shared = { uSunView: { value: new THREE.Vector3(0, 0, -1) } };
  const mats = [];
  return {
    shared, mats,
    patch(mat, rim) {
      const uRim = { value: new THREE.Color(rim || 0) };
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uSunView = shared.uSunView;
        sh.uniforms.uRim = uRim;
        sh.fragmentShader = 'uniform vec3 uSunView;\nuniform vec3 uRim;\n' + HAZE_GLSL + sh.fragmentShader.replace('#include <fog_fragment>', `
          vec3 hzV = normalize(vViewPosition);
          gl_FragColor.rgb += uRim * pow(1.0 - clamp(dot(normal, hzV), 0.0, 1.0), 2.5);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor(-hzV, uSunView), 1.0 - exp(-length(vViewPosition) * 0.0012));`);
      };
      mat.customProgramCacheKey = () => 'surf-haze';
      mats.push(mat);
      return mat;
    },
  };
}

const L1 = 0.5, L2 = 0.52, A1 = 0.34, A2 = 0.33; // thigh, shin, upper arm, forearm

export function makeSurferKit(THREE, haze) {
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1), ball = new THREE.SphereGeometry(1, 12, 8), box = new THREE.BoxGeometry(1, 1, 1);
  // The board: a long pointed lozenge, flat on top.
  const boardGeo = (() => {
    const s = new THREE.Shape(), n = 18;
    for (let i = 0; i <= n; i++) {
      const u = i / n, z = -1.45 + u * 2.9, w = 0.36 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.62) * (u > 0.92 ? 0.85 : 1);
      if (i === 0) s.moveTo(0.0001, z); else s.lineTo(w, z);
    }
    for (let i = n; i >= 0; i--) {
      const u = i / n, z = -1.45 + u * 2.9, w = 0.36 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.62) * (u > 0.92 ? 0.85 : 1);
      s.lineTo(-w, z);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    g.rotateX(Math.PI / 2); // shape (x, z) → lying flat
    g.translate(0, 0.09, 0);
    return g;
  })();
  const stripeGeo = new THREE.BoxGeometry(0.09, 0.012, 2.3), finGeo = new THREE.ConeGeometry(0.1, 0.28, 4);
  const suit = haze.patch(new THREE.MeshLambertMaterial({ color: '#141c28' }), '#3a2a22');
  const skin = haze.patch(new THREE.MeshLambertMaterial({ color: '#c98a5e' }));
  const gun = haze.patch(new THREE.MeshLambertMaterial({ color: '#0e0f13' }), '#6a4a30');
  const cream = haze.patch(new THREE.MeshLambertMaterial({ color: '#fff0d8', emissive: '#fff0d8', emissiveIntensity: 0.25 }));
  const own = [];
  const UP = new THREE.Vector3(0, 1, 0), v0 = new THREE.Vector3(), v1 = new THREE.Vector3();

  function surfer(color) {
    const bright = haze.patch(new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.7 }), mixHex(color, '#ffffff', 0.3));
    const deepC = haze.patch(new THREE.MeshLambertMaterial({ color: mixHex(color, '#101820', 0.35), emissive: color, emissiveIntensity: 0.3 }));
    own.push(bright, deepC);
    const root = new THREE.Group(), board = new THREE.Group(), body = new THREE.Group();
    root.add(board, body);
    const deck = new THREE.Mesh(boardGeo, bright), stripe = new THREE.Mesh(stripeGeo, cream);
    stripe.position.set(0, 0.165, 0);
    board.add(deck, stripe);
    for (const sx of [-0.2, 0, 0.2]) { const f = new THREE.Mesh(finGeo, deepC); f.position.set(sx, -0.08, 1.1); f.rotation.x = Math.PI; f.scale.z = 0.3; board.add(f); }
    const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); body.add(m); return m; };
    const limbs = { thighF: mk(cyl, suit), shinF: mk(cyl, suit), thighB: mk(cyl, suit), shinB: mk(cyl, suit), armR: mk(cyl, suit), foreR: mk(cyl, bright), armL: mk(cyl, suit), foreL: mk(cyl, bright), torso: mk(cyl, bright), neck: mk(cyl, skin) };
    const balls = { hip: mk(ball, suit), kneeF: mk(ball, suit), kneeB: mk(ball, suit), footF: mk(ball, suit), footB: mk(ball, suit), shR: mk(ball, bright), shL: mk(ball, bright), elR: mk(ball, suit), elL: mk(ball, suit), haR: mk(ball, skin), haL: mk(ball, skin), head: mk(ball, skin), chest: mk(ball, bright) };
    const hat = new THREE.Group();
    const crown = new THREE.Mesh(cyl, bright), brim = new THREE.Mesh(cyl, bright);
    crown.scale.set(0.165, 0.13, 0.165); crown.position.y = 0.1;
    brim.scale.set(0.27, 0.025, 0.27); brim.position.y = 0.04;
    hat.add(crown, brim);
    body.add(hat);
    const rifle = new THREE.Group();
    const rb = new THREE.Mesh(box, gun), barrel = new THREE.Mesh(cyl, gun), scope = new THREE.Mesh(cyl, gun), band = new THREE.Mesh(box, bright);
    rb.scale.set(0.06, 0.11, 0.7); rb.position.set(0, -0.02, -0.3);
    barrel.scale.set(0.02, 0.75, 0.02); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.98);
    scope.scale.set(0.035, 0.3, 0.035); scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.09, -0.36);
    band.scale.set(0.066, 0.05, 0.12); band.position.set(0, -0.02, -0.52);
    rifle.add(rb, barrel, scope, band);
    body.add(rifle);

    const J = {}; // joints, in board space
    for (const k of ['hip', 'chest', 'head', 'footF', 'footB', 'kneeF', 'kneeB', 'shR', 'shL', 'haR', 'haL', 'elR', 'elL', 'butt', 'aim', 'right', 'pole']) J[k] = new THREE.Vector3();
    function lay(m, a, b, r, rz) {
      v0.subVectors(b, a);
      const len = v0.length() || 1e-4;
      m.position.addVectors(a, b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(UP, v0.multiplyScalar(1 / len));
      m.scale.set(r, len, rz || r);
    }
    function ik(a, b, l1, l2, pole, out) {
      v0.subVectors(b, a);
      const d = clamp(v0.length(), 0.05, l1 + l2 - 0.005), x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
      v0.normalize();
      v1.copy(pole).addScaledVector(v0, -pole.dot(v0)).normalize();
      out.copy(a).addScaledVector(v0, x).addScaledVector(v1, h);
    }
    const st = { muzzle: new THREE.Vector3(), scope: new THREE.Vector3() };

    // p: a sniper from game.js. Everything here is presentation.
    function update(p, sea, T) {
      const dead = p.dead >= 0, k = dead ? 0 : p.brace, splay = dead ? Math.min(1, p.dead * 6) : 0;
      // ---- the board ----
      if (dead) {
        board.position.set(p.brd.x, p.brd.y, p.brd.z);
        board.rotation.set(p.brd.rot, p.hd, p.brd.rot * 0.37, 'YXZ');
        board.visible = !p.brd.wet;
        body.position.set(p.body.x, p.body.y - 0.9, p.body.z);
        body.rotation.set(p.body.rot, p.hd + p.body.rot * 0.21, 0, 'YXZ');
        body.visible = !p.body.wet;
      } else {
        const sx = Math.cos(p.hd), sz = -Math.sin(p.hd);
        const cross = p.air || p.dive > 0 ? 0 : sea.slope(p.x, p.z, sx, sz);
        let y = p.y, pitch = Math.atan(p.air ? clamp(p.vy * 0.06, -0.5, 0.5) : p.slope), roll = Math.atan(cross) * 0.8 + p.lean;
        if (p.dive > 0) { const u = 1 - p.dive / 1.05; y -= Math.sin(Math.PI * u) * 2.4; pitch = Math.cos(Math.PI * u) * -1.0; }
        board.position.set(p.x, y, p.z);
        board.rotation.set(pitch, p.hd, roll, 'YXZ');
        board.visible = body.visible = true;
        body.position.copy(board.position);
        body.rotation.set(pitch * 0.5, p.hd, roll * 0.7 + p.lean * 0.5, 'YXZ');
      }
      // ---- joints ----
      const rel = dead ? 0 : angDiff(p.hd, p.yaw), pt = dead ? 0 : clamp(p.pitch + p.swayY, -0.7, 0.7) - (1 - k) * 0.22 + p.recoil * 0.1;
      const cp = Math.cos(pt), a = J.aim.set(-Math.sin(rel) * cp, Math.sin(pt), -Math.cos(rel) * cp), r = J.right.set(Math.cos(rel), 0, -Math.sin(rel));
      const ride = dead ? 0 : Math.min(1, p.v / 10), bob = dead ? 0 : Math.sin(T * 2.2 + p.i * 2) * 0.012;
      const hipY = lerp(0.86 - 0.1 * ride - (p.air ? 0.12 : 0), 0.5, k) + bob;
      J.hip.set(p.lean * -0.12, hipY, 0.03);
      J.footF.set(0.02, 0.2, lerp(-0.42, -0.46, k)).lerp(v0.set(0.35, 0.3, -0.75), splay);
      J.footB.set(-0.02, 0.2, lerp(0.46, 0.82, k)).lerp(v0.set(-0.35, 0.3, 0.75), splay);
      if (dead) J.hip.y = 0.9;
      J.chest.copy(J.hip).addScaledVector(a, 0.1 + 0.08 * k); J.chest.y += 0.45 - 0.03 * ride;
      J.head.copy(J.chest).addScaledVector(a, 0.07); J.head.y += 0.36;
      // knees: front bends towards the aim, back one drops to the deck when braced
      ik(J.hip, J.footF, L1, L2, J.pole.set(a.x * 0.6 + 0.3, 0.2, a.z * 0.6 - 0.5), J.kneeF);
      ik(J.hip, J.footB, L1, L2, J.pole.set(a.x * 0.4 - 0.2, 0.25 - k * 1.2, 0.6), J.kneeB);
      if (k > 0.02) J.kneeB.y = lerp(J.kneeB.y, 0.24, k);
      J.shR.copy(J.chest).addScaledVector(r, 0.2); J.shR.y += 0.12;
      J.shL.copy(J.chest).addScaledVector(r, -0.2); J.shL.y += 0.12;
      // the rifle: low across the body while riding, up into the shoulder when braced
      J.butt.copy(J.shR).addScaledVector(r, -0.07).addScaledVector(a, 0.1 - p.recoil * 0.1); J.butt.y -= 0.04 + (1 - k) * 0.13;
      J.haR.copy(J.butt).addScaledVector(a, 0.26); J.haR.y -= 0.07;
      J.haL.copy(J.butt).addScaledVector(a, 0.66); J.haL.y -= 0.05;
      if (dead) { J.haR.copy(J.shR).addScaledVector(r, 0.6 * splay); J.haR.y += 0.2; J.haL.copy(J.shL).addScaledVector(r, -0.6 * splay); J.haL.y += 0.2; }
      ik(J.shR, J.haR, A1, A2, J.pole.set(r.x * 0.7, -0.8, r.z * 0.7), J.elR);
      ik(J.shL, J.haL, A1, A2, J.pole.set(-r.x * 0.5, -0.9, -r.z * 0.5), J.elL);
      // ---- lay the meshes ----
      lay(limbs.thighF, J.hip, J.kneeF, 0.11); lay(limbs.shinF, J.kneeF, J.footF, 0.085);
      lay(limbs.thighB, J.hip, J.kneeB, 0.11); lay(limbs.shinB, J.kneeB, J.footB, 0.085);
      lay(limbs.armR, J.shR, J.elR, 0.075); lay(limbs.foreR, J.elR, J.haR, 0.062);
      lay(limbs.armL, J.shL, J.elL, 0.075); lay(limbs.foreL, J.elL, J.haL, 0.062);
      lay(limbs.torso, J.hip, J.chest, 0.2); lay(limbs.neck, J.chest, J.head, 0.07);
      const put = (m, j, s) => { m.position.copy(j); m.scale.setScalar(s); };
      put(balls.hip, J.hip, 0.2); put(balls.chest, J.chest, 0.23); put(balls.kneeF, J.kneeF, 0.11); put(balls.kneeB, J.kneeB, 0.11);
      put(balls.footF, J.footF, 0.1); put(balls.footB, J.footB, 0.1); balls.footF.scale.z = balls.footB.scale.z = 0.16;
      put(balls.shR, J.shR, 0.1); put(balls.shL, J.shL, 0.1); put(balls.elR, J.elR, 0.075); put(balls.elL, J.elL, 0.075);
      put(balls.haR, J.haR, 0.065); put(balls.haL, J.haL, 0.065); put(balls.head, J.head, 0.165);
      hat.position.copy(J.head);
      hat.rotation.set(-pt * 0.5, Math.atan2(-a.x, -a.z), 0, 'YXZ');
      rifle.visible = !dead || p.dead < 0.05;
      rifle.position.copy(J.butt);
      rifle.rotation.set(pt, Math.atan2(-a.x, -a.z), 0, 'YXZ');
      body.updateMatrixWorld(true);
      st.muzzle.copy(J.butt).addScaledVector(a, 1.38).applyMatrix4(body.matrixWorld);
      st.scope.copy(J.butt).addScaledVector(a, 0.55); st.scope.y += 0.09; st.scope.applyMatrix4(body.matrixWorld);
    }
    return { root, board, body, update, st };
  }

  return {
    surfer,
    dispose() { for (const g of [cyl, ball, box, boardGeo, stripeGeo, finGeo]) g.dispose(); for (const m of [suit, skin, gun, cream, ...own]) m.dispose(); },
  };
}
