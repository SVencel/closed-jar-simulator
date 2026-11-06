/*
 * 3D view of one jar (Three.js, loaded from a CDN as a global `THREE`). It reads exactly the same `jar` object as the
 * 2D view: nothing here changes the simulation.
 *
 *   static parts  (rebuilt only when the jar's geometry or the cutaway option changes):
 *       glass, lid, soil and drainage layers with their cut faces, water volumes, window and sill
 *   dynamic parts (updated every frame):
 *       water levels, anoxic overlay, light and sky, condensation, lid, soil animals
 *   rebuilt when the biology changes visibly:
 *       plants (stems, leaves, moss mounds), roots, litter and mold
 *
 * Units: the jar is 1.9 wide (radius ~0.95) and 2.6 tall, y up, camera looks along -z.
 */
(function (root) {
  'use strict';
  const Terra = (root.Terra = root.Terra || {});
  const THREE = root.THREE;
  if (!THREE) { Terra.jar3d = { available: false }; return; }

  const JH = 2.6, JR = 0.95;                      // jar height and inner radius
  const opts = { cutaway: true, autorotate: false, fauna: true, roots: true };

  // ---------------------------------------------------------------- small helpers ----
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function mixN(a, b, t) { return a + (b - a) * t; }
  function mixC(a, b, t) { return [mixN(a[0], b[0], t), mixN(a[1], b[1], t), mixN(a[2], b[2], t)]; }
  function species(id) { return Terra.species[id] || Terra.species.generic; }
  function rng(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rgb255 = function (c) { return [c[0] / 255, c[1] / 255, c[2] / 255]; };
  function yellowing(pl) { let v = 0; for (const k in pl.st) if (k !== 'shade') v += pl.st[k]; return clamp(v * 40, 0, 1); }

  // Builds one vertex-coloured mesh out of tubes, leaf strips and spheres.
  function Builder() { this.pos = []; this.col = []; this.idx = []; this.n = 0; }
  Builder.prototype.vert = function (x, y, z, c) { this.pos.push(x, y, z); this.col.push(c[0], c[1], c[2]); return this.n++; };
  Builder.prototype.tri = function (a, b, c) { this.idx.push(a, b, c); };
  Builder.prototype.tube = function (p0, p1, r0, r1, c, sides) {
    sides = sides || 5;
    let dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const L = Math.hypot(dx, dy, dz) || 1e-6; dx /= L; dy /= L; dz /= L;
    let ax = 1, ay = 0, az = 0; if (Math.abs(dx) > 0.9) { ax = 0; ay = 1; }
    let ux = dy * az - dz * ay, uy = dz * ax - dx * az, uz = dx * ay - dy * ax;
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const wx = dy * uz - dz * uy, wy = dz * ux - dx * uz, wz = dx * uy - dy * ux;
    const base = this.n;
    for (let i = 0; i < sides; i++) {
      const a = i / sides * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      this.vert(p0[0] + r0 * (ux * ca + wx * sa), p0[1] + r0 * (uy * ca + wy * sa), p0[2] + r0 * (uz * ca + wz * sa), c);
      this.vert(p1[0] + r1 * (ux * ca + wx * sa), p1[1] + r1 * (uy * ca + wy * sa), p1[2] + r1 * (uz * ca + wz * sa), c);
    }
    for (let i = 0; i < sides; i++) {
      const a = base + 2 * i, b = base + 2 * ((i + 1) % sides);
      this.tri(a, a + 1, b); this.tri(b, a + 1, b + 1);
    }
  };
  // A leaf: a strip along forward vector f, widening then narrowing, c(t) gives the colour along its length.
  Builder.prototype.leaf = function (base, f, s, len, wid, colorAt, droop) {
    const segs = 6; let prevL = -1, prevR = -1;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs, w = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04)), 0.7) * wid * 0.5, c = colorAt(t);
      const cx = base[0] + f[0] * len * t, cy = base[1] + f[1] * len * t - (droop || 0) * len * t * t, cz = base[2] + f[2] * len * t;
      const l = this.vert(cx + s[0] * w, cy + s[1] * w, cz + s[2] * w, c), r = this.vert(cx - s[0] * w, cy - s[1] * w, cz - s[2] * w, c);
      if (prevL >= 0) { this.tri(prevL, prevR, l); this.tri(l, prevR, r); }
      prevL = l; prevR = r;
    }
  };
  let ICO = null;
  Builder.prototype.sphere = function (cx, cy, cz, rx, ry, rz, c) {
    if (!ICO) { const g = new THREE.IcosahedronGeometry(1, 1); ICO = { p: g.attributes.position.array, i: g.index ? g.index.array : null }; }
    const base = this.n, np = ICO.p.length / 3;
    for (let i = 0; i < np; i++) this.vert(cx + ICO.p[i * 3] * rx, cy + ICO.p[i * 3 + 1] * ry, cz + ICO.p[i * 3 + 2] * rz, c);
    if (ICO.i) for (let i = 0; i < ICO.i.length; i += 3) this.tri(base + ICO.i[i], base + ICO.i[i + 1], base + ICO.i[i + 2]);
    else for (let i = 0; i < np; i += 3) this.tri(base + i, base + i + 1, base + i + 2);
  };
  Builder.prototype.geometry = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  };

  function noiseTexture(base, speckle, size, repeatX, repeatY, blobs) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, size, size);
    const r = rng(7);
    for (let i = 0; i < size * 6; i++) { x.fillStyle = speckle[Math.floor(r() * speckle.length)]; const s = 1 + r() * (blobs ? 7 : 2.4); x.beginPath(); x.arc(r() * size, r() * size, s, 0, 6.3); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY);
    return t;
  }

  // ---------------------------------------------------------------- state ----
  const S = {
    inited: false, container: null, renderer: null, scene: null, camera: null, canvas: null,
    cam: { theta: 0.25, phi: 0.2, radius: 6.0, tx: 0, ty: 1.3, tz: 0 },
    drag: null, staticKey: '', bioKey: '', bioAt: 0, lastTime: 0,
    textures: null, g: {},   // groups and meshes
  };

  function init(container) {
    if (S.inited) return;
    S.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    container.appendChild(renderer.domElement);
    S.renderer = renderer; S.canvas = renderer.domElement;
    S.scene = new THREE.Scene();
    S.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    S.textures = {
      soil: noiseTexture('#6b4a30', ['rgba(0,0,0,0.25)', 'rgba(255,230,190,0.18)', 'rgba(40,25,10,0.3)'], 128, 3, 1, false),
      cut: noiseTexture('#6b4a30', ['rgba(0,0,0,0.25)', 'rgba(255,230,190,0.18)', 'rgba(40,25,10,0.3)'], 256, 1.6, 0.5, false),
      peb: noiseTexture('#9a6a48', ['rgba(220,150,100,0.9)', 'rgba(170,110,75,0.9)', 'rgba(120,75,50,0.9)'], 256, 2, 0.5, true),
      wood: noiseTexture('#8a6240', ['rgba(60,35,15,0.35)', 'rgba(170,125,80,0.3)'], 128, 4, 4, false),
    };
    // lights
    S.g.ambient = new THREE.AmbientLight(0xffffff, 0.45); S.scene.add(S.g.ambient);
    S.g.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b4a30, 0.35); S.scene.add(S.g.hemi);
    S.g.sun = new THREE.DirectionalLight(0xfff2d8, 0.9); S.g.sun.position.set(-2.5, 4.5, 3.5); S.scene.add(S.g.sun);
    // pointer controls (orbit / zoom / double-click to reset)
    const cv = S.canvas;
    cv.style.cursor = 'grab';
    const ptrs = new Map();                      // active pointers (a finger or the mouse), for rotate and pinch
    let pinch = null;
    cv.addEventListener('pointerdown', function (e) {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing';
      if (ptrs.size === 1) S.drag = { x: e.clientX, y: e.clientY };
      if (ptrs.size === 2) { const a = Array.from(ptrs.values()); pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), r: S.cam.radius }; S.drag = null; }
    });
    cv.addEventListener('pointermove', function (e) {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2 && pinch) {
        const a = Array.from(ptrs.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        if (d > 5) S.cam.radius = clamp(pinch.r * pinch.d / d, 2.4, 14);
        return;
      }
      if (!S.drag) return;
      S.cam.theta -= (e.clientX - S.drag.x) * 0.008; S.cam.phi = clamp(S.cam.phi + (e.clientY - S.drag.y) * 0.006, -0.15, 1.25);
      S.drag.x = e.clientX; S.drag.y = e.clientY;
    });
    const release = function (e) {
      ptrs.delete(e.pointerId); pinch = null; cv.style.cursor = 'grab';
      if (ptrs.size === 1) { const p = Array.from(ptrs.values())[0]; S.drag = { x: p.x, y: p.y }; } else S.drag = null;
    };
    cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); S.cam.radius = clamp(S.cam.radius * (1 + Math.sign(e.deltaY) * 0.08), 2.4, 14); }, { passive: false });
    cv.addEventListener('dblclick', resetView);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(container);
    S.inited = true;
    resize();
  }
  function resetView() { S.cam.theta = 0.25; S.cam.phi = 0.2; S.cam.radius = 6.0; }
  function resize() {
    if (!S.inited) return;
    const w = Math.max(50, S.container.clientWidth), h = Math.max(50, S.container.clientHeight);
    S.renderer.setSize(w, h, false); S.canvas.style.width = '100%'; S.canvas.style.height = '100%';
    S.camera.aspect = w / h; S.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- geometry numbers ----
  function dims(j) {
    const g = j.geo, p = j.params;
    const frac = Math.min(0.58, (g.soilMl + g.drainMl) / p.jarVolume * 1.35), tot = g.soilMl + g.drainMl || 1;
    const drainH = JH * frac * g.drainMl / tot, soilH = JH * frac * g.soilMl / tot;
    return { drainH: drainH, soilH: soilH, soilTop: drainH + soilH, drainTop: drainH };
  }

  // ---------------------------------------------------------------- static scene ----
  function disposeGroup(grp) {
    if (!grp) return;
    S.scene.remove(grp);
    grp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); }); else o.material.dispose(); } });
  }
  function halfCyl(r, h, cut, mat) {                     // full cylinder, or the back half when cut away
    const geo = new THREE.CylinderGeometry(r, r, h, 48, 1, false, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2);
    return new THREE.Mesh(geo, mat);
  }

  function buildStatic(j) {
    disposeGroup(S.g.stat);
    const d = dims(j), cut = opts.cutaway, grp = new THREE.Group(); S.g.stat = grp; S.scene.add(grp);
    const m = {};
    // sill and window backdrop
    const sill = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.14, 48), new THREE.MeshStandardMaterial({ map: S.textures.wood, color: 0x8a8a8a, roughness: 0.8 }));
    sill.position.y = -0.1; grp.add(sill);
    m.window = new THREE.MeshBasicMaterial({ color: 0x9ec4ea });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 5.2), m.window); win.position.set(0, 2.4, -3.4); grp.add(win);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.7 });
    [[0, 2.4, -3.38, 7.7, 0.14], [0, 0.0, -3.38, 7.7, 0.14], [0, 4.98, -3.38, 7.7, 0.14]].forEach(function (f) { const b = new THREE.Mesh(new THREE.BoxGeometry(f[3], f[4], 0.1), frameMat); b.position.set(f[0], f[1], f[2]); grp.add(b); });
    [[-3.78, 2.4], [3.78, 2.4], [0, 2.4]].forEach(function (f) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 5.1, 0.1), frameMat); b.position.set(f[0], f[1], -3.38); grp.add(b); });
    m.wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), new THREE.MeshStandardMaterial({ color: 0xcfc8bd, roughness: 1 }));
    m.wall.position.set(0, 3, -3.5 - 0.05); grp.add(m.wall); win.position.z = -3.4;

    // drainage layer
    if (d.drainH > 0.02) {
      const dm = new THREE.MeshStandardMaterial({ map: S.textures.peb, roughness: 0.9 });
      const dc = halfCyl(JR, d.drainH, cut, dm); dc.position.y = d.drainH / 2; grp.add(dc);
      if (cut) {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(JR * 2, d.drainH), new THREE.MeshStandardMaterial({ map: S.textures.peb, roughness: 0.9 }));
        face.position.set(0, d.drainH / 2, 0); grp.add(face);
      }
      // drainage water: translucent blue volume whose height follows the fill
      m.dwater = new THREE.Mesh(new THREE.CylinderGeometry(JR * 0.995, JR * 0.995, 1, 48, 1, false, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0x4b8fcf, transparent: true, opacity: 0.38, depthWrite: false }));
      grp.add(m.dwater);
      if (cut) { m.dwaterFace = new THREE.Mesh(new THREE.PlaneGeometry(JR * 2, 1), new THREE.MeshBasicMaterial({ color: 0x4b8fcf, transparent: true, opacity: 0.38, depthWrite: false })); m.dwaterFace.position.z = 0.003; grp.add(m.dwaterFace); }
      // charcoal chunks on top of the drainage layer
      const cr = rng(j.id * 313), nC = Math.round(j.params.charcoal * 60);
      const ch = new Builder();
      for (let i = 0; i < nC; i++) {
        const a = cr() * Math.PI * (cut ? 1 : 2) + (cut ? Math.PI : 0), rr = Math.sqrt(cr()) * (JR - 0.06);
        ch.sphere(Math.cos(a) * rr, d.drainH + 0.01, Math.sin(a) * rr, 0.045 + cr() * 0.03, 0.03, 0.045 + cr() * 0.03, [0.1, 0.1, 0.12]);
      }
      if (nC) grp.add(new THREE.Mesh(ch.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
    }
    // soil
    m.soilMat = new THREE.MeshStandardMaterial({ map: S.textures.soil, roughness: 1, color: 0xffffff });
    const sc = halfCyl(JR, d.soilH, cut, m.soilMat); sc.position.y = d.drainTop + d.soilH / 2; grp.add(sc);
    const top = new THREE.Mesh(new THREE.CircleGeometry(JR, 48, cut ? Math.PI : 0, cut ? Math.PI : Math.PI * 2), m.soilMat);   // (the cylinder already has a lid; this keeps the face shaded)
    m.cutFaceMat = new THREE.MeshStandardMaterial({ map: S.textures.cut, roughness: 1, color: 0xffffff });
    if (cut) { const face = new THREE.Mesh(new THREE.PlaneGeometry(JR * 2, d.soilH), m.cutFaceMat); face.position.set(0, d.drainTop + d.soilH / 2, 0); grp.add(face); }
    // anoxic overlay and water table (blue-black / blue volumes anchored to the bottom of the soil)
    m.anox = new THREE.Mesh(new THREE.CylinderGeometry(JR * 0.998, JR * 0.998, 1, 48, 1, false, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0x0a1226, transparent: true, opacity: 0.5, depthWrite: false }));
    grp.add(m.anox);
    if (cut) { m.anoxFace = new THREE.Mesh(new THREE.PlaneGeometry(JR * 2, 1), new THREE.MeshBasicMaterial({ color: 0x0a1226, transparent: true, opacity: 0.5, depthWrite: false })); m.anoxFace.position.z = 0.004; grp.add(m.anoxFace); }
    m.wtab = new THREE.Mesh(new THREE.CylinderGeometry(JR * 0.999, JR * 0.999, 1, 48, 1, false, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0x4b8fcf, transparent: true, opacity: 0.3, depthWrite: false }));
    grp.add(m.wtab);
    if (cut) { m.wtabFace = new THREE.Mesh(new THREE.PlaneGeometry(JR * 2, 1), new THREE.MeshBasicMaterial({ color: 0x4b8fcf, transparent: true, opacity: 0.3, depthWrite: false })); m.wtabFace.position.z = 0.005; grp.add(m.wtabFace); }
    m.pond = new THREE.Mesh(new THREE.CylinderGeometry(JR * 0.999, JR * 0.999, 1, 48), new THREE.MeshBasicMaterial({ color: 0x4b8fcf, transparent: true, opacity: 0.45, depthWrite: false }));
    grp.add(m.pond);

    // glass jar, base and lid
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xd7ecf8, transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(JR + 0.025, JR + 0.025, JH, 64, 1, true), glassMat); glass.position.y = JH / 2; grp.add(glass);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(JR + 0.025, 0.018, 8, 64), new THREE.MeshStandardMaterial({ color: 0xe6f3fb, transparent: true, opacity: 0.45, roughness: 0.1 })); rim.rotation.x = Math.PI / 2; rim.position.y = JH; grp.add(rim);
    const baseGlass = new THREE.Mesh(new THREE.CylinderGeometry(JR + 0.05, JR + 0.05, 0.05, 64), new THREE.MeshStandardMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.35, roughness: 0.1 })); baseGlass.position.y = -0.02; grp.add(baseGlass);
    m.fogMat = new THREE.MeshBasicMaterial({ color: 0xdff1fb, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const fog = new THREE.Mesh(new THREE.CylinderGeometry(JR + 0.012, JR + 0.012, JH - d.soilTop, 48, 1, true), m.fogMat); fog.position.y = d.soilTop + (JH - d.soilTop) / 2; grp.add(fog);
    m.lid = new THREE.Group();
    const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(JR + 0.08, JR + 0.08, 0.13, 48), new THREE.MeshStandardMaterial({ color: 0x7e8a95, roughness: 0.35, metalness: 0.6 }));
    lidMesh.position.y = 0.065; m.lid.add(lidMesh); m.lid.position.y = JH + 0.0; grp.add(m.lid);
    // droplets on the inside of the glass
    const nDrop = 160; m.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.014, 6, 5), new THREE.MeshStandardMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.75, roughness: 0.1 }), nDrop);
    const dr = rng(j.id * 5), mat4 = new THREE.Matrix4();
    for (let i = 0; i < nDrop; i++) {
      const a = dr() * Math.PI * 2, y = d.soilTop + 0.12 + dr() * (JH - d.soilTop - 0.3), s = 0.7 + dr() * 1.4;
      mat4.compose(new THREE.Vector3(Math.cos(a) * (JR - 0.004), y, Math.sin(a) * (JR - 0.004)), new THREE.Quaternion(), new THREE.Vector3(s, s * 1.3, s)); m.drops.setMatrixAt(i, mat4);
    }
    m.drops.count = 0; grp.add(m.drops);
    // soil animals: instanced dots
    m.spring = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 6, 5), new THREE.MeshStandardMaterial({ color: 0xf4f4f8, roughness: 0.6 }), 200); m.spring.count = 0; grp.add(m.spring);
    m.mites = new THREE.InstancedMesh(new THREE.SphereGeometry(0.02, 6, 5), new THREE.MeshStandardMaterial({ color: 0xd8372d, roughness: 0.5, emissive: 0x330a08 }), 40); m.mites.count = 0; grp.add(m.mites);
    S.g.m = m; S.g.d = d; S.staticKey = staticKeyOf(j);
    S.bioKey = '';       // plants and roots depend on the layer heights too
  }
  function staticKeyOf(j) { const p = j.params; return [j.id, p.jarVolume, p.soilVolume, p.drainVolume, p.charcoal, opts.cutaway].join('|'); }

  // ---------------------------------------------------------------- biology meshes ----
  function leafColor(sp, health, dormant, yel, mold, rr) {
    let c = mixC(rgb255([176, 168, 62]), rgb255(sp.leaf), health);
    c = mixC(c, rgb255([150, 125, 72]), dormant * 0.8);
    const v = (rr() - 0.5) * 0.12;
    return [clamp(c[0] + v, 0, 1), clamp(c[1] + v, 0, 1), clamp(c[2] + v * 0.5, 0, 1)];
  }

  function buildBio(j) {
    disposeGroup(S.g.bio);
    const d = S.g.d, s = j.s, cut = opts.cutaway;
    const grp = new THREE.Group(); S.g.bio = grp; S.scene.add(grp);
    const plantB = new Builder(), rootB = new Builder(), K = Terra.model.K;
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    S.g.leafMat = leafMat;

    s.plants.forEach(function (pl, idx) {
      const sp = species(pl.sp), r = rng(j.id * 31 + idx * 7 + 3), rr = rng(j.id * 53 + idx * 11 + 5);
      const px = (pl.x - 0.5) * 1.5, pz = (idx % 2 ? 0.07 : -0.07) * (cut ? 0.2 : 1);
      const top = d.soilTop;
      // ----- roots (pale = healthy, dark = rotted / infected) -----
      if (!pl.dead && opts.roots) {
        const rot = Math.max(1 - pl.h, pl.fR), rg = rng(j.id * 1000 + idx * 37 + 11);
        if (sp.moss) {
          for (let i = 0; i < 12; i++) { const x = px + (rg() * 2 - 1) * 0.2; rootB.tube([x, top, pz + 0.02], [x + (rg() - 0.5) * 0.05, top - 0.04 - rg() * 0.05, pz + 0.02], 0.004, 0.002, [0.8, 0.74, 0.58], 4); }
        } else if (pl.R <= 0.001) {                                           // a cutting: only the bare stem end in the soil
          rootB.tube([px, top, pz + 0.03], [px, top - 0.12, pz + 0.03], 0.016, 0.014, pl.fR > 0.1 ? [0.29, 0.19, 0.13] : [0.6, 0.67, 0.43], 5);
        } else {
          const reach = Math.min(d.soilH * 0.92, d.soilH * (0.08 + 0.4 * Math.sqrt(pl.R)));
          const nPrim = 2 + Math.min(5, Math.floor(pl.R * 1.4));
          const branch = function (x, y, z, ax, az, len, depth, width) {     // ax: tilt from straight down in the x-y plane, az: tilt toward the camera
            const dx = Math.sin(ax) * Math.cos(az), dy = -Math.cos(ax) * Math.cos(az), dz = Math.sin(az);
            let x1 = x + dx * len, y1 = y + dy * len, z1 = z + dz * len;
            x1 = clamp(x1, -JR + 0.05, JR - 0.05); y1 = Math.max(d.drainTop + 0.03, y1); z1 = clamp(z1, cut ? 0.012 : -JR + 0.1, cut ? 0.14 : JR - 0.1);
            const dark = rg() < rot;
            rootB.tube([x, y, z], [x1, y1, z1], width, width * 0.7, dark ? [0.29, 0.19, 0.13] : [0.93, 0.89, 0.77], 4);
            if (depth < 3) {
              const nb = depth === 0 ? 3 : 2;
              for (let i = 0; i < nb; i++) {
                const f = 0.35 + 0.55 * rg();
                branch(x + (x1 - x) * f, y + (y1 - y) * f, z + (z1 - z) * f, ax + (rg() < 0.5 ? -1 : 1) * (0.5 + rg() * 0.9), az + (rg() - 0.5) * 0.7, len * (0.5 + rg() * 0.25), depth + 1, width * 0.62);
              }
            }
          };
          for (let i = 0; i < nPrim; i++) branch(px, top - 0.005, pz + 0.03, (i / (nPrim - 1) - 0.5) * 1.5 + (rg() - 0.5) * 0.3, (rg() - 0.5) * 0.3, reach * (0.55 + rg() * 0.35), 0, 0.017);
        }
      }
      // ----- shoots -----
      if (pl.dead) { plantB.tube([px, top, pz], [px + 0.03, top + 0.1, pz], 0.012, 0.006, [0.37, 0.27, 0.17], 5); return; }
      const yel = yellowing(pl);
      const health = Math.min(clamp(pl.w * 1.1, 0, 1) * (sp.moss ? 1 : clamp(pl.h * 1.2, 0, 1)), 1 - 0.85 * yel);
      const wilt = 1 - clamp(pl.w, 0, 1), dormant = clamp((0.5 - pl.w) * 2, 0, 1);
      const rel = Math.min(1.1, sp.heightK * Math.sqrt(pl.S / (K.capPerArea * j.geo.areaF)) * 1.2);
      const hMax = (JH - top) * 0.9, H = Math.max(0.12, hMax * rel);
      const nLeaves = Math.min(46, Math.round(3 + pl.S * (sp.style === 'rosette' ? 2.6 : 1.8)));
      const mold = pl.fF;
      const stemCol = mixC(rgb255([120, 95, 50]), rgb255([80, 140, 60]), health);

      if (sp.style === 'moss') {                                              // a lumpy cushion hugging the soil
        const ext = Math.min(0.75, 0.12 + 0.3 * Math.sqrt(pl.S / 8)), nC = Math.min(160, Math.round(10 + pl.S * 12)), size = Math.min(1.5, Math.sqrt(pl.S / 4));
        for (let i = 0; i < nC; i++) {
          const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * ext, x = px + Math.cos(a) * rad, z = pz + Math.sin(a) * rad * (cut ? 0.25 : 1) + (cut ? 0.02 : 0);
          if (cut && z < -JR * 0.6) continue;
          const b = (0.045 + r() * 0.06) * size, c = leafColor(sp, health, dormant, yel, mold, r);
          if (mold > 0.05 && r() < mold * 2) { c[0] = 0.78; c[1] = 0.78; c[2] = 0.76; }
          plantB.sphere(x, top + b * 0.35, z, b, b * 0.7, b, c);
        }
        return;
      }
      if (sp.style === 'rosette') {                                           // fittonia: a low fan of veined leaves
        const spread = 0.15 + 0.6 * Math.min(1, Math.sqrt(pl.S / 10));
        for (let i = 0; i < nLeaves; i++) {
          const f = (i + 0.5) / nLeaves, phi = i * 2.399 + r() * 0.3;
          const len = (0.14 + 0.2 * Math.min(1, rel * 1.8)) * (0.75 + r() * 0.5), wid = len * (0.62 + 0.1 * r());
          const rho = (0.03 + f * spread * (0.6 + r() * 0.4)), lift = 0.02 + r() * H * 0.4 * (1 - f * 0.5);
          const up = 0.25 + r() * 0.55 - wilt * (0.9 + r() * 0.6) * 1.5;
          const fv = [Math.cos(phi) * Math.cos(up), Math.sin(up), Math.sin(phi) * Math.cos(up)], sv = [-Math.sin(phi), 0, Math.cos(phi)];
          const base = [px + Math.cos(phi) * rho, top + lift, pz + Math.sin(phi) * rho * (cut ? 0.5 : 1)];
          const col = leafColor(sp, health, 0, yel, mold, r), moldy = mold > 0.02 && rr() < Math.min(1, mold * 2.5);
          plantB.leaf(base, fv, sv, len, wid, function (t) { return moldy && t > 0.15 && t < 0.85 ? [0.74, 0.74, 0.72] : col; }, wilt * 0.6);
          const vc = mixC(rgb255(sp.vein), col, 1 - (0.95 * health + 0.05));    // pink veins fade when unwell
          const mid = [base[0] + fv[0] * len * 0.5, base[1] + fv[1] * len * 0.5 + 0.004 - wilt * 0.6 * len * 0.25, base[2] + fv[2] * len * 0.5];
          plantB.tube([base[0], base[1] + 0.003, base[2]], [base[0] + fv[0] * len * 0.92, base[1] + fv[1] * len * 0.92 + 0.003 - wilt * 0.6 * len * 0.85, base[2] + fv[2] * len * 0.92], 0.0035, 0.0015, vc, 3);
          plantB.tube([base[0] + fv[0] * len * 0.3, base[1] + fv[1] * len * 0.3 + 0.003, base[2] + fv[2] * len * 0.3], [mid[0] + sv[0] * wid * 0.28, mid[1], mid[2] + sv[2] * wid * 0.28], 0.0025, 0.001, vc, 3);
          plantB.tube([base[0] + fv[0] * len * 0.3, base[1] + fv[1] * len * 0.3 + 0.003, base[2] + fv[2] * len * 0.3], [mid[0] - sv[0] * wid * 0.28, mid[1], mid[2] - sv[2] * wid * 0.28], 0.0025, 0.001, vc, 3);
        }
        return;
      }
      // generic and vine: a curved stem with leaves climbing it
      const lean = sp.style === 'vine' ? 0.12 : 0.05, pts = [];
      for (let i = 0; i <= 8; i++) { const f = i / 8; pts.push([px + lean * Math.sin(f * 2.2) * 1.0, top + H * f, pz + (cut ? 0 : 0.04 * Math.sin(f * 3))]); }
      for (let i = 0; i < 8; i++) plantB.tube(pts[i], pts[i + 1], 0.012 + 0.018 * Math.min(1, rel) * (1 - i / 9), 0.012 + 0.018 * Math.min(1, rel) * (1 - (i + 1) / 9), stemCol, 5);
      for (let i = 0; i < nLeaves; i++) {
        const f = (i + 1) / nLeaves, k = Math.min(7, Math.floor(f * 8)), t = f * 8 - k;
        const base = [mixN(pts[k][0], pts[k + 1][0], t), mixN(pts[k][1], pts[k + 1][1], t), mixN(pts[k][2], pts[k + 1][2], t)];
        const phi = i * 2.399 + r() * 0.4, up = 0.5 + r() * 0.5 - wilt * 1.5;
        const baseLen = (sp.style === 'vine' ? 0.2 : 0.17) + 0.28 * Math.min(1, rel);
        const len = baseLen * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, f * 0.9 + 0.1))) * (0.8 + r() * 0.4), wid = len * (sp.style === 'vine' ? 0.62 : 0.45);
        const fv = [Math.cos(phi) * Math.cos(up), Math.sin(up), Math.sin(phi) * Math.cos(up)], sv = [-Math.sin(phi), 0, Math.cos(phi)];
        const col = leafColor(sp, health, 0, yel, mold, r), moldy = mold > 0.02 && rr() < Math.min(1, mold * 2.5);
        const vein = sp.vein ? mixC(rgb255(sp.vein), col, 0.5) : null;
        plantB.leaf(base, fv, sv, len, wid, function (t) { return moldy && t > 0.15 && t < 0.85 ? [0.74, 0.74, 0.72] : (vein && Math.abs(t - 0.5) < 0.04 ? vein : col); }, wilt * 0.5);
      }
    });
    if (plantB.n) { const mesh = new THREE.Mesh(plantB.geometry(), leafMat); grp.add(mesh); S.g.plantMesh = mesh; }
    if (rootB.n) grp.add(new THREE.Mesh(rootB.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));

    // litter and mold on the soil surface
    const lr = rng(j.id * 977), litB = new Builder();
    const nLit = Math.min(90, Math.round(s.L * 10)), nMold = Math.min(30, Math.round(Math.max(0, s.F - 0.4) * 8));
    const spot = function () { const a = lr() * Math.PI * (cut ? 1 : 2) + (cut ? Math.PI : 0), rad = Math.sqrt(lr()) * (JR - 0.06); return [Math.cos(a) * rad, Math.sin(a) * rad]; };
    for (let i = 0; i < nLit; i++) { const q = spot(); litB.sphere(q[0], d.soilTop + 0.008, q[1], 0.03 + lr() * 0.03, 0.006, 0.02 + lr() * 0.02, [0.35 + lr() * 0.2, 0.22 + lr() * 0.1, 0.1]); }
    for (let i = 0; i < nMold; i++) { const q = spot(), rad = 0.03 + lr() * 0.05; litB.sphere(q[0], d.soilTop + rad * 0.3, q[1], rad, rad * 0.55, rad, [0.92, 0.94, 0.86]); }
    if (litB.n) grp.add(new THREE.Mesh(litB.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  }
  function bioKeyOf(j) {
    const s = j.s, parts = [Math.round(s.L), Math.round(Math.max(0, s.F) * 4), s.leafWet > 0.5 ? 1 : 0, opts.cutaway, opts.roots];
    s.plants.forEach(function (pl) {
      parts.push(pl.sp, pl.dead ? 1 : 0, Math.round(pl.S * 8), Math.round(pl.R * 8), Math.round(pl.h * 10), Math.round(pl.w * 5), Math.round(yellowing(pl) * 8), Math.round(pl.fF * 20), Math.round(pl.fR * 20), pl.cutting ? 1 : 0);
    });
    return parts.join(',');
  }

  // ---------------------------------------------------------------- per-frame update ----
  const TMP = new THREE.Matrix4(), QUAT = new THREE.Quaternion(), POS = new THREE.Vector3(), SCL = new THREE.Vector3(1, 1, 1);
  function updateDynamic(j, time) {
    const m = S.g.m, d = S.g.d, dd = j.d, s = j.s, p = j.params, cut = opts.cutaway;
    // water volumes
    const placeVol = function (mesh, face, y0, h) {
      if (!mesh) return; mesh.visible = h > 0.004; mesh.scale.y = Math.max(h, 1e-4); mesh.position.y = y0 + h / 2;
      if (face) { face.visible = mesh.visible; face.scale.y = Math.max(h, 1e-4); face.position.y = y0 + h / 2; }
    };
    placeVol(m.dwater, m.dwaterFace, 0, d.drainH * clamp(dd.drainFill, 0, 1));
    const anoxH = d.soilH * clamp(Math.max(dd.wtf, dd.anox), 0, 1);
    placeVol(m.anox, m.anoxFace, d.drainTop, anoxH);
    if (m.anox) { const o = clamp(0.25 + dd.toxH2S * 0.3, 0.2, 0.7); m.anox.material.opacity = o; if (m.anoxFace) m.anoxFace.material.opacity = o; }
    placeVol(m.wtab, m.wtabFace, d.drainTop, d.soilH * dd.wtf);
    if (m.pond) { const ph = dd.pond > 0 ? Math.min(0.25, 0.02 + dd.pond / j.geo.soilMl * d.soilH) : 0; m.pond.visible = ph > 0; m.pond.scale.y = Math.max(ph, 1e-4); m.pond.position.y = d.soilTop + ph / 2; }
    // soil darkens when wet, blue-black when anoxic
    const wet = Math.min(1, dd.theta / 0.5), shade = mixN(1.25, 0.55, wet), an = clamp(dd.anox, 0, 1) * 0.35;
    const col = [shade * (1 - an), shade * (1 - an * 0.6), shade * (1 - an * 0.1)];
    m.soilMat.color.setRGB(clamp(col[0], 0, 1.6), clamp(col[1], 0, 1.6), clamp(col[2], 0, 1.6)); m.cutFaceMat.color.copy(m.soilMat.color);
    // light, sky and window
    const lightOn = dd.lightNow > 0, dayK = clamp(dd.lightNow / 1.6, 0, 1);
    const winMode = !!p.lightSource;
    S.g.sun.intensity = lightOn ? 0.55 + 0.95 * dayK : 0.06;
    S.g.sun.color.setRGB(1, lightOn ? 0.93 : 0.8, lightOn ? 0.82 : 1);
    S.g.ambient.intensity = lightOn ? 0.5 : 0.22; S.g.hemi.intensity = lightOn ? 0.45 : 0.12;
    const tod = (j.hours % 24);
    const sun = winMode ? clamp(dayK * 1.2, 0, 1) : (lightOn ? 0.5 : 0);
    const sky = winMode ? [mixN(0.02, 0.62, sun), mixN(0.03, 0.78, sun), mixN(0.08, 0.95, sun)] : [mixN(0.1, 0.24, sun), mixN(0.1, 0.22, sun), mixN(0.13, 0.2, sun)];
    m.window.color.setRGB(sky[0], sky[1], sky[2]);
    S.scene.background = new THREE.Color(sky[0] * 0.18 + 0.05, sky[1] * 0.18 + 0.05, sky[2] * 0.18 + 0.06);
    if (winMode) { const ang = (tod / 24) * Math.PI * 2; S.g.sun.position.set(-3.5 + 2 * Math.sin(ang), 4.5, 3.5); } else S.g.sun.position.set(-1.8, 5, 2.4);
    // condensation and dew
    m.fogMat.opacity = clamp(s.Wg * 6 + (dd.rh > 0.97 && !lightOn ? 0.06 : 0), 0, 0.5) * 0.9;
    m.drops.count = Math.min(160, Math.round(s.Wg * 500 + (s.leafWet > 0.7 ? 25 : 0)));
    m.drops.instanceMatrix.needsUpdate = true;
    if (S.g.leafMat) S.g.leafMat.roughness = 0.85 - 0.5 * s.leafWet;
    // the lid lifts and tilts when open
    const leak = dd.leakNow || 0; m.lid.position.y = JH + (leak > 0 ? 0.05 + 0.2 * leak : 0); m.lid.rotation.z = leak > 0 ? -0.12 - 0.35 * leak : 0; m.lid.position.x = leak > 0 ? 0.35 * leak : 0;
    // soil animals wander over the surface
    if (opts.fauna) {
      const nS = Math.min(160, Math.round(dd.count / 3)), nM = Math.min(30, Math.round(dd.miteCount));
      m.spring.count = nS; m.mites.count = nM; m.spring.visible = m.mites.visible = true;
      for (let i = 0; i < nS; i++) {
        const a0 = rng(j.id * 7 + i)() * 6.283, r0 = 0.1 + Math.sqrt(rng(j.id * 13 + i * 3)()) * (JR - 0.12);
        const a = a0 + time * 0.00018 * (i % 2 ? 1 : -1) * (0.5 + (i % 5) * 0.2), rr = r0 + 0.03 * Math.sin(time * 0.001 + i);
        const z = Math.sin(a) * rr, zz = cut ? -Math.abs(z) : z;
        POS.set(Math.cos(a) * rr, d.soilTop + 0.016 + Math.abs(Math.sin(time * 0.003 + i)) * 0.012 + (dd.wtf > 0.2 ? (i % 7) * 0.02 : 0), zz); TMP.compose(POS, QUAT, SCL); m.spring.setMatrixAt(i, TMP);
      }
      for (let i = 0; i < nM; i++) {
        const a = rng(j.id * 17 + i)() * 6.283 + time * 0.00025 * (i % 2 ? 1 : -1), rr = 0.15 + Math.sqrt(rng(j.id * 19 + i)()) * (JR - 0.2), z = Math.sin(a) * rr;
        POS.set(Math.cos(a) * rr, d.soilTop + 0.02, cut ? -Math.abs(z) : z); TMP.compose(POS, QUAT, SCL); m.mites.setMatrixAt(i, TMP);
      }
      m.spring.instanceMatrix.needsUpdate = true; m.mites.instanceMatrix.needsUpdate = true;
    } else { m.spring.visible = m.mites.visible = false; }
    // gentle sway of the plants
    if (S.g.bio) S.g.bio.rotation.z = Math.sin(time / 1700) * 0.004;
  }

  // ---------------------------------------------------------------- public ----
  function frame(j, time) {
    if (!S.inited || !j) return;
    const key = staticKeyOf(j);
    if (key !== S.staticKey) buildStatic(j);
    const now = performance.now(), bk = bioKeyOf(j);
    if (bk !== S.bioKey && now - S.bioAt > 250) { buildBio(j); S.bioKey = bk; S.bioAt = now; }
    updateDynamic(j, time);
    if (opts.autorotate && !S.drag) S.cam.theta += 0.004;
    const c = S.cam, cp = Math.cos(c.phi);
    const R = c.radius * Math.max(1, 0.92 / S.camera.aspect);        // pull back on tall (phone) screens so the whole jar fits
    S.camera.position.set(c.tx + R * Math.sin(c.theta) * cp, c.ty + R * Math.sin(c.phi), c.tz + R * Math.cos(c.theta) * cp);
    S.camera.lookAt(c.tx, c.ty, c.tz);
    S.renderer.render(S.scene, S.camera);
  }
  // Call when something forces a rebuild (restart, fork): forget cached keys.
  function invalidate() { S.staticKey = ''; S.bioKey = ''; }

  Terra.jar3d = { available: true, init: init, frame: frame, resize: resize, resetView: resetView, invalidate: invalidate, opts: opts };
})(window);
