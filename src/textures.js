import * as THREE from 'three';

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let glowTex, glintTex, puffTex, dotTex;

export function glowTexture() {
  return (glowTex ||= canvasTex(64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  }));
}

export function glintTexture() {
  return (glintTex ||= canvasTex(128, (g, s) => {
    const c = s / 2;
    const r = g.createRadialGradient(c, c, 0, c, c, c);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.08, 'rgba(255,250,235,0.95)');
    r.addColorStop(0.3, 'rgba(255,230,200,0.25)');
    r.addColorStop(1, 'rgba(255,220,200,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    const ray = (ang, len, w) => {
      g.save();
      g.translate(c, c);
      g.rotate(ang);
      const lg = g.createLinearGradient(-len, 0, len, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.fillRect(-len, -w / 2, len * 2, w);
      g.restore();
    };
    ray(0, c, 3);
    ray(Math.PI / 2, c * 0.7, 2.5);
    ray(Math.PI / 4, c * 0.35, 1.5);
    ray(-Math.PI / 4, c * 0.35, 1.5);
  }));
}

export function puffTexture() {
  return (puffTex ||= canvasTex(64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,0.9)');
    r.addColorStop(0.5, 'rgba(255,255,255,0.4)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    g.fill();
  }));
}

export function dotTexture() {
  return (dotTex ||= canvasTex(32, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  }));
}
