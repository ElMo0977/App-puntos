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

// Descargas/clipboard
function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Input numérico tolerante (spinner = inmediato; tecleo = al salir/Enter)
function NumInput({
  value,
  onCommit,
  className,
  title,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  title?: string;
}) {
  const [txt, setTxt] = useState("");
  const [focus, setFocus] = useState(false);
  const [typing, setTyping] = useState(false); // true cuando el usuario está tecleando

  useEffect(() => {
    if (!focus) {
      setTxt("");
      setTyping(false);
    }
  }, [value, focus]);

  const display = focus ? txt : String(value);
  const re = /^-?\d*(?:[.,]\d*)?$/; // vacío, dígitos y separador . o ,

  return (
    <input
      type="number"
      step={0.1}
      lang="en" // asegura que el "." del teclado numérico funcione
      inputMode="decimal"
      value={display}
      title={title}
      onFocus={() => {
        setFocus(true);
        setTxt(value.toFixed(1));
        setTyping(false);
      }}
      onChange={(e) => {
        const el = e.target as HTMLInputElement;
        const s = el.value;
        if (s === "" || re.test(s)) {
          setTxt(s);
          // Si NO estamos tecleando (spinner/rueda), confirmamos al instante
          if (!typing) {
            const n = round01(parseNum(s === "" ? String(value) : s, value));
            setTxt(n.toFixed(1));
            onCommit(n);
          }
        }
      }}
      onBlur={() => {
        setFocus(false);
        const n = round01(parseNum(display === "" ? String(value) : display, value));
        onCommit(n);
        setTyping(false);
      }}
      onKeyDown={(e) => {
        // Flechas / PageUp-PageDown => commit inmediato
        if (
          e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "PageUp" ||
          e.key === "PageDown"
        ) {
          e.preventDefault();
          const step = e.key === "PageUp" || e.key === "PageDown" ? 1.0 : 0.1;
          const dir = e.key === "ArrowUp" || e.key === "PageUp" ? 1 : -1;
          const base = focus
            ? parseNum(display === "" ? String(value) : display, value)
            : value;
          const next = round01(base + dir * step);
          setTxt(next.toFixed(1));
          onCommit(next);
          setTyping(false);
          return;
        }
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
          return;
        }
        // Cualquier otra tecla de edición => modo tecleo (commit al salir/Enter)
        if (
          (e.key.length === 1 && /[0-9.,-]/.test(e.key)) ||
          e.key === "Backspace" ||
          e.key === "Delete"
        ) {
          setTyping(true);
        }
      }}
      className={className}
    />
  );
}

// Geometría
function dist3D(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  const dx = a.x - b.x,
    dy = a.y - b.y,
    dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function planarDistances(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
) {
  const dx = a.x - b.x,
    dy = a.y - b.y,
    dz = a.z - b.z;
  return { xy: Math.hypot(dx, dy), xz: Math.hypot(dx, dz), yz: Math.hypot(dy, dz) };
}
function pointInPolygon(pt: { x: number; y: number }, poly: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const hit =
      (yi > pt.y) !== (yj > pt.y) &&
      pt.x < ((xj - xi) * (pt.y - yi)) / ((yj - yi) + EPS) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
function polygonArea(poly: Array<{ x: number; y: number }>) {
  let A = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    A += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return Math.abs(A) / 2;
}
function distPointToSegment2D(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  const vx = b.x - a.x,
    vy = b.y - a.y,
    wx = p.x - a.x,
    wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= EPS) return Math.hypot(p.x - a.x, p.y - a.y);
  if (c1 >= c2) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  const proj = { x: a.x + t * vx, y: a.y + t * vy };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}
function minDistToEdges2D(p: { x: number; y: number }, poly: Array<{ x: number; y: number }>) {
  let md = Infinity;
  for (let i = 0; i < poly.length; i++)
    md = Math.min(md, distPointToSegment2D(p, poly[i], poly[(i + 1) % poly.length]));
  return md;
}

// RNG simple reproducible
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], rng: () => number) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ===== Reglas =====
const MARGIN = 0.5; // a caras (incluye Z)
const MIN_RED_BLUE = 1.0; // F–P ≥ 1,0 m (3D)
const MIN_BLUE_BLUE = 0.7; // P–P ≥ 0,7 m (3D)

// ===== Tipos =====
type P3 = { x: number; y: number; z: number };

type GenResult = { points: P3[]; feasible: boolean };

