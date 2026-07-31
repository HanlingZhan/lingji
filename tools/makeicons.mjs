// Generate PWA icons (192 / 512 / 180 apple-touch) for 灵记.
// Pure Node, no deps: draws a blue rounded-square with a white "L" bookmark + gold spark.
import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

const OUT = new URL('../assets/', import.meta.url);

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c & 1) ? (c >>> 1) ^ 0xEDB88320 : (c >>> 1);
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const cd = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cd), 0);
  return Buffer.concat([len, cd, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    // alpha blend over existing
    const fa = a / 255, ba = buf[i + 3] / 255;
    const oa = fa + ba * (1 - fa);
    if (oa <= 0) return;
    buf[i] = Math.round((r * fa + buf[i] * ba * (1 - fa)) / oa);
    buf[i + 1] = Math.round((g * fa + buf[i + 1] * ba * (1 - fa)) / oa);
    buf[i + 2] = Math.round((b * fa + buf[i + 2] * ba * (1 - fa)) / oa);
    buf[i + 3] = Math.round(oa * 255);
  };
  const S = size;
  const rad = S * 0.22;
  const inRound = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < rad && iy < rad) { const dx = rad - ix, dy = rad - iy; if (dx * dx + dy * dy > rad * rad) return false; }
    if (ix > S - rad && iy < rad) { const dx = ix - (S - rad), dy = rad - iy; if (dx * dx + dy * dy > rad * rad) return false; }
    if (ix < rad && iy > S - rad) { const dx = rad - ix, dy = iy - (S - rad); if (dx * dx + dy * dy > rad * rad) return false; }
    if (ix > S - rad && iy > S - rad) { const dx = ix - (S - rad), dy = iy - (S - rad); if (dx * dx + dy * dy > rad * rad) return false; }
    return true;
  };
  // background gradient #1565c0 -> #0d47a1
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inRound(x, y)) continue;
    const t = y / S;
    const r = Math.round(0x15 + (0x0d - 0x15) * t);
    const g = Math.round(0x65 + (0x47 - 0x65) * t);
    const b = Math.round(0xc0 + (0xa1 - 0xc0) * t);
    set(x, y, r, g, b, 255);
  }
  // white L bookmark
  const fillRect = (x0, y0, x1, y1, r, g, b) => {
    for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) set(x, y, r, g, b, 255);
  };
  fillRect(S * 0.24, S * 0.23, S * 0.42, S * 0.74, 255, 255, 255); // vertical
  fillRect(S * 0.24, S * 0.60, S * 0.64, S * 0.74, 255, 255, 255); // bottom
  // gold spark (4-point star)
  const cx = S * 0.70, cy = S * 0.30, R = S * 0.11, r = S * 0.035;
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const ang = -Math.PI / 2 + k * Math.PI / 4;
    const rr = (k % 2 === 0) ? R : r;
    pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]);
  }
  // scanline fill polygon
  let minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
  for (let y = Math.floor(minY); y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const x = x1 + (y - y1) / (y2 - y1) * (x2 - x1); xs.push(x);
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2)
      for (let x = Math.floor(xs[i]); x <= Math.ceil(xs[i + 1]); x++) set(x, y, 255, 202, 40, 255);
  }
  return encodePNG(size, size, buf);
}

for (const [s, name] of [[512, 'icon-512.png'], [192, 'icon-192.png'], [180, 'apple-touch-icon.png']]) {
  writeFileSync(new URL(name, OUT), draw(s));
  console.log('wrote', name, s + 'x' + s);
}
