// EXAMPLE TRANSITION — "RIPPLE CUT". A short, plain template that obeys the whole
// timeline contract (contract.js section 6); dev: true in the registry keeps it out of
// matches. Copy it to start a new transition.
//
//   Act 1 (WebGL layer): the old world, as a texture, ripples outward from the impact
//          point and burns to white.
//   Swap: on the white-out — the overlay is opaque, so the hitch of building the next
//          world is invisible.
//   Act 2 (2D layer): the white tears open as an iris around the centre, revealing the
//          LIVE new world underneath, under a title that names it.
import { seg, ease, clamp01, rand, pick, rgba, fitText, canvasTexture, fullscreenPass, COVER_UV_GLSL } from '../kit.js';

const FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tFrom;
  uniform vec2 uFocus;      // impact point, uv space (y up)
  uniform float uK;         // 0 → 1 over Act 1
  uniform float uAspect, uFreq, uTwist;
  uniform vec3 uTint;
  void main() {
    vec2 d = vUv - uFocus;
    d.x *= uAspect;
    float r = length(d);
    // A ring that travels outward and drags the picture with it. At uK = 0 nothing moves,
    // so the first frame is exactly the old world.
    float wave = sin(r * uFreq - uK * 26.0) * exp(-abs(r - uK * 1.4) * 5.0);
    float ang = uTwist * uK * uK * exp(-r * 2.0);
    vec2 dir = r > 1e-4 ? d / r : vec2(0.0);
    vec2 off = dir * wave * 0.06 * uK + vec2(-d.y, d.x) * ang;
    off.x /= uAspect;
    vec2 uv = vUv + off;
    float ca = 0.012 * uK * uK;
    vec3 c = vec3(texture2D(tFrom, uv + off * ca * 40.0).r, texture2D(tFrom, uv).g, texture2D(tFrom, uv - off * ca * 40.0).b);
    c = mix(c, uTint, smoothstep(0.55, 0.9, uK) * 0.5);
    c = mix(c, vec3(1.0), smoothstep(0.72, 1.0, uK));
    gl_FragColor = vec4(c, 1.0);
  }`;

export default {
  id: 'example',
  name: 'RIPPLE CUT',
  duration: 7,
  swapAt: 0.5,

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    // srgb: false — the shader writes the texels straight back out, so they must come in
    // un-decoded or the first frame would be darker than the gameplay frame it replaces.
    const tex = canvasTexture(THREE, ctx.fromImage, { srgb: false });
    const tint = new THREE.Color(ctx.winner ? ctx.winner.color : ctx.to.palette.accent);
    // Everything random comes from ctx.rng, decided once, so both clients see the same film.
    const pass = fullscreenPass(THREE, {
      fragmentShader: FRAG,
      uniforms: {
        tFrom: { value: tex },
        uFocus: { value: new THREE.Vector2(ctx.focus.x / ctx.width, 1 - ctx.focus.y / ctx.height) },
        uK: { value: 0 },
        uAspect: { value: ctx.width / ctx.height },
        uFreq: { value: rand(ctx.rng, 28, 60) },
        uTwist: { value: rand(ctx.rng, -3, 3) },
        uTint: { value: new THREE.Vector3(tint.r, tint.g, tint.b) },
      },
    });
    const verb = pick(ctx.rng, ['ENTERING', 'FALLING INTO', 'NOW ARRIVING AT', 'REALITY RE-FORMS AS']);
    const swapT = this.duration * this.swapAt, D = this.duration;
    let cues = 0;

    return {
      update(dt, t) {
        // Sound cues are one-shots keyed to the timeline (each fires once as t passes it).
        if (cues === 0 && t >= 0) { cues = 1; ctx.audio.sfx('riser', { gain: 0.8 }); }
        if (cues === 1 && t >= swapT - 0.05) { cues = 2; ctx.audio.sfx('boom'); }
        if (cues === 2 && t >= swapT + 0.5) { cues = 3; ctx.audio.sfx('chime', { delay: 0.2 }); }
      },

      render(t) {
        const g = ctx.g, w = ctx.width, h = ctx.height;
        if (t < swapT) {
          pass.uniforms.uK.value = ease.inCubic(seg(t, 0, swapT));
          pass.uniforms.uAspect.value = w / h;
          pass.render(renderer);
          return;
        }
        renderer.clear(); // Act 2 is drawn on the 2D layer only: leave the GL layer transparent
        const k = seg(t, swapT + 0.35, D); // hold the white a moment: the swap may hitch
        const R = Math.hypot(w, h) * 0.5;
        g.fillStyle = '#fff';
        g.fillRect(0, 0, w, h);
        if (ctx.toImage && k > 0) {
          // Punch the iris: transparent pixels show the live world under the overlay.
          g.globalCompositeOperation = 'destination-out';
          const r = ease.inOutCubic(k) * (R + 80); // past the corners, so the last frame is fully clear
          const grad = g.createRadialGradient(w / 2, h / 2, Math.max(0, r - 60), w / 2, h / 2, r + 1);
          grad.addColorStop(0, 'rgba(0,0,0,1)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = grad;
          g.beginPath();
          g.arc(w / 2, h / 2, r + 1, 0, Math.PI * 2);
          g.fill();
          g.globalCompositeOperation = 'source-over';
        }
        // Title: names the destination, fades before the end so the last frame is clean.
        const a = clamp01(seg(t, swapT + 0.1, swapT + 0.6)) * (1 - seg(t, D - 1.1, D - 0.4));
        if (a > 0) {
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = rgba('#0a0b12', a);
          g.font = `600 ${Math.max(11, w * 0.012)}px 'JetBrains Mono', monospace`;
          g.fillText(`${verb} · ${ctx.to.perspective}`, w / 2, h * 0.5 - w * 0.06);
          fitText(g, ctx.to.name, w * 0.86, w * 0.1, `'Rajdhani', sans-serif`);
          g.font = '700 ' + g.font;
          g.fillStyle = rgba(ctx.to.palette.accent, a);
          g.fillText(ctx.to.name, w / 2 + 3, h * 0.5 + 3);
          g.fillStyle = rgba('#0a0b12', a);
          g.fillText(ctx.to.name, w / 2, h * 0.5);
        }
      },

      dispose() {
        tex.dispose();
        pass.dispose();
      },
    };
  },
};