// ===== Generador de puntos azules =====
function generateBluePoints({
  F1,
  F2,
  candidates,
  seed,
  genNonce,
  f1Active = true,
  f2Active = true,
}: {
  F1: P3;
  F2: P3;
  candidates: P3[];
  seed: string;
  genNonce: number;
  f1Active?: boolean;
  f2Active?: boolean;
}): GenResult {
  if (!candidates.length) return { points: [], feasible: false };

  // RNG: si hay semilla, determinista; si no, varía con genNonce para dar combinaciones distintas por clic
  const userSeed = seed ? Array.from(seed).reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const rng = mulberry32(seed ? userSeed : ((Date.now() ^ (genNonce * 0x9e3779b9)) >>> 0));

  // Preferencia de Z: P1=1.0 y +0.1 por punto, pero podremos ajustar
  const desiredZ = [1.0, 1.1, 1.2, 1.3, 1.4].map(round01);
  const zLevelsAll = Array.from(new Set(candidates.map(c => key01(c.z)))).map(parseFloat).sort((a,b)=>a-b);

  // Nota: a partir de la nueva regla, las Z de azules pueden coincidir con F1/F2
  const usedZFromRed = new Set<string>();
  if (false && f1Active) usedZFromRed.add(key01(F1.z));
  if (false && f2Active) usedZFromRed.add(key01(F2.z));

  // zOptions por índice: ordenados por cercanía al deseado + jitter y rotación aleatoria para diversificar
  const zOptionsByIdx: number[][] = desiredZ.map((dz) => {
    const arr = zLevelsAll
      .map(z => ({ z, k: Math.abs(z - dz) + rng()*0.001 }))
      .sort((a,b)=>a.k-b.k)
      .map(e=>e.z);
    if (!seed && arr.length) {
      const rot = Math.floor(rng()*arr.length);
      return [...arr.slice(rot), ...arr.slice(0, rot)];
    }
    return arr;
  });

  // Índices rápidos por Z
  const byZ = new Map<string, P3[]>();
  for (const c of candidates) {
    const k = key01(c.z); if (!byZ.has(k)) byZ.set(k, []); byZ.get(k)!.push(c);
  }

  const redAnchors = () => [ ...(f1Active ? [F1] : []), ...(f2Active ? [F2] : []) ];
  const minDistToSet = (p: P3, set: P3[]) => set.reduce((m, q) => Math.min(m, dist3D(p, q)), Infinity);
  const scoreMaximin = (cand: P3, chosen: P3[]) => {
    const anchors = [...redAnchors(), ...chosen];
    const baseDist = minDistToSet(cand, anchors);
    const dB = chosen.length ? Math.min(...chosen.map(q => dist3D(cand, q))) : baseDist;
    const dR = redAnchors().length ? Math.min(...redAnchors().map(r => dist3D(cand, r))) : Infinity;
    return Math.min(dB, dR) * 10 + dB * 2 + (Number.isFinite(dR) ? dR : 0) + rng() * 0.05;
  };

  // Conjuntos usados por unicidad (incluye fuentes activas)
  const usedX0 = new Set<string>();
  const usedY0 = new Set<string>();
  // Z únicas solo entre puntos azules
  const usedZ0 = new Set<string>();
  if (f1Active) { usedX0.add(key01(F1.x)); usedY0.add(key01(F1.y)); }
  if (f2Active) { usedX0.add(key01(F2.x)); usedY0.add(key01(F2.y)); }

  // Backtracking: recoge múltiples soluciones válidas para poder rotarlas entre clics
  const MAX_NODES = 60000; let nodes = 0;
  // Ajuste dinámico para mejorar rendimiento en recintos grandes
  const baseTOPC = 22; const baseTOPZ = 18;
  const scaleFactor = Math.max(0.5, Math.min(1, 5000 / Math.max(1, candidates.length)));
  const TOPC = Math.max(8, Math.floor(baseTOPC * scaleFactor));
  const TOPZ = Math.max(6, Math.floor(baseTOPZ * scaleFactor));
  const MAX_SOL = 20; // cuántas soluciones guardamos
  const solutions: P3[][] = [];

  function dfs(i: number, chosen: P3[], usedX: Set<string>, usedY: Set<string>, usedZ: Set<string>): boolean {
    if (nodes++ > MAX_NODES) return false;
    if (i === 5) { solutions.push(chosen.slice()); return solutions.length >= MAX_SOL; }

    const zList = zOptionsByIdx[i].slice(0, Math.min(TOPZ, zOptionsByIdx[i].length));
    for (const z of zList) {
      const zk = key01(z);
      if (usedZ.has(zk)) continue; // Z único solo entre azules
      let pool = (byZ.get(zk) || []).filter(c => !usedX.has(key01(c.x)) && !usedY.has(key01(c.y)));
      if (!pool.length) continue;

      const poolOk = pool.filter(c => redAnchors().every(r => dist3D(c, r) >= MIN_RED_BLUE) && chosen.every(q => dist3D(c, q) >= MIN_BLUE_BLUE));
      const base = (poolOk.length ? poolOk : pool);

      const ranked = base.map(c => ({ c, s: scoreMaximin(c, chosen) + rng()*0.02 }))
        .sort((a,b)=>b.s-a.s)
        .slice(0, Math.min(TOPC, base.length));

      for (const { c } of ranked) {
        const nx = new Set(usedX); nx.add(key01(c.x));
        const ny = new Set(usedY); ny.add(key01(c.y));
        const nz = new Set(usedZ); nz.add(zk);
        if (dfs(i+1, [...chosen, c], nx, ny, nz)) return true; // early stop si ya tenemos MAX_SOL
      }
    }
    return false;
  }

  dfs(0, [], usedX0, usedY0, usedZ0);

  // Pequeño refinamiento local para homogeneidad (maximin) sobre la solución elegida
  function refine(pts: P3[]): P3[] {
    let best = pts.slice();
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < best.length; i++) {
        const zi = key01(best[i].z);
        const pool = (byZ.get(zi) || []).filter(c =>
          key01(c.x) !== key01(best[i].x) && key01(c.y) !== key01(best[i].y) && // cambio real
          !best.some((q, k) => k !== i && (key01(q.x) === key01(c.x) || key01(q.y) === key01(c.y)))
        );
        let cand = best[i];
        let score = scoreMaximin(cand, best.filter((_,k)=>k!==i));
        for (const p of pool) {
          const sc = scoreMaximin(p, best.filter((_,k)=>k!==i));
          if (sc > score) { score = sc; cand = p; }
        }
        best[i] = cand;
      }
    }
    return best;
  }

  if (solutions.length) {
    const idx = seed ? 0 : (genNonce % solutions.length);
    let pick = solutions[idx].slice();
    pick = refine(pick);
    return { points: pick, feasible: true };
  }

  // Fallback: no factible => devuelve 5 puntos maximizando separación (puede violar reglas).
  const anchors0 = redAnchors();
  const chosen: P3[] = [];
  const usedX = new Set(usedX0), usedY = new Set(usedY0), usedZ = new Set(usedZ0);
  const all = shuffle(candidates, rng);

  for (let k = 0; k < 5; k++) {
    const levels = [
      (c: P3) => !usedX.has(key01(c.x)) && !usedY.has(key01(c.y)) && !usedZ.has(key01(c.z)) && anchors0.every(r => dist3D(c, r) >= MIN_RED_BLUE) && chosen.every(q => dist3D(c, q) >= MIN_BLUE_BLUE),
      (c: P3) => !usedX.has(key01(c.x)) && !usedY.has(key01(c.y)) && !usedZ.has(key01(c.z)) && anchors0.every(r => dist3D(c, r) >= MIN_RED_BLUE),
      (c: P3) => !usedX.has(key01(c.x)) && !usedY.has(key01(c.y)) && !usedZ.has(key01(c.z)),
      (_: P3) => true,
    ];
    let picked: P3 | null = null;
    for (const ok of levels) {
      const cand = all.filter(ok).map(c => ({ c, s: scoreMaximin(c, chosen) }))
        .sort((a,b)=>b.s-a.s).slice(0, 20);
      if (cand.length) { picked = cand[Math.floor(rng()*cand.length)].c; break; }
    }
    if (picked) { chosen.push(picked); usedX.add(key01(picked.x)); usedY.add(key01(picked.y)); usedZ.add(key01(picked.z)); }
  }
  while (chosen.length < 5 && candidates.length) { const extra = candidates[Math.floor(rng()*candidates.length)]; chosen.push(extra); }
  return { points: chosen.slice(0,5), feasible: false };
}

