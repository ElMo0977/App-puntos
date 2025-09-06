import React, { useCallback, useEffect, useMemo, useState } from "react";

// ===== Utilidades cortas =====
const EPS = 1e-9;
const STEP = 0.1; // rejilla 0,1 m
const round01 = (n: number) => Math.round(n * 10) / 10;
const key01 = (n: number) => n.toFixed(1);
const parseNum = (v: string, fb = 0) => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : fb;
};

// Geometría
function dist3D(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function planarDistances(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return { xy: Math.hypot(dx, dy), xz: Math.hypot(dx, dz), yz: Math.hypot(dy, dz) };
}
function pointInPolygon(pt: { x: number; y: number }, poly: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const hit = (yi > pt.y) !== (yj > pt.y) && pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) + EPS) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
function polygonArea(poly: Array<{ x: number; y: number }>) {
  let A = 0; for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; A += poly[i].x * poly[j].y - poly[j].x * poly[i].y; } return Math.abs(A) / 2;
}
function distPointToSegment2D(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const vx = b.x - a.x, vy = b.y - a.y, wx = p.x - a.x, wy = p.y - a.y;
  const c1 = vx * wx + vy * wy; if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy; if (c2 <= EPS) return Math.hypot(p.x - a.x, p.y - a.y);
  if (c1 >= c2) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2; const proj = { x: a.x + t * vx, y: a.y + t * vy }; return Math.hypot(p.x - proj.x, p.y - proj.y);
}
function minDistToEdges2D(p: { x: number; y: number }, poly: Array<{ x: number; y: number }>) {
  let md = Infinity; for (let i = 0; i < poly.length; i++) md = Math.min(md, distPointToSegment2D(p, poly[i], poly[(i + 1) % poly.length])); return md;
}

