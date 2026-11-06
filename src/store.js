/*
 * Saving and restoring jars: autosave in the browser (localStorage) and text backups to move jars between devices.
 * No UI in here, so it can be tested in Node. A saved jar keeps its full simulation state; the chart history is thinned
 * (every other point dropped, the same way the live history thins itself) so a whole session stays well under the 5 MB
 * browser limit. If the model's equations changed since a save (Terra.model.VERSION), the jar is rebuilt from its starting
 * setup and fast-forwarded to the same day instead, so old saves never crash a newer model.
 */
(function (root) {
  'use strict';
  const Terra = (root.Terra = root.Terra || {});
  const KEY = 'closed-jar-simulator/save-1';
  const FORMAT = 1;
  const M = function () { return Terra.model; };

  // ---- packing -------------------------------------------------------------
  function round6(v) { return typeof v === 'number' && isFinite(v) ? Number(v.toPrecision(6)) : v; }
  function thinHistory(hist, maxPts) {
    let t = hist.t, series = {}, pl = hist.pl.map(function (q) { return { shoot: q.shoot, root: q.root, health: q.health }; }), stride = hist.stride;
    Object.keys(hist.series).forEach(function (k) { series[k] = hist.series[k]; });
    const keep = function (a) { return a.filter(function (_, i) { return i % 2 === 0; }); };
    while (t.length > maxPts) {
      stride *= 2; t = keep(t);
      Object.keys(series).forEach(function (k) { series[k] = keep(series[k]); });
      pl = pl.map(function (q) { return { shoot: keep(q.shoot), root: keep(q.root), health: keep(q.health) }; });
    }
    const r = function (a) { return a.map(round6); };
    Object.keys(series).forEach(function (k) { series[k] = r(series[k]); });
    pl = pl.map(function (q) { return { shoot: r(q.shoot), root: r(q.root), health: r(q.health) }; });
    return { stride: stride, t: r(t), series: series, pl: pl };
  }
  function packJar(j, maxPts) {
    return JSON.parse(JSON.stringify({
      name: j.name, color: j._color || null, params: j.params, initial: j.initial, hours: j.hours, s: j.s,
      log: j.log.slice(-150), diag: j.diag, hist: thinHistory(j.hist, maxPts),
    }));
  }
  function pack(jars, app, maxPts) {
    return { format: FORMAT, model: M().VERSION, savedAt: Date.now(), app: app || {}, jars: jars.map(function (j) { return packJar(j, maxPts || 400); }) };
  }

  // ---- unpacking -----------------------------------------------------------
  function validState(s) {
    return s && Array.isArray(s.plants) && ['L', 'Rc', 'B', 'F', 'Sp', 'Ch', 'O', 'W', 'Wd', 'V', 'Ta', 'Ts'].every(function (k) { return typeof s[k] === 'number' && isFinite(s[k]); });
  }
  // Returns { jars, app, notes } ; jars have fresh ids.
  function unpack(obj) {
    const m = M(), notes = [], jars = [];
    if (!obj || !Array.isArray(obj.jars)) throw new Error('This is not a Closed Jar Simulator save.');
    const sameModel = obj.model === m.VERSION;
    obj.jars.forEach(function (c, idx) {
      let j = null;
      try {
        if (sameModel && validState(c.s)) {
          const base = m.createJar(c.params, c.name);                       // gives us id, geometry and empty structures
          j = base;
          j.params = c.params; j.initial = c.initial || c.params; j.hours = c.hours; j.s = c.s; j.log = c.log || []; j.diag = c.diag || null; j.acc = null;
          j.geo = m.geometry(j.params);
          j.hist = c.hist;
          m.VARS.forEach(function (v) {                                      // a variable added since the save: blank history for it
            if (!j.hist.series[v.key]) { j.hist.series[v.key] = j.hist.t.map(function () { return null; }); }
          });
          m.derive(j);
        } else {
          j = m.createJar(c.initial || c.params, c.name);                    // equations changed: replay from the starting setup
          m.advance(j, Math.max(0, Math.round(c.hours || 0)));
          notes.push('"' + c.name + '" was rebuilt from its starting setup because the model was updated (your own actions on it were not replayed).');
        }
        j._color = c.color || null;
        jars.push(j);
      } catch (err) {
        notes.push('Could not restore jar ' + (idx + 1) + ' ("' + (c && c.name) + '"): ' + err.message);
      }
    });
    return { jars: jars, app: obj.app || {}, notes: notes };
  }

  // ---- browser storage (every access guarded: it can be blocked or full) -----
  function storage() { try { return root.localStorage || null; } catch (e) { return null; } }
  function save(jars, app) {
    const ls = storage();
    if (!ls) return { ok: false, why: 'this browser is blocking storage' };
    for (const maxPts of [400, 200, 90]) {
      try { ls.setItem(KEY, JSON.stringify(pack(jars, app, maxPts))); return { ok: true, at: Date.now(), maxPts: maxPts }; }
      catch (e) { /* too big: retry with a shorter history */ }
    }
    return { ok: false, why: 'the browser storage is full' };
  }
  function load() {
    const ls = storage(); if (!ls) return null;
    try { const t = ls.getItem(KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }
  function clear() { const ls = storage(); try { if (ls) ls.removeItem(KEY); } catch (e) { /* ignore */ } }

  // ---- text backups (compressed when the browser can) ------------------------
  function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(t) { const s = atob(t), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  async function streamBytes(stream, bytes) {
    const w = stream.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  }
  async function toText(jars, app) {
    const json = JSON.stringify(pack(jars, app, 300));
    if (typeof CompressionStream === 'function') {
      try { return 'JARSIM1:' + b64(await streamBytes(new CompressionStream('gzip'), new TextEncoder().encode(json))); } catch (e) { /* fall through */ }
    }
    return 'JARSIM0:' + json;
  }
  async function fromText(text) {
    text = String(text || '').trim();
    if (text.indexOf('JARSIM1:') === 0) {
      if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot unpack compressed backups.');
      return JSON.parse(new TextDecoder().decode(await streamBytes(new DecompressionStream('gzip'), unb64(text.slice(8)))));
    }
    if (text.indexOf('JARSIM0:') === 0) return JSON.parse(text.slice(8));
    if (text.charAt(0) === '{') return JSON.parse(text);
    throw new Error('This does not look like a backup. It should start with JARSIM.');
  }

  Terra.store = { KEY: KEY, pack: pack, unpack: unpack, save: save, load: load, clear: clear, toText: toText, fromText: fromText, thinHistory: thinHistory };
})(typeof globalThis !== 'undefined' ? globalThis : this);