// ===== App =====
export default function App() {
  // Polígono y altura
  const [vertices, setVertices] = useState<Array<{ x: number; y: number }>>([
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 2 },
    { x: 0, y: 2 },
  ]);
  const [alturaZ, setAlturaZ] = useState(2.5);

  // Fuentes y receptores
  const [F1, setF1] = useState<P3>({ x: 0.5, y: 1.5, z: 1.8 });
  const [F2, setF2] = useState<P3>({ x: 2.5, y: 0.5, z: 1.1 });
  const [activeF1, setActiveF1] = useState(true);
  const [activeF2, setActiveF2] = useState(true);
  const [blue, setBlue] = useState<P3[]>([]);

  // UI
  const radii = [0.5, 0.7, 1.0, 2.0] as const;
  const [ringsRed, setRingsRed] = useState<Record<number, boolean>>({
    0.5: true,
    0.7: true,
    1: false,
    2: false,
  });
  const [ringsBlue, setRingsBlue] = useState<Record<number, boolean>>({
    0.5: true,
    0.7: true,
    1: false,
    2: false,
  });
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  const [nonce, setNonce] = useState(0);

  // ===== Historial (Atrás / Adelante) =====
  type Snap = {
    vertices: Array<{ x: number; y: number }>;
    alturaZ: number;
    F1: P3;
    F2: P3;
    activeF1: boolean;
    activeF2: boolean;
    blue: P3[];
    ringsRed: Record<number, boolean>;
    ringsBlue: Record<number, boolean>;
    seed: string;
  };
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const takeSnapshot = (): Snap =>
    JSON.parse(
      JSON.stringify({
        vertices,
        alturaZ,
        F1,
        F2,
        activeF1,
        activeF2,
        blue,
        ringsRed,
        ringsBlue,
        seed,
      })
    );
  const applySnapshot = (s: Snap) => {
    setVertices(s.vertices);
    setAlturaZ(s.alturaZ);
    setF1(s.F1);
    setF2(s.F2);
    setActiveF1(s.activeF1);
    setActiveF2(s.activeF2);
    setBlue(s.blue);
    setRingsRed(s.ringsRed);
    setRingsBlue(s.ringsBlue);
    setSeed(s.seed);
  };
  const record = () => {
    setPast((p) => [...p, takeSnapshot()]);
    setFuture([]);
  };
  const undo = () => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [takeSnapshot(), ...f]);
      applySnapshot(prev);
      return p.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setPast((p) => [...p, takeSnapshot()]);
      applySnapshot(next);
      return f.slice(1);
    });
  };

  // Persistencia ligera (cargar/guardar)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("puntos_app_state_min");
      if (raw) {
        const s = JSON.parse(raw);
        s.vertices && setVertices(s.vertices);
        typeof s.alturaZ === "number" && setAlturaZ(s.alturaZ);
        s.F1 && setF1(s.F1);
        s.F2 && setF2(s.F2);
        typeof s.activeF1 === "boolean" && setActiveF1(s.activeF1);
        typeof s.activeF2 === "boolean" && setActiveF2(s.activeF2);
        s.blue && setBlue(s.blue);
        s.ringsRed && setRingsRed(s.ringsRed);
        s.ringsBlue && setRingsBlue(s.ringsBlue);
        s.seed && setSeed(s.seed);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        "puntos_app_state_min",
        JSON.stringify({
          vertices,
          alturaZ,
          F1,
          F2,
          activeF1,
          activeF2,
          blue,
          ringsRed,
          ringsBlue,
          seed,
        })
      );
    } catch {}
  }, [vertices, alturaZ, F1, F2, activeF1, activeF2, blue, ringsRed, ringsBlue, seed]);

  // Escala y helpers de dibujo
  const width = 760,
    height = 540,
    pad = 50;
  const bounds = useMemo(() => {
    const xs = vertices.map((v) => v.x),
      ys = vertices.map((v) => v.y);
    return {
      minX: Math.min(0, ...xs),
      maxX: Math.max(...xs),
      minY: Math.min(0, ...ys),
      maxY: Math.max(...ys),
    };
  }, [vertices]);
  const scale = useMemo(() => {
    const wu = Math.max(1e-3, bounds.maxX - bounds.minX),
      hu = Math.max(1e-3, bounds.maxY - bounds.minY);
    return Math.min((width - 2 * pad) / wu, (height - 2 * pad) / hu);
  }, [bounds]);
  const toSvg = (p: { x: number; y: number }) => ({
    x: pad + (p.x - bounds.minX) * scale,
    y: height - pad - (p.y - bounds.minY) * scale,
  });

  // Celdas XY válidas y niveles Z válidos
  const xyCells = useMemo(() => {
    const xs: number[] = [],
      ys: number[] = [];
    const bx = {
      min: Math.min(...vertices.map((v) => v.x)),
      max: Math.max(...vertices.map((v) => v.x)),
    };
    const by = {
      min: Math.min(...vertices.map((v) => v.y)),
      max: Math.max(...vertices.map((v) => v.y)),
    };
    for (
      let x = Math.ceil((bx.min + MARGIN) * 10) / 10;
      x <= bx.max - MARGIN + EPS;
      x += STEP
    )
      xs.push(round01(x));
    for (
      let y = Math.ceil((by.min + MARGIN) * 10) / 10;
      y <= by.max - MARGIN + EPS;
      y += STEP
    )
      ys.push(round01(y));
    const out: Array<{ x: number; y: number }> = [];
    for (const x of xs)
      for (const y of ys) {
        const p = { x, y };
        if (!pointInPolygon(p, vertices)) continue;
        if (minDistToEdges2D(p, vertices) < MARGIN - EPS) continue;
        out.push(p);
      }
    return out;
  }, [vertices]);
  const zLevels = useMemo(() => {
    const v: number[] = [];
    for (
      let z = Math.ceil(MARGIN * 10) / 10;
      z <= alturaZ - MARGIN + EPS;
      z += STEP
    )
      v.push(round01(z));
    return v;
  }, [alturaZ]);
  const candidates = useMemo(() => {
    const out: P3[] = [];
    for (const p of xyCells) for (const z of zLevels) out.push({ x: p.x, y: p.y, z });
    return out;
  }, [xyCells, zLevels]);

  // Validación y avisos
  type Mark = { x: boolean; y: boolean; z: boolean; msg: string[] };
  const [viol, setViol] = useState<{ F1: Mark; F2: Mark; blue: Mark[] }>(
    { F1: { x: false, y: false, z: false, msg: [] }, F2: { x: false, y: false, z: false, msg: [] }, blue: [] }
  );

  const validate = useCallback(() => {
    const v: { F1: Mark; F2: Mark; blue: Mark[] } = {
      F1: { x: false, y: false, z: false, msg: [] },
      F2: { x: false, y: false, z: false, msg: [] },
      blue: blue.map(() => ({ x: false, y: false, z: false, msg: [] })),
    };
    const markDup = (axis: "x" | "y" | "z") => {
      const map = new Map<string, Array<{ who: "F1" | "F2" | "B"; i: number }>>();
      const add = (who: "F1" | "F2" | "B", i: number, val: number) => {
        const k = key01(val);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push({ who, i });
      };
      // Para Z: no marcamos duplicidades entre azules y rojos
      if (axis !== "z") {
        if (activeF1) add("F1", -1, (F1 as any)[axis]);
        if (activeF2) add("F2", -1, (F2 as any)[axis]);
      }
      blue.forEach((b, i) => add("B", i, (b as any)[axis]));
      for (const [, list] of map)
        if (list.length > 1)
          list.forEach((e) => {
            if (e.who === "F1") {
              (v.F1 as any)[axis] = true;
              v.F1.msg.push(`${axis.toUpperCase()} repetida`);
            } else if (e.who === "F2") {
              (v.F2 as any)[axis] = true;
              v.F2.msg.push(`${axis.toUpperCase()} repetida`);
            } else {
              (v.blue[e.i] as any)[axis] = true;
              v.blue[e.i].msg.push(`${axis.toUpperCase()} repetida`);
            }
          });
    };
    (["x", "y", "z"] as const).forEach(markDup);

    const check = (p: P3, t: Mark) => {
      if (!pointInPolygon(p, vertices)) {
        t.x = t.y = true;
        t.msg.push("Fuera del polígono (XY)");
      }
      if (minDistToEdges2D(p, vertices) < MARGIN - EPS) {
        t.x = t.y = true;
        t.msg.push("A <0,5 del borde (XY)");
      }
      if (p.z < MARGIN || p.z > alturaZ - MARGIN) {
        t.z = true;
        t.msg.push("Z fuera de márgenes");
      }
    };
    if (activeF1) check(F1, v.F1);
    if (activeF2) check(F2, v.F2);
    blue.forEach((b, i) => check(b, v.blue[i]));

    if (activeF1 && activeF2) {
      const pd = planarDistances(F1, F2);
      const dx = Math.abs(F1.x - F2.x),
        dy = Math.abs(F1.y - F2.y),
        dz = Math.abs(F1.z - F2.z);
      if (pd.xy < 0.7) {
        v.F1.x = v.F1.y = v.F2.x = v.F2.y = true;
        v.F1.msg.push(`F1–F2 < 0,7 en XY (${pd.xy.toFixed(2)} m)`);
        v.F2.msg.push(`F1–F2 < 0,7 en XY (${pd.xy.toFixed(2)} m)`);
      }
      if (pd.xz < 0.7) {
        v.F1.x = v.F1.z = v.F2.x = v.F2.z = true;
        v.F1.msg.push(`F1–F2 < 0,7 en XZ (${pd.xz.toFixed(2)} m)`);
        v.F2.msg.push(`F1–F2 < 0,7 en XZ (${pd.xz.toFixed(2)} m)`);
      }
      if (pd.yz < 0.7) {
        v.F1.y = v.F1.z = v.F2.y = v.F2.z = true;
        v.F1.msg.push(`F1–F2 < 0,7 en YZ (${pd.yz.toFixed(2)} m)`);
        v.F2.msg.push(`F1–F2 < 0,7 en YZ (${pd.yz.toFixed(2)} m)`);
      }
      if (dx < 0.7) {
        v.F1.x = v.F2.x = true;
        v.F1.msg.push(`F1–F2: |X| = ${dx.toFixed(2)} < 0,7 m`);
        v.F2.msg.push(`F1–F2: |X| = ${dx.toFixed(2)} < 0,7 m`);
      }
      if (dy < 0.7) {
        v.F1.y = v.F2.y = true;
        v.F1.msg.push(`F1–F2: |Y| = ${dy.toFixed(2)} < 0,7 m`);
        v.F2.msg.push(`F1–F2: |Y| = ${dy.toFixed(2)} < 0,7 m`);
      }
      if (dz < 0.7) {
        v.F1.z = v.F2.z = true;
        v.F1.msg.push(`F1–F2: |Z| = ${dz.toFixed(2)} < 0,7 m`);
        v.F2.msg.push(`F1–F2: |Z| = ${dz.toFixed(2)} < 0,7 m`);
      }
    }

    blue.forEach((b, i) => {
      if (activeF1 && dist3D(b, F1) < MIN_RED_BLUE) {
        v.blue[i].x = v.blue[i].y = v.blue[i].z = true;
        v.blue[i].msg.push(
          `Distancia a F1 < 1,0 (=${dist3D(b, F1).toFixed(2)} m)`
        );
      }
      if (activeF2 && dist3D(b, F2) < MIN_RED_BLUE) {
        v.blue[i].x = v.blue[i].y = v.blue[i].z = true;
        v.blue[i].msg.push(
          `Distancia a F2 < 1,0 (=${dist3D(b, F2).toFixed(2)} m)`
        );
      }
    });
    for (let i = 0; i < blue.length; i++)
      for (let j = i + 1; j < blue.length; j++) {
        const d = dist3D(blue[i], blue[j]);
        if (d < MIN_BLUE_BLUE) {
          v.blue[i].x = v.blue[i].y = v.blue[i].z = true;
          v.blue[j].x = v.blue[j].y = v.blue[j].z = true;
          v.blue[i].msg.push(`P${i + 1}–P${j + 1} < 0,7 (=${d.toFixed(2)} m)`);
          v.blue[j].msg.push(`P${i + 1}–P${j + 1} < 0,7 (=${d.toFixed(2)} m)`);
        }
      }

    v.F1.msg = Array.from(new Set(v.F1.msg));
    v.F2.msg = Array.from(new Set(v.F2.msg));
    v.blue.forEach((b) => (b.msg = Array.from(new Set(b.msg))));
    setViol(v);
  }, [F1, F2, blue, vertices, alturaZ, activeF1, activeF2]);
  useEffect(() => {
    const t = setTimeout(validate, 80);
    return () => clearTimeout(t);
  }, [validate]);

  // Helper: resumen de violaciones para un conjunto de puntos (para el mensaje de imposibilidad)
  const buildViolationSummary = (pts: P3[]): string[] => {
    const out: string[] = [];
    // márgenes y polígono
    pts.forEach((p, i) => {
      if (!pointInPolygon(p, vertices) || minDistToEdges2D(p, vertices) < MARGIN - EPS) out.push(`P${i+1} fuera del polígono o a <0,5 m del borde`);
      if (p.z < MARGIN || p.z > alturaZ - MARGIN) out.push(`P${i+1} con Z fuera de márgenes`);
    });
    // duplicidades por ejes (Z solo única entre azules; puede coincidir con F1/F2)
    (["x","y","z"] as const).forEach(axis => {
      const map = new Map<string, string[]>();
      if (axis !== 'z') {
        if (activeF1) { const k = key01((F1 as any)[axis]); map.set(k, [...(map.get(k)||[]), 'F1']); }
        if (activeF2) { const k = key01((F2 as any)[axis]); map.set(k, [...(map.get(k)||[]), 'F2']); }
      }
      pts.forEach((p,i)=>{ const k=key01((p as any)[axis]); map.set(k, [...(map.get(k)||[]), `P${i+1}`]); });
      for (const [k, names] of map) if (names.length>1) out.push(`${axis.toUpperCase()} repetida (= ${k}) entre ${names.join(', ')}`);
    });
    // distancias
    pts.forEach((p,i)=>{
      if (activeF1) { const d=dist3D(p,F1); if (d < MIN_RED_BLUE) out.push(`P${i+1} a F1 = ${d.toFixed(2)} < 1,0 m`); }
      if (activeF2) { const d=dist3D(p,F2); if (d < MIN_RED_BLUE) out.push(`P${i+1} a F2 = ${d.toFixed(2)} < 1,0 m`); }
    });
    for (let i=0;i<pts.length;i++) for (let j=i+1;j<pts.length;j++) { const d=dist3D(pts[i],pts[j]); if (d < MIN_BLUE_BLUE) out.push(`P${i+1}–P${j+1} = ${d.toFixed(2)} < 0,7 m`); }
    return Array.from(new Set(out));
  };

  // Generación
  const doGenerate = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setErr(false);
    setMsg("Generando puntos...");
    // grabar estado previo para poder deshacer la generación
    setPast((p) => [...p, JSON.parse(JSON.stringify({
      vertices, alturaZ, F1, F2, activeF1, activeF2, blue, ringsRed, ringsBlue, seed
    }))]);
    setFuture([]);

    setTimeout(() => {
      try {
        const res = generateBluePoints({
          F1,
          F2,
          candidates,
          seed,
          genNonce: nonce,
          f1Active: activeF1,
          f2Active: activeF2,
        });
        setBlue(res.points);

        const issues = buildViolationSummary(res.points);
        if (res.feasible && issues.length === 0) {
          setErr(false);
          setMsg(`✓ Generados ${res.points.length} puntos válidos.`);
        } else if (res.feasible) {
          setErr(false);
          setMsg(`✓ Generados ${res.points.length} puntos. Revisa posibles avisos:\n• ${issues.slice(0,6).join("\n• ")}`);
        } else {
          setErr(true);
          setMsg(`⚠️ No es posible cumplir todas las reglas con esta geometría. Se muestran 5 puntos maximizando separación.\n• ${issues.slice(0,8).join("\n• ")}`);
        }
        if (!seed) setNonce((n) => n + 1);
      } catch (e) {
        console.error(e);
        setErr(true);
        setMsg("Error al generar puntos.");
      } finally {
        setBusy(false);
      }
    }, 10);
  }, [busy, candidates, seed, nonce, F1, F2, activeF1, activeF2]);

  const generateAnother = useCallback(() => {
    setNonce((n) => n + 1);
    doGenerate();
  }, [doGenerate]);

  // CSV helpers
  const csvText = useMemo(() => {
    const rows = [
      ["Punto", "X", "Y", "Z"],
      ...(activeF1 ? [[`F1`, F1.x.toFixed(1), F1.y.toFixed(1), F1.z.toFixed(1)]] : []),
      ...(activeF2 ? [[`F2`, F2.x.toFixed(1), F2.y.toFixed(1), F2.z.toFixed(1)]] : []),
      ...blue.map((b, i) => [`P${i + 1}`, b.x.toFixed(1), b.y.toFixed(1), b.z.toFixed(1)]),
    ];
    return rows.map(r => r.join(";"))
      .join("\n");
  }, [blue, F1, F2, activeF1, activeF2]);

  // Dibujo: rejilla + ejes + polígono + puntos
  const GridAxes = useMemo(() => {
    const axisColor = "#bfbfbf";
    const els: JSX.Element[] = []; // rejilla menor 0,1 y mayor 0,5
    for (let x = Math.ceil(bounds.minX / STEP) * STEP; x <= bounds.maxX + EPS; x += STEP) {
      const sx = pad + (x - bounds.minX) * scale;
      els.push(<line key={"gx" + x} x1={sx} y1={pad} x2={sx} y2={height - pad} stroke="#e5e7eb" />);
    }
    for (let y = Math.ceil(bounds.minY / STEP) * STEP; y <= bounds.maxY + EPS; y += STEP) {
      const sy = height - pad - (y - bounds.minY) * scale;
      els.push(<line key={"gy" + y} x1={pad} y1={sy} x2={width - pad} y2={sy} stroke="#e5e7eb" />);
    }
    for (let x = Math.ceil(bounds.minX / 0.5) * 0.5; x <= bounds.maxX + EPS; x += 0.5) {
      const sx = pad + (x - bounds.minX) * scale;
      els.push(<line key={"GX" + x} x1={sx} y1={pad} x2={sx} y2={height - pad} stroke="#c7cdd6" />);
      els.push(
        <text key={"TX" + x} x={sx} y={height - pad + 14} fontSize={10} textAnchor="middle" fill="#666">
          {x.toFixed(1)}
        </text>
      );
    }
    for (let y = Math.ceil(bounds.minY / 0.5) * 0.5; y <= bounds.maxY + EPS; y += 0.5) {
      const sy = height - pad - (y - bounds.minY) * scale;
      els.push(<line key={"GY" + y} x1={pad} y1={sy} x2={width - pad} y2={sy} stroke="#c7cdd6" />);
      els.push(
        <text key={"TY" + y} x={pad - 8} y={sy + 3} fontSize={10} textAnchor="end" fill="#666">
          {y.toFixed(1)}
        </text>
      );
    }
    const O = {
      x: pad + (0 - bounds.minX) * scale,
      y: height - pad - (0 - bounds.minY) * scale,
    };
    els.push(<line key="ax" x1={pad} y1={O.y} x2={width - pad} y2={O.y} stroke={axisColor} />);
    els.push(<line key="ay" x1={O.x} y1={height - pad} x2={O.x} y2={pad} stroke={axisColor} />);
    return <g>{els}</g>;
  }, [bounds, scale]);

  const area = useMemo(() => polygonArea(vertices), [vertices]);
  const volumen = useMemo(() => area * alturaZ, [area, alturaZ]);

  const feasibleBadge = (
    <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${err ? 'border-rose-300 text-rose-700 bg-rose-50' : 'border-emerald-300 text-emerald-700 bg-emerald-50'}`}>
      {err ? 'Imposible (con reglas estrictas)' : 'Factible'}
    </span>
  );

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">
        Distribución de Puntos Acústicos — UNE EN ISO 16283-1-2015
        {feasibleBadge}
      </h1>

      <div className="grid md:grid-cols-2 gap-3 items-stretch">
        {/* Datos del recinto */}
        <section className="p-2 rounded-xl shadow bg-white border text-sm">
          <h2 className="text-base font-medium mb-2">Datos del recinto</h2>
          {vertices.map((v, i) => (
            <div key={i} className="flex items-center gap-2 mb-1 text-xs">
              <span className="w-4 text-gray-500">{i + 1}</span>
              <label>X:</label>
              <NumInput
                value={v.x}
                onCommit={(val) => {
                  setPast((p) => [...p, takeSnapshot()]);
                  setFuture([]);
                  setVertices((V) => V.map((p, k) => (k === i ? { ...p, x: val } : p)));
                }}
                className="w-20 border rounded px-1"
              />
              <label>Y:</label>
              <NumInput
                value={v.y}
                onCommit={(val) => {
                  setPast((p) => [...p, takeSnapshot()]);
                  setFuture([]);
                  setVertices((V) => V.map((p, k) => (k === i ? { ...p, y: val } : p)));
                }}
                className="w-20 border rounded px-1"
              />
              <button
                onClick={() => {
                  setPast((p) => [...p, takeSnapshot()]);
                  setFuture([]);
                  setVertices((vs) => vs.filter((_, k) => k !== i));
                }}
                disabled={vertices.length <= 4}
                className="ml-1 px-2 py-0.5 border rounded hover:bg-red-50 text-red-600 disabled:opacity-50"
                title={
                  vertices.length <= 4
                    ? "Debe haber al menos 4 vértices"
                    : "Eliminar vértice"
                }
                aria-label="Eliminar vértice"
              >
                –
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-2 text-sm">
            <button
              onClick={() => {
                setPast((p) => [...p, takeSnapshot()]);
                setFuture([]);
                setVertices((v) => [...v, { x: 0, y: 0 }]);
              }}
              className="px-2 py-0.5 border rounded hover:bg-gray-50 text-xs"
            >
              + vértice
            </button>
            <label className="ml-2">Altura Z:</label>
            <NumInput
              value={alturaZ}
              onCommit={(val) => {
                setPast((p) => [...p, takeSnapshot()]);
                setFuture([]);
                setAlturaZ(val);
              }}
              className="w-24 border rounded px-1"
            />
            <span className="ml-auto text-xs text-gray-600">
              Área: {area.toFixed(2)} · Volumen: {volumen.toFixed(2)}
            </span>
          </div>
        </section>

        {/* Círculos de distancia */}
        <section className="p-2 rounded-xl shadow bg-white border text-sm">
          <h2 className="text-base font-medium mb-2">Círculos de distancia</h2>
          <table className="text-xs border w-full">
            <thead>
              <tr>
                <th className="px-2">r</th>
                <th className="px-2">Fuentes</th>
                <th className="px-2">Puntos de medida</th>
              </tr>
            </thead>
            <tbody>
              {radii.map((r) => (
                <tr key={r}>
                  <td className="px-2 py-1">{r.toFixed(1)} m</td>
                  <td className="px-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!ringsRed[r]}
                      onChange={() => {
                        setPast((p) => [...p, takeSnapshot()]);
                        setFuture([]);
                        setRingsRed((s) => ({ ...s, [r]: !s[r] }));
                      }}
                    />
                  </td>
                  <td className="px-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!ringsBlue[r]}
                      onChange={() => {
                        setPast((p) => [...p, takeSnapshot()]);
                        setFuture([]);
                        setRingsBlue((s) => ({ ...s, [r]: !s[r] }));
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs flex items-center gap-2">
            <label>Semilla:</label>
            <input
              type="text"
              value={seed}
              onChange={(e) => {
                setSeed(e.target.value);
              }}
              className="border rounded px-2 py-1"
              placeholder="(opcional)"
            />
            <span className="text-gray-500">Fija la distribución.</span>
          </div>
        </section>
      </div>

      {/* Dibujo + tabla */}
      <div className="flex gap-4 items-start">
        <div className="p-3 rounded-xl shadow bg-white border">
          <svg width={width} height={height}>
            {GridAxes}
            <polygon
              points={vertices
                .map((v) => {
                  const s = toSvg(v);
                  return `${s.x},${s.y}`;
                })
                .join(" ")}
              fill="#eef6ff"
              stroke="#93c5fd"
              strokeWidth={2}
            />

            {(() => {
              const draw = (
                p: P3,
                label: string,
                color: string,
                rings: Record<number, boolean>,
                active: boolean
              ) => {
                const s = toSvg(p);
                const groupOpacity = active ? 1 : 0.35; // atenuado cuando la fuente está desactivada
                return (
                  <g key={label} opacity={groupOpacity}>
                    {Object.entries(rings)
                      .filter(([, on]) => on)
                      .map(([rr]) => (
                        <circle
                          key={rr}
                          cx={s.x}
                          cy={s.y}
                          r={parseFloat(rr) * scale}
                          fill="none"
                          stroke={color}
                          opacity={0.35}
                        />
                      ))}
                    <circle cx={s.x} cy={s.y} r={5} fill={color} />
                    <text x={s.x + 6} y={s.y - 6} fontSize={11} fill={color}>
                      {label}
                    </text>
                  </g>
                );
              };

              return [
                draw(
                  F1,
                  `F1 (${F1.x.toFixed(1)}, ${F1.y.toFixed(1)}, ${F1.z.toFixed(1)})`,
                  "#e11d48",
                  ringsRed,
                  activeF1
                ),
                draw(
                  F2,
                  `F2 (${F2.x.toFixed(1)}, ${F2.y.toFixed(1)}, ${F2.z.toFixed(1)})`,
                  "#e11d48",
                  ringsRed,
                  activeF2
                ),
                ...blue.map((b, i) => {
                  const bad = !!(viol.blue[i]?.x || viol.blue[i]?.y || viol.blue[i]?.z);
                  const col = bad ? "#dc2626" : "#2563eb"; // rojo si incumple
                  return draw(
                    b,
                    `P${i + 1} (${b.x.toFixed(1)}, ${b.y.toFixed(1)}, ${b.z.toFixed(1)})`,
                    col,
                    ringsBlue,
                    true
                  );
                }),
              ];
            })()}
          </svg>
        </div>

        <section className="p-3 rounded-xl shadow bg-white border min-w-[460px]">
          <h2 className="text-base font-medium mb-2">Tabla de puntos (editable)</h2>
          
          <table className="text-xs">
            <thead>
              <tr>
                <th className="px-2">Activa</th>
                <th className="px-2">Punto</th>
                <th className="px-2">X</th>
                <th className="px-2">Y</th>
                <th className="px-2">Z</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "F1", val: F1, v: viol.F1, active: activeF1, setActive: setActiveF1 },
                { name: "F2", val: F2, v: viol.F2, active: activeF2, setActive: setActiveF2 },
              ].map((row: any) => (
                <tr key={row.name}>
                  <td className="px-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.active}
                      onChange={(e) => {
                        setPast((p) => [...p, takeSnapshot()]);
                        setFuture([]);
                        row.setActive(e.target.checked);
                      }}
                    />
                  </td>
                  <td className="px-2 font-medium">{row.name}</td>
                  <td className="px-2">
                    <NumInput
                      value={row.val.x}
                      onCommit={(val) => {
                        setPast((p) => [...p, takeSnapshot()]);
                        setFuture([]);
                        (row.name === "F1" ? setF1 : setF2)((p: P3) => ({ ...p, x: val }));
                      }}
                      className={`w-16 border rounded px-1 ${row.v.x ? "border-red-500 bg-red-50" : ""}`}
                      title={row.v.msg.join("\n")}
                    />
                  </td>
                  <td className="px-2">
                    <NumInput
                      value={row.val.y}
                      onCommit={(val) => {
                        setPast((p) => [...p, takeSnapshot()]);
                        setFuture([]);
                        (row.name === "F1" ? setF1 : setF2)((p: P3) => ({ ...p, y: val }));
                      }}
                      className={`w-16 border rounded px-1 ${row.v.y ? "border-red-500 bg-red-50" : ""}`}
                      title={row.v.msg.join("\n")}
                    />
                  </td>
                  <td className="px-2">
                    <NumInput
                      value={row.val.z}
                      onCommit={(val) => {
                        setPast((p) => [...p, takeSnapshot()]);
                        setFuture([]);
                        (row.name === "F1" ? setF1 : setF2)((p: P3) => ({ ...p, z: val }));
                      }}
                      className={`w-16 border rounded px-1 ${row.v.z ? "border-red-500 bg-red-50" : ""}`}
                      title={row.v.msg.join("\n")}
                    />
                  </td>
                </tr>
              ))}
              {blue.map((b, i) => (
                <tr key={i}>
                  <td className="px-2 text-center">—</td>
                  <td className="px-2">{`P${i + 1}`}</td>
                  <td className="px-2">
                    <NumInput
                      value={b.x}
                      onCommit={(val) => {
                        setPast((p) => [...p, takeSnapshot()]);
                        setFuture([]);
                        setBlue((B) => B.map((p, k) => (k === i ? { ...p, x: val } : p)));
                      }}
                      className={`w-16 border rounded px-1 ${viol.blue[i]?.x ? "border-red-500 bg-red-50" : ""}`}
                      title={(viol.blue[i]?.msg || []).join("\n")}
                    />
                  </td>
                  <td className="px-2">
                    <NumInput
                      value={b.y}
                      onCommit={(val) => {
                        setPast((p) => [...p, takeSnapshot()]);
                        setFuture([]);
                        setBlue((B) => B.map((p, k) => (k === i ? { ...p, y: val } : p)));
                      }}
                      className={`w-16 border rounded px-1 ${viol.blue[i]?.y ? "border-red-500 bg-red-50" : ""}`}
                      title={(viol.blue[i]?.msg || []).join("\n")}
                    />
                  </td>
                  <td className="px-2">
                    <NumInput
                      value={b.z}
                      onCommit={(val) => {
                        setPast((p) => [...p, takeSnapshot()]);
                        setFuture([]);
                        setBlue((B) => B.map((p, k) => (k === i ? { ...p, z: val } : p)));
                      }}
                      className={`w-16 border rounded px-1 ${viol.blue[i]?.z ? "border-red-500 bg-red-50" : ""}`}
                      title={(viol.blue[i]?.msg || []).join("\n")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex gap-2 items-center flex-wrap">
            <button
              className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
              onClick={undo}
              disabled={past.length === 0}
            >
              Atrás
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
              onClick={redo}
              disabled={future.length === 0}
            >
              Adelante
            </button>

            <button
              className={`px-4 py-2 rounded-lg text-white bg-blue-600 ${busy ? "opacity-60" : "hover:bg-blue-700"}`}
              onClick={doGenerate}
              disabled={busy}
            >
              {busy ? "Generando…" : "Generar puntos"}
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
              onClick={generateAnother}
              disabled={busy}
              title="Calcula otra combinación (misma geometría)"
            >
              Otra combinación
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
              onClick={() => {
                setPast((p) => [...p, takeSnapshot()]);
                setFuture([]);
                setBlue([]);
                setMsg("");
                setErr(false);
              }}
              disabled={busy || blue.length === 0}
            >
              Limpiar
            </button>

            <div className="ml-auto flex gap-2 items-center">
              <button
                className="px-3 py-2 rounded-lg bg-white border hover:bg-gray-50"
                onClick={() => downloadText("puntos.csv", csvText)}
                title="Descargar CSV (separador ;)"
              >
                Descargar CSV
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-white border hover:bg-gray-50"
                onClick={async () => {
                  const ok = await copyToClipboard(csvText);
                  setMsg(ok ? "✓ CSV copiado al portapapeles" : "No se pudo copiar el CSV")
                }}
              >
                Copiar CSV
              </button>
            </div>
          </div>

          <div className={`mt-2 text-sm ${err ? "text-rose-600" : "text-emerald-700"}`}
               role="status" aria-live="polite">
            {msg}
          </div>

          {/* Avisos de incoherencia (siempre en rojo) */}
          {(() => {
            const list: string[] = [];
            const pts: { name: string; p: P3 }[] = [
              ...(activeF1 ? [{ name: "F1", p: F1 }] : []),
              ...(activeF2 ? [{ name: "F2", p: F2 }] : []),
              ...blue.map((b, i) => ({ name: `P${i + 1}`, p: b })),
            ];
            (["x", "y", "z"] as const).forEach((axis) => {
              const map = new Map<string, string[]>();
              pts.forEach(({ name, p }) => {
                const k = key01((p as any)[axis]);
                if (!map.has(k)) map.set(k, []);
                map.get(k)!.push(name);
              });
              for (const [k, names] of map)
                if (names.length > 1)
                  list.push(`${axis.toUpperCase()} repetida (= ${k}) entre ${names.join(", ")}`);
            });
            if (activeF1 && activeF2) {
              const pd = planarDistances(F1, F2);
              const dx = Math.abs(F1.x - F2.x),
                dy = Math.abs(F1.y - F2.y),
                dz = Math.abs(F1.z - F2.z);
              if (pd.xy < 0.7) list.push(`F1 y F2: XY = ${pd.xy.toFixed(2)} < 0,7 m`);
              if (pd.xz < 0.7) list.push(`F1 y F2: XZ = ${pd.xz.toFixed(2)} < 0,7 m`);
              if (pd.yz < 0.7) list.push(`F1 y F2: YZ = ${pd.yz.toFixed(2)} < 0,7 m`);
              if (dx < 0.7) list.push(`F1 y F2: |X| = ${dx.toFixed(2)} < 0,7 m`);
              if (dy < 0.7) list.push(`F1 y F2: |Y| = ${dy.toFixed(2)} < 0,7 m`);
              if (dz < 0.7) list.push(`F1 y F2: |Z| = ${dz.toFixed(2)} < 0,7 m`);
            }
            return list.length ? (
              <div className="mt-2 p-2 border border-red-300 rounded bg-red-50 text-red-700 text-xs">
                <div className="font-medium mb-1">Avisos de incoherencia:</div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {list.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null;
          })()}

          <div className="text-[11px] text-gray-600 mt-3">
            Reglas: 1) X, Y y Z no pueden repetirse entre ningún punto (incluye F1 y F2 activas). 2) Margen ≥ 0,5 m a todas las caras (incluye Z). 3) F1–F2 ≥ 0,7 m en planos XY, XZ y YZ y además |X|, |Y|, |Z| ≥ 0,7 m. 4) F–P ≥ 1,0 m (3D). 5) P–P ≥ 0,7 m (3D). 6) Coordenadas en pasos de 0,1 m.
          </div>
        </section>
      </div>
    </div>
  );
}

// ===== Tests ligeros (dev) =====
function runDevTests() {
  const poly = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 2 },
    { x: 0, y: 2 },
  ];
  console.assert(pointInPolygon({ x: 1, y: 1 }, poly) === true, "PIP inside true");
  console.assert(pointInPolygon({ x: 3.1, y: 1 }, poly) === false, "PIP outside false");
  const F1t = { x: 0.5, y: 1.5, z: 1.8 },
    F2t = { x: 2.5, y: 0.5, z: 1.1 };
  const pdOK = planarDistances(F1t, F2t);
  console.assert(pdOK.xy >= 0.7 && pdOK.xz >= 0.7 && pdOK.yz >= 0.7, "planar dist >=0.7");

  // Test parseo de números
  console.assert(parseNum("1,2") === 1.2 && parseNum("1.2") === 1.2, "parseNum coma/punto");

  // Test generador simple sin fuentes (debería dar 5 puntos)
  const genCand = () => {
    const vv: P3[] = [];
    for (let x = 0.6; x <= 2.4; x += 0.4)
      for (let y = 0.6; y <= 1.4; y += 0.4)
        for (let z = 0.6; z <= 2.0; z += 0.2) vv.push({ x: round01(x), y: round01(y), z: round01(z) });
    return vv;
  };
  const res = generateBluePoints({ F1: F1t, F2: F2t, candidates: genCand(), seed: "", genNonce: 1, f1Active: false, f2Active: false });
  console.assert(res.points.length === 5, "generator returns 5 points when possible");
}
if (typeof window !== "undefined" && !(window as any).__PTS_DEV_TESTED__) {
  (window as any).__PTS_DEV_TESTED__ = true;
  try {
    runDevTests();
  } catch (e) {
    console.warn(e);
  }
}