// RNG simple reproducible
function mulberry32(seed: number) { let t = seed >>> 0; return function () { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
function shuffle<T>(arr: T[], rng: () => number) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ===== Reglas =====
const MARGIN = 0.5;        // a caras (incluye Z)
const MIN_RED_BLUE = 1.0;  // F–P ≥ 1,0 m (3D)
const MIN_BLUE_BLUE = 0.7; // P–P ≥ 0,7 m (3D)

// ===== Tipos =====
type P3 = { x: number; y: number; z: number };

// ===== Generador de puntos azules =====
function generateBluePoints({ F1, F2, candidates, seed, genNonce }: { F1: P3; F2: P3; candidates: P3[]; seed: string; genNonce: number; }): P3[] {
  if (!candidates.length) return [];

  // RNG (variación entre clics si no hay semilla)
  const userSeed = seed ? Array.from(seed).reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const rng = mulberry32(seed ? userSeed : ((Date.now() ^ (genNonce * 0x9e3779b9)) >>> 0));

  // ===== Preferencia de Z: P1=1.0 y +0.1 por punto (ajustado al conjunto de niveles disponibles y Z únicos) =====
  const zLevels = Array.from(new Set(candidates.map(c => key01(c.z)))).map(parseFloat).sort((a,b)=>a-b);
  const usedZGlob = new Set<string>([key01(F1.z), key01(F2.z)]);
  const chooseNearestFreeZ = (desired: number) => {
    let best: number | null = null; let bestDiff = Infinity; const ties: number[] = [];
    for (const z of zLevels) {
      if (usedZGlob.has(key01(z))) continue;
      const d = Math.abs(z - desired);
      if (d < bestDiff - 1e-12) { bestDiff = d; best = z; ties.length = 0; ties.push(z); }
      else if (Math.abs(d - bestDiff) < 1e-12) ties.push(z);
    }
    if (ties.length > 1) return ties[Math.floor(rng() * ties.length)];
    return best ?? zLevels[0];
  };
  const targetZs: number[] = [];
  for (let i = 0; i < 5; i++) { const z = chooseNearestFreeZ(round01(1.0 + 0.1 * i)); targetZs.push(z); usedZGlob.add(key01(z)); }

  // Helpers
  const anchors = (chosen: P3[]) => [F1, F2, ...chosen];
  const minDistToSet = (p: P3, set: P3[]) => set.reduce((m, q) => Math.min(m, dist3D(p, q)), Infinity);
  const scoreMaximin = (cand: P3, chosen: P3[]) => {
    const dA = minDistToSet(cand, anchors(chosen));
    const dB = chosen.length ? Math.min(...chosen.map(q => dist3D(cand, q))) : dA;
    const dR = Math.min(dist3D(cand, F1), dist3D(cand, F2));
    return Math.min(dB, dR) * 10 + dB * 2 + dR + rng() * 0.05; // mayor aleatoriedad para variar entre clics
  };

  // Búsqueda multi‑arranque: intentamos SIEMPRE un conjunto 100% válido; si no existe, devolvemos el mejor por maximin
  let bestValid: P3[] | null = null; let bestValidScore = -Infinity;
  let bestAny: P3[] = []; let bestAnyScore = -Infinity;
  const ATTEMPTS = 180; const TOPK = 12;

  for (let att = 0; att < ATTEMPTS; att++) {
    const usedX = new Set<string>([key01(F1.x), key01(F2.x)]);
    const usedY = new Set<string>([key01(F1.y), key01(F2.y)]);
    const usedZ = new Set<string>([key01(F1.z), key01(F2.z)]);
    const chosen: P3[] = [];

    // baraja candidatos para romper determinismo
    const all = shuffle(candidates, rng);

    let allValid = true;
    for (let k = 0; k < 5; k++) {
      const zKey = key01(targetZs[k]);
      const poolZ = all.filter(c => key01(c.z) === zKey);

      // nivel estricto (todo válido)
      const strict = poolZ.filter(c => !usedX.has(key01(c.x)) && !usedY.has(key01(c.y)) && !usedZ.has(key01(c.z))
        && Math.min(dist3D(c, F1), dist3D(c, F2)) >= MIN_RED_BLUE
        && chosen.every(q => dist3D(c, q) >= MIN_BLUE_BLUE));

      const pickFrom = strict.length ? strict : poolZ; // si no hay estrictos, luego marcaremos allValid=false
      if (!strict.length) allValid = false;

      const ranked = pickFrom.map(c => ({ c, s: scoreMaximin(c, chosen) }))
        .sort((a,b)=>b.s-a.s).slice(0, Math.min(TOPK, pickFrom.length));
      if (!ranked.length) { allValid = false; continue; }
      const choice = ranked[Math.floor(rng()*ranked.length)].c; // torneo aleatorio entre los mejores

      chosen.push(choice);
      usedX.add(key01(choice.x)); usedY.add(key01(choice.y)); usedZ.add(key01(choice.z));
    }

    // puntuación del conjunto
    const setMin = (arr: P3[]) => {
      let m = Infinity; for (let i=0;i<arr.length;i++){ m = Math.min(m, dist3D(arr[i], F1), dist3D(arr[i], F2)); for (let j=i+1;j<arr.length;j++) m = Math.min(m, dist3D(arr[i], arr[j])); } return m; };
    const setScore = chosen.length ? setMin(chosen) : -Infinity;

    if (setScore > bestAnyScore) { bestAnyScore = setScore; bestAny = chosen.slice(0,5); }
    if (allValid && chosen.length === 5 && setScore > bestValidScore) { bestValidScore = setScore; bestValid = chosen.slice(0,5); }
  }

  // Preferimos un conjunto totalmente válido si lo encontramos
  const result = (bestValid && bestValid.length === 5) ? bestValid : bestAny;

  // Completa si por lo que sea vinieron menos de 5
  const out = result.slice(0,5);
  if (out.length < 5) {
    const already = new Set(out.map(p => `${key01(p.x)}|${key01(p.y)}|${key01(p.z)}`));
    const extra = candidates.filter(c => !already.has(`${key01(c.x)}|${key01(c.y)}|${key01(c.z)}`))
      .map(c => ({ c, s: minDistToSet(c, anchors(out)) + rng()*0.01 }))
      .sort((a,b)=>b.s-a.s).slice(0, 5 - out.length).map(e=>e.c);
    out.push(...extra);
  }
  return out.slice(0,5);
}

// ===== App =====
export default function App() {
  // Polígono y altura
  const [vertices, setVertices] = useState<Array<{ x: number; y: number }>>([
    { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 },
  ]);
  const [alturaZ, setAlturaZ] = useState(2.5);

  // Fuentes y receptores
  const [F1, setF1] = useState<P3>({ x: 0.5, y: 1.5, z: 1.8 });
  const [F2, setF2] = useState<P3>({ x: 2.5, y: 0.5, z: 1.1 });
  const [blue, setBlue] = useState<P3[]>([]);

  // UI
  const radii = [0.5, 0.7, 1.0, 2.0] as const;
  const [ringsRed, setRingsRed] = useState<Record<number, boolean>>({ 0.5: true, 0.7: true, 1: false, 2: false });
  const [ringsBlue, setRingsBlue] = useState<Record<number, boolean>>({ 0.5: true, 0.7: true, 1: false, 2: false });
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Persistencia ligera (cargar/guardar)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("puntos_app_state_min");
      if (raw) {
        const s = JSON.parse(raw);
        s.vertices && setVertices(s.vertices);
        typeof s.alturaZ === "number" && setAlturaZ(s.alturaZ);
        s.F1 && setF1(s.F1); s.F2 && setF2(s.F2);
        s.blue && setBlue(s.blue);
        s.ringsRed && setRingsRed(s.ringsRed); s.ringsBlue && setRingsBlue(s.ringsBlue);
        s.seed && setSeed(s.seed);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("puntos_app_state_min", JSON.stringify({ vertices, alturaZ, F1, F2, blue, ringsRed, ringsBlue, seed })); } catch {}
  }, [vertices, alturaZ, F1, F2, blue, ringsRed, ringsBlue, seed]);

  // Escala y helpers de dibujo
  const width = 700, height = 520, pad = 50;
  const bounds = useMemo(() => {
    const xs = vertices.map(v => v.x), ys = vertices.map(v => v.y);
    return { minX: Math.min(0, ...xs), maxX: Math.max(...xs), minY: Math.min(0, ...ys), maxY: Math.max(...ys) };
  }, [vertices]);
  const scale = useMemo(() => {
    const wu = Math.max(1e-3, bounds.maxX - bounds.minX), hu = Math.max(1e-3, bounds.maxY - bounds.minY);
    return Math.min((width - 2 * pad) / wu, (height - 2 * pad) / hu);
  }, [bounds]);
  const toSvg = (p: { x: number; y: number }) => ({ x: pad + (p.x - bounds.minX) * scale, y: height - pad - (p.y - bounds.minY) * scale });

  // Celdas XY válidas y niveles Z válidos
  const xyCells = useMemo(() => {
    const xs: number[] = [], ys: number[] = [];
    const bx = { min: Math.min(...vertices.map(v => v.x)), max: Math.max(...vertices.map(v => v.x)) };
    const by = { min: Math.min(...vertices.map(v => v.y)), max: Math.max(...vertices.map(v => v.y)) };
    for (let x = Math.ceil((bx.min + MARGIN) * 10) / 10; x <= bx.max - MARGIN + EPS; x += STEP) xs.push(round01(x));
    for (let y = Math.ceil((by.min + MARGIN) * 10) / 10; y <= by.max - MARGIN + EPS; y += STEP) ys.push(round01(y));
    const out: Array<{ x: number; y: number }> = [];
    for (const x of xs) for (const y of ys) {
      const p = { x, y }; if (!pointInPolygon(p, vertices)) continue; if (minDistToEdges2D(p, vertices) < MARGIN - EPS) continue; out.push(p);
    }
    return out;
  }, [vertices]);
  const zLevels = useMemo(() => { const v: number[] = []; for (let z = Math.ceil(MARGIN * 10) / 10; z <= alturaZ - MARGIN + EPS; z += STEP) v.push(round01(z)); return v; }, [alturaZ]);
  const candidates = useMemo(() => { const out: P3[] = []; for (const p of xyCells) for (const z of zLevels) out.push({ x: p.x, y: p.y, z }); return out; }, [xyCells, zLevels]);

  // Validación y avisos
  type Mark = { x: boolean; y: boolean; z: boolean; msg: string[] };
  const [viol, setViol] = useState<{ F1: Mark; F2: Mark; blue: Mark[] }>({ F1: { x: false, y: false, z: false, msg: [] }, F2: { x: false, y: false, z: false, msg: [] }, blue: [] });

  const validate = useCallback(() => {
    const v: { F1: Mark; F2: Mark; blue: Mark[] } = { F1: { x: false, y: false, z: false, msg: [] }, F2: { x: false, y: false, z: false, msg: [] }, blue: blue.map(() => ({ x: false, y: false, z: false, msg: [] })) };
    const markDup = (axis: "x" | "y" | "z") => {
      const map = new Map<string, Array<{ who: "F1" | "F2" | "B"; i: number }>>();
      const add = (who: "F1" | "F2" | "B", i: number, val: number) => { const k = key01(val); if (!map.has(k)) map.set(k, []); map.get(k)!.push({ who, i }); };
      add("F1", -1, (F1 as any)[axis]); add("F2", -1, (F2 as any)[axis]); blue.forEach((b, i) => add("B", i, (b as any)[axis]));
      for (const [, list] of map) if (list.length > 1) list.forEach(e => { if (e.who === "F1") { (v.F1 as any)[axis] = true; v.F1.msg.push(`${axis.toUpperCase()} repetida`); } else if (e.who === "F2") { (v.F2 as any)[axis] = true; v.F2.msg.push(`${axis.toUpperCase()} repetida`); } else { (v.blue[e.i] as any)[axis] = true; v.blue[e.i].msg.push(`${axis.toUpperCase()} repetida`); } });
    };
    (["x", "y", "z"] as const).forEach(markDup);

    const check = (p: P3, t: Mark) => {
      if (!pointInPolygon(p, vertices)) { t.x = t.y = true; t.msg.push("Fuera del polígono (XY)"); }
      if (minDistToEdges2D(p, vertices) < MARGIN - EPS) { t.x = t.y = true; t.msg.push("A <0,5 del borde (XY)"); }
      if (p.z < MARGIN || p.z > alturaZ - MARGIN) { t.z = true; t.msg.push("Z fuera de márgenes"); }
    };
    check(F1, v.F1); check(F2, v.F2); blue.forEach((b, i) => check(b, v.blue[i]));

    // Reglas F1–F2 por planos y también por ejes |ΔX|,|ΔY|,|ΔZ|
    const pd = planarDistances(F1, F2);
    const dx = Math.abs(F1.x - F2.x), dy = Math.abs(F1.y - F2.y), dz = Math.abs(F1.z - F2.z);
    if (pd.xy < 0.7) { v.F1.x = v.F1.y = v.F2.x = v.F2.y = true; v.F1.msg.push(`F1–F2 < 0,7 en XY (${pd.xy.toFixed(2)} m)`); v.F2.msg.push(`F1–F2 < 0,7 en XY (${pd.xy.toFixed(2)} m)`); }
    if (pd.xz < 0.7) { v.F1.x = v.F1.z = v.F2.x = v.F2.z = true; v.F1.msg.push(`F1–F2 < 0,7 en XZ (${pd.xz.toFixed(2)} m)`); v.F2.msg.push(`F1–F2 < 0,7 en XZ (${pd.xz.toFixed(2)} m)`); }
    if (pd.yz < 0.7) { v.F1.y = v.F1.z = v.F2.y = v.F2.z = true; v.F1.msg.push(`F1–F2 < 0,7 en YZ (${pd.yz.toFixed(2)} m)`); v.F2.msg.push(`F1–F2 < 0,7 en YZ (${pd.yz.toFixed(2)} m)`); }
    if (dx < 0.7) { v.F1.x = v.F2.x = true; v.F1.msg.push(`F1–F2: |X| = ${dx.toFixed(2)} < 0,7 m`); v.F2.msg.push(`F1–F2: |X| = ${dx.toFixed(2)} < 0,7 m`); }
    if (dy < 0.7) { v.F1.y = v.F2.y = true; v.F1.msg.push(`F1–F2: |Y| = ${dy.toFixed(2)} < 0,7 m`); v.F2.msg.push(`F1–F2: |Y| = ${dy.toFixed(2)} < 0,7 m`); }
    if (dz < 0.7) { v.F1.z = v.F2.z = true; v.F1.msg.push(`F1–F2: |Z| = ${dz.toFixed(2)} < 0,7 m`); v.F2.msg.push(`F1–F2: |Z| = ${dz.toFixed(2)} < 0,7 m`); }

    // Distancias 3D azules contra fuentes y entre sí
    blue.forEach((b, i) => {
      if (dist3D(b, F1) < MIN_RED_BLUE) { v.blue[i].x = v.blue[i].y = v.blue[i].z = true; v.blue[i].msg.push(`Distancia a F1 < 1,0 (=${dist3D(b, F1).toFixed(2)} m)`); }
      if (dist3D(b, F2) < MIN_RED_BLUE) { v.blue[i].x = v.blue[i].y = v.blue[i].z = true; v.blue[i].msg.push(`Distancia a F2 < 1,0 (=${dist3D(b, F2).toFixed(2)} m)`); }
    });
    for (let i = 0; i < blue.length; i++) for (let j = i + 1; j < blue.length; j++) { const d = dist3D(blue[i], blue[j]); if (d < MIN_BLUE_BLUE) { v.blue[i].x = v.blue[i].y = v.blue[i].z = true; v.blue[j].x = v.blue[j].y = v.blue[j].z = true; v.blue[i].msg.push(`P${i + 1}–P${j + 1} < 0,7 (=${d.toFixed(2)} m)`); v.blue[j].msg.push(`P${i + 1}–P${j + 1} < 0,7 (=${d.toFixed(2)} m)`); } }

    v.F1.msg = Array.from(new Set(v.F1.msg)); v.F2.msg = Array.from(new Set(v.F2.msg)); v.blue.forEach(b => b.msg = Array.from(new Set(b.msg)));
    setViol(v);
  }, [F1, F2, blue, vertices, alturaZ]);
  useEffect(() => { const t = setTimeout(validate, 80); return () => clearTimeout(t); }, [validate]);

  // Generación
  const generate = useCallback(() => {
    if (busy) return; setBusy(true); setErr(false); setMsg("Generando puntos...");
    setTimeout(() => {
      try {
        // El generador intenta cumplir reglas; si no puede, rellena igualmente buscando homogeneidad
        const chosen = generateBluePoints({ F1, F2, candidates, seed, genNonce: nonce });
        setBlue(chosen);
        if (chosen.length < 5) { setErr(true); setMsg(`Solo se pudieron generar ${chosen.length} puntos.`); } else { setMsg(`✓ Generados ${chosen.length} puntos azules.`); }
        if (!seed) setNonce(n => n + 1);
      } catch (e) { console.error(e); setErr(true); setMsg("Error al generar puntos."); }
      finally { setBusy(false); }
    }, 20);
  }, [busy, candidates, seed, nonce, F1, F2]);

  // Dibujo: rejilla + ejes + polígono + puntos
  const GridAxes = useMemo(() => {
    const axisColor = "#bfbfbf"; const els: JSX.Element[] = []; // rejilla menor 0,1 y mayor 0,5
    for (let x = Math.ceil(bounds.minX / STEP) * STEP; x <= bounds.maxX + EPS; x += STEP) { const sx = pad + (x - bounds.minX) * scale; els.push(<line key={"gx" + x} x1={sx} y1={pad} x2={sx} y2={height - pad} stroke="#e5e7eb" />); }
    for (let y = Math.ceil(bounds.minY / STEP) * STEP; y <= bounds.maxY + EPS; y += STEP) { const sy = height - pad - (y - bounds.minY) * scale; els.push(<line key={"gy" + y} x1={pad} y1={sy} x2={width - pad} y2={sy} stroke="#e5e7eb" />); }
    for (let x = Math.ceil(bounds.minX / 0.5) * 0.5; x <= bounds.maxX + EPS; x += 0.5) { const sx = pad + (x - bounds.minX) * scale; els.push(<line key={"GX" + x} x1={sx} y1={pad} x2={sx} y2={height - pad} stroke="#c7cdd6" />); els.push(<text key={"TX" + x} x={sx} y={height - pad + 14} fontSize={10} textAnchor="middle" fill="#666">{x.toFixed(1)}</text>); }
    for (let y = Math.ceil(bounds.minY / 0.5) * 0.5; y <= bounds.maxY + EPS; y += 0.5) { const sy = height - pad - (y - bounds.minY) * scale; els.push(<line key={"GY" + y} x1={pad} y1={sy} x2={width - pad} y2={sy} stroke="#c7cdd6" />); els.push(<text key={"TY" + y} x={pad - 8} y={sy + 3} fontSize={10} textAnchor="end" fill="#666">{y.toFixed(1)}</text>); }
    const O = { x: pad + (0 - bounds.minX) * scale, y: height - pad - (0 - bounds.minY) * scale };
    els.push(<line key="ax" x1={pad} y1={O.y} x2={width - pad} y2={O.y} stroke={axisColor} />);
    els.push(<line key="ay" x1={O.x} y1={height - pad} x2={O.x} y2={pad} stroke={axisColor} />);
    return <g>{els}</g>;
  }, [bounds, scale]);

  const area = useMemo(() => polygonArea(vertices), [vertices]);
  const volumen = useMemo(() => area * alturaZ, [area, alturaZ]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Distribución de Puntos Acústicos - UNE EN ISO 16283-1-2015 - Medidas de aislamiento a ruido aéreo</h1>

      <div className="grid md:grid-cols-2 gap-3 items-stretch">
        {/* Datos del recinto */}
        <section className="p-2 rounded-xl shadow bg-white border text-sm">
          <h2 className="text-base font-medium mb-2">Datos del recinto</h2>
          {vertices.map((v, i) => (
            <div key={i} className="flex items-center gap-2 mb-1 text-xs">
              <span className="w-4 text-gray-500">{i + 1}</span>
              <label>X:</label>
              <input type="number" step={0.1} value={v.x} onChange={e => setVertices(V => V.map((p, k) => k === i ? { ...p, x: round01(parseNum(e.target.value)) } : p))} className="w-20 border rounded px-1" />
              <label>Y:</label>
              <input type="number" step={0.1} value={v.y} onChange={e => setVertices(V => V.map((p, k) => k === i ? { ...p, y: round01(parseNum(e.target.value)) } : p))} className="w-20 border rounded px-1" />
              <button onClick={() => setVertices(vs => vs.filter((_, k) => k !== i))} disabled={vertices.length <= 4} className="ml-1 px-2 py-0.5 border rounded hover:bg-red-50 text-red-600 disabled:opacity-50" title={vertices.length <= 4 ? "Debe haber al menos 4 vértices" : "Eliminar vértice"}>–</button>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-2 text-sm">
            <button onClick={() => setVertices(v => [...v, { x: 0, y: 0 }])} className="px-2 py-0.5 border rounded hover:bg-gray-50 text-xs">+ vértice</button>
            <label className="ml-2">Altura Z:</label>
            <input type="number" step={0.1} value={alturaZ} onChange={e => setAlturaZ(round01(parseNum(e.target.value, 2.5)))} className="w-24 border rounded px-1" />
            <span className="ml-auto text-xs text-gray-600">Área: {area.toFixed(2)} · Volumen: {volumen.toFixed(2)}</span>
          </div>
        </section>

        {/* Círculos de distancia */}
        <section className="p-2 rounded-xl shadow bg-white border text-sm">
          <h2 className="text-base font-medium mb-2">Círculos de distancia</h2>
          <table className="text-xs border w-full">
            <thead><tr><th className="px-2">r</th><th className="px-2">Fuentes</th><th className="px-2">Puntos de medida</th></tr></thead>
            <tbody>
              {radii.map(r => (
                <tr key={r}><td className="px-2 py-1">{r.toFixed(1)} m</td>
                  <td className="px-2 text-center"><input type="checkbox" checked={!!ringsRed[r]} onChange={() => setRingsRed(s => ({ ...s, [r]: !s[r] }))} /></td>
                  <td className="px-2 text-center"><input type="checkbox" checked={!!ringsBlue[r]} onChange={() => setRingsBlue(s => ({ ...s, [r]: !s[r] }))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs flex items-center gap-2">
            <label>Semilla:</label>
            <input type="text" value={seed} onChange={e => setSeed(e.target.value)} className="border rounded px-2 py-1" placeholder="(opcional)" />
            <span className="text-gray-500">Fija la distribución.</span>
          </div>
        </section>
      </div>

      {/* Dibujo + tabla */}
      <div className="flex gap-4 items-start">
        <div className="p-3 rounded-xl shadow bg-white border">
          <svg width={width} height={height}>
            {GridAxes}
            <polygon points={vertices.map(v => { const s = toSvg(v); return `${s.x},${s.y}`; }).join(" ")} fill="#eef6ff" stroke="#93c5fd" strokeWidth={2} />

            {(() => {
              const draw = (p: P3, label: string, color: string, rings: Record<number, boolean>) => {
                const s = toSvg(p);
                return (
                  <g key={label}>
                    {Object.entries(rings).filter(([, on]) => on).map(([rr]) => <circle key={rr} cx={s.x} cy={s.y} r={parseFloat(rr) * scale} fill="none" stroke={color} opacity={0.35} />)}
                    <circle cx={s.x} cy={s.y} r={5} fill={color} />
                    <text x={s.x + 6} y={s.y - 6} fontSize={11} fill={color}>{label}</text>
                  </g>
                );
              };
              return [
                draw(F1, `F1 (${F1.x.toFixed(1)}, ${F1.y.toFixed(1)}, ${F1.z.toFixed(1)})`, "#e11d48", ringsRed),
                draw(F2, `F2 (${F2.x.toFixed(1)}, ${F2.y.toFixed(1)}, ${F2.z.toFixed(1)})`, "#e11d48", ringsRed),
                ...blue.map((b, i) => draw(b, `P${i + 1} (${b.x.toFixed(1)}, ${b.y.toFixed(1)}, ${b.z.toFixed(1)})`, "#2563eb", ringsBlue)),
              ];
            })()}
          </svg>
        </div>

        <section className="p-3 rounded-xl shadow bg-white border min-w-[360px]">
          <h2 className="text-base font-medium mb-2">Tabla de puntos (editable)</h2>
          <div className="text-[11px] text-gray-600 mb-2">Regla: <span className="font-medium">X, Y y Z no pueden repetirse</span> entre ningún punto (incluye F1 y F2).</div>
          <table className="text-xs">
            <thead><tr><th className="px-2">Punto</th><th className="px-2">X</th><th className="px-2">Y</th><th className="px-2">Z</th></tr></thead>
            <tbody>
              {[{ name: "F1", val: F1, v: viol.F1 }, { name: "F2", val: F2, v: viol.F2 }].map((row: any) => (
                <tr key={row.name}>
                  <td className="px-2 font-medium">{row.name}</td>
                  <td className="px-2"><input type="number" step={0.1} value={row.val.x} onChange={e => (row.name === "F1" ? setF1 : setF2)(p => ({ ...p, x: round01(parseNum(e.target.value)) }))} className={`w-16 border rounded px-1 ${row.v.x ? 'border-red-500 bg-red-50' : ''}`} title={row.v.msg.join('\n')} /></td>
                  <td className="px-2"><input type="number" step={0.1} value={row.val.y} onChange={e => (row.name === "F1" ? setF1 : setF2)(p => ({ ...p, y: round01(parseNum(e.target.value)) }))} className={`w-16 border rounded px-1 ${row.v.y ? 'border-red-500 bg-red-50' : ''}`} title={row.v.msg.join('\n')} /></td>
                  <td className="px-2"><input type="number" step={0.1} value={row.val.z} onChange={e => (row.name === "F1" ? setF1 : setF2)(p => ({ ...p, z: round01(parseNum(e.target.value)) }))} className={`w-16 border rounded px-1 ${row.v.z ? 'border-red-500 bg-red-50' : ''}`} title={row.v.msg.join('\n')} /></td>
                </tr>
              ))}
              {blue.map((b, i) => (
                <tr key={i}>
                  <td className="px-2">{`P${i + 1}`}</td>
                  <td className="px-2"><input type="number" step={0.1} value={b.x} onChange={e => setBlue(B => B.map((p, k) => k === i ? { ...p, x: round01(parseNum(e.target.value)) } : p))} className={`w-16 border rounded px-1 ${(viol.blue[i]?.x) ? 'border-red-500 bg-red-50' : ''}`} title={(viol.blue[i]?.msg || []).join('\n')} /></td>
                  <td className="px-2"><input type="number" step={0.1} value={b.y} onChange={e => setBlue(B => B.map((p, k) => k === i ? { ...p, y: round01(parseNum(e.target.value)) } : p))} className={`w-16 border rounded px-1 ${(viol.blue[i]?.y) ? 'border-red-500 bg-red-50' : ''}`} title={(viol.blue[i]?.msg || []).join('\n')} /></td>
                  <td className="px-2"><input type="number" step={0.1} value={b.z} onChange={e => setBlue(B => B.map((p, k) => k === i ? { ...p, z: round01(parseNum(e.target.value)) } : p))} className={`w-16 border rounded px-1 ${(viol.blue[i]?.z) ? 'border-red-500 bg-red-50' : ''}`} title={(viol.blue[i]?.msg || []).join('\n')} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex gap-2 items-center flex-wrap">
            <button className={`px-4 py-2 rounded-lg text-white bg-blue-600 ${busy ? 'opacity-60' : 'hover:bg-blue-700'}`} onClick={generate} disabled={busy}> {busy ? 'Generando…' : 'Generar puntos'} </button>
            <button className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300" onClick={() => { setBlue([]); setMsg(''); setErr(false); }} disabled={busy || blue.length === 0}>Limpiar</button>
          </div>
          <div className={`mt-2 text-sm ${err ? 'text-rose-600' : 'text-emerald-700'}`}>{msg}</div>

          {/* Avisos de incoherencia (siempre en rojo) */}
          {(() => {
            const list: string[] = [];
            const pts: { name: string; p: P3 }[] = [{ name: 'F1', p: F1 }, { name: 'F2', p: F2 }, ...blue.map((b, i) => ({ name: `P${i + 1}`, p: b }))];
            (["x", "y", "z"] as const).forEach(axis => { const map = new Map<string, string[]>(); pts.forEach(({ name, p }) => { const k = key01((p as any)[axis]); if (!map.has(k)) map.set(k, []); map.get(k)!.push(name); }); for (const [k, names] of map) if (names.length > 1) list.push(`${axis.toUpperCase()} repetida (= ${k}) entre ${names.join(', ')}`); });
            const pd = planarDistances(F1, F2); const dx = Math.abs(F1.x - F2.x), dy = Math.abs(F1.y - F2.y), dz = Math.abs(F1.z - F2.z);
            if (pd.xy < 0.7) list.push(`F1 y F2: XY = ${pd.xy.toFixed(2)} < 0,7 m`);
            if (pd.xz < 0.7) list.push(`F1 y F2: XZ = ${pd.xz.toFixed(2)} < 0,7 m`);
            if (pd.yz < 0.7) list.push(`F1 y F2: YZ = ${pd.yz.toFixed(2)} < 0,7 m`);
            if (dx < 0.7) list.push(`F1 y F2: |X| = ${dx.toFixed(2)} < 0,7 m`);
            if (dy < 0.7) list.push(`F1 y F2: |Y| = ${dy.toFixed(2)} < 0,7 m`);
            if (dz < 0.7) list.push(`F1 y F2: |Z| = ${dz.toFixed(2)} < 0,7 m`);
            return list.length ? (
              <div className="mt-2 p-2 border border-red-300 rounded bg-red-50 text-red-700 text-xs"><div className="font-medium mb-1">Avisos de incoherencia:</div><ul className="list-disc pl-4 space-y-0.5">{list.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
            ) : null;
          })()}

          <div className="text-[11px] text-gray-600 mt-3">Reglas: margen ≥ 0,5 a caras (incluye Z); F1–F2 ≥ 0,7 en XY, XZ y YZ (por planos) y también |X|, |Y|, |Z| ≥ 0,7; F–P ≥ 1,0 (3D); P–P ≥ 0,7 (3D); coordenadas en pasos de 0,1.</div>
        </section>
      </div>
    </div>
  );
}

// ===== Tests ligeros (dev) =====
function runDevTests() {
  const poly = [ {x:0,y:0},{x:3,y:0},{x:3,y:2},{x:0,y:2} ];
  console.assert(pointInPolygon({x:1,y:1}, poly) === true, "PIP inside true");
  console.assert(pointInPolygon({x:3.1,y:1}, poly) === false, "PIP outside false");
  const F1t = {x:0.5,y:1.5,z:1.8}, F2t = {x:2.5,y:0.5,z:1.1};
  const pdOK = planarDistances(F1t, F2t); console.assert(pdOK.xy>=0.7 && pdOK.xz>=0.7 && pdOK.yz>=0.7, "planar dist >=0.7");
}
if (typeof window !== "undefined" && !(window as any).__PTS_DEV_TESTED__) { (window as any).__PTS_DEV_TESTED__ = true; try { runDevTests(); } catch (e) { console.warn(e); } }
