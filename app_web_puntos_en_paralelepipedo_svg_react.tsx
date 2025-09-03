import React, { useEffect, useMemo, useRef, useState } from "react";

// ===================== Utilidades geométricas =====================
const EPS = 1e-9;
const STEP = 0.1;

function roundToTenth(n: number) { return Math.round(n * 10) / 10; }

function dist3D(a: {x:number;y:number;z?:number}, b: {x:number;y:number;z?:number}) {
  const dx = a.x - b.x; const dy = a.y - b.y; const dz = (a.z||0) - (b.z||0);
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

function pointInPolygon(pt: {x:number;y:number}, poly: Array<{x:number;y:number}>) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + EPS) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonArea(poly: Array<{x:number;y:number}>) {
  let area = 0; const n = poly.length;
  for (let i=0;i<n;i++) { const j=(i+1)%n; area += poly[i].x*poly[j].y - poly[j].x*poly[i].y; }
  return Math.abs(area)/2;
}

function distPointToSegment2D(p: {x:number;y:number}, a: {x:number;y:number}, b: {x:number;y:number}) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const wx = p.x - a.x, wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  const proj = { x: a.x + t * vx, y: a.y + t * vy };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

function minDistToEdges2D(pt: {x:number;y:number}, poly: Array<{x:number;y:number}>) {
  let dmin = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]; const b = poly[(i + 1) % poly.length];
    dmin = Math.min(dmin, distPointToSegment2D(pt, a, b));
  }
  return dmin;
}

function shuffle<T>(arr: T[], rng: ()=>number = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// PRNG local (no tocamos Math.random)
function mulberry32(seed: number){
  let t = seed >>> 0;
  return function(){
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Spatial hash 3D para vecinos próximos
function makeHasher(cell: number) {
  const inv = 1 / cell;
  const key = (x:number,y:number,z?:number) => `${Math.floor(x*inv)}|${Math.floor(y*inv)}|${Math.floor((z||0)*inv)}`;
  return {
    key,
    idxs: [-1,0,1],
    neighKeys(x:number,y:number,z?:number){
      const ix = Math.floor(x*inv), iy = Math.floor(y*inv), iz = Math.floor((z||0)*inv);
      const out: string[] = [];
      for (let dx of this.idxs) for (let dy of this.idxs) for (let dz of this.idxs) out.push(`${ix+dx}|${iy+dy}|${iz+dz}`);
      return out;
    }
  };
}

// Helpers inmutables
function updateArrayItem<T>(arr: T[], index: number, updater: (item: T)=>T){
  return arr.map((it, i)=> i===index ? updater(it) : it);
}
function removeArrayItem<T>(arr: T[], index: number){ return arr.filter((_,i)=> i!==index); }

// ===================== Componente principal =====================
export default function App() {
  // Recinto (XY) y altura (Z)
  const [vertices, setVertices] = useState<Array<{x:number;y:number}>>([
    { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 },
  ]);
  const [alturaZ, setAlturaZ] = useState(2.5);

  // Fuentes (rojos)
  const [F1, setF1] = useState<{x:number;y:number;z:number}>({ x: 0.5, y: 1.5, z: 1.8 });
  const [F2, setF2] = useState<{x:number;y:number;z:number}>({ x: 2.5, y: 0.5, z: 1.1 });

  // Azules + visibilidad
  const [blue, setBlue] = useState<Array<{x:number;y:number;z:number}>>([]);
  const [showBlue, setShowBlue] = useState(true);

  // Semilla y estado de generación
  const [seed, setSeed] = useState("");
  const [genMsg, setGenMsg] = useState("");
  const [genError, setGenError] = useState(false);
  const [genBusy, setGenBusy] = useState(false);

  // Vista 3D
  const [view3D, setView3D] = useState(false);
  const [yaw, setYaw] = useState(35);
  const [pitch, setPitch] = useState(25);
  const [zoom3D, setZoom3D] = useState(1);

  // Círculos
  const radii = [0.5, 0.7, 1.0, 2.0] as const;
  const [ringsRed, setRingsRed] = useState<Record<number, boolean>>({ 0.5: true, 0.7: true, 1: false, 2: false });
  const [ringsBlue, setRingsBlue] = useState<Record<number, boolean>>({ 0.5: true, 0.7: true, 1: false, 2: false });

  // Límites y escala
  const width = 700, height = 520, pad = 50;
  const bounds = useMemo(() => {
    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);
    return { minX: Math.min(0, ...xs), minY: Math.min(0, ...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }, [vertices]);
  const scale = useMemo(() => {
    const wUnits = (bounds.maxX - bounds.minX) || 1;
    const hUnits = (bounds.maxY - bounds.minY) || 1;
    return Math.min((width - 2 * pad) / wUnits, (height - 2 * pad) / hUnits);
  }, [bounds]);
  function toSvg(p: {x:number;y:number}) {
    return { x: pad + (p.x - bounds.minX) * scale, y: height - pad - (p.y - bounds.minY) * scale };
  }

  // Proyección 3D (ortográfica)
  const center = useMemo(() => ({ x: (bounds.minX + bounds.maxX)/2, y: (bounds.minY + bounds.maxY)/2, z: alturaZ/2 }), [bounds, alturaZ]);
  function toIso(p: {x:number;y:number;z?:number}) {
    const X = (p.x - center.x), Y = (p.y - center.y), Z = (p.z || 0) - center.z;
    const ya = yaw * Math.PI/180, pa = pitch * Math.PI/180;
    const cosy = Math.cos(ya), siny = Math.sin(ya); const cosp = Math.cos(pa), sinp = Math.sin(pa);
    const x1 = X * cosy - Y * siny; const y1 = X * siny + Y * cosy; const z1 = Z;
    const x2 = x1; const y2 = y1 * cosp - z1 * sinp; const z2 = y1 * sinp + z1 * cosp;
    const sx = x2 * scale * zoom3D; const sy = y2 * scale * zoom3D;
    const cx = pad + (center.x - bounds.minX) * scale; const cy = height - pad - (center.y - bounds.minY) * scale;
    return { x: cx + sx, y: cy - sy, z: z2 };
  }
  function proj(p:{x:number;y:number;z?:number}){ return view3D ? toIso(p) : toSvg(p); }

  // Reglas
  const MARGIN = 0.5, MIN_RED_RED = 0.7, MIN_RED_BLUE = 1.0, MIN_BLUE_BLUE = 0.7;

  // Precálculos (candidatos)
  const xyCells = useMemo(() => {
    const xs:number[] = []; for (let x = Math.ceil((Math.min(bounds.minX, 0) + MARGIN) * 10) / 10; x <= (Math.max(bounds.maxX, 0) - MARGIN) + EPS; x += STEP) xs.push(roundToTenth(x));
    const ys:number[] = []; for (let y = Math.ceil((Math.min(bounds.minY, 0) + MARGIN) * 10) / 10; y <= (Math.max(bounds.maxY, 0) - MARGIN) + EPS; y += STEP) ys.push(roundToTenth(y));
    const out: Array<{x:number;y:number}> = [];
    for (const x of xs) for (const y of ys) {
      const base = { x, y };
      if (!pointInPolygon(base, vertices)) continue;
      if (minDistToEdges2D(base, vertices) < MARGIN - EPS) continue;
      out.push({x,y});
    }
    return out;
  }, [vertices, bounds]);

  const zLevels = useMemo(() => {
    const zs:number[] = [];
    for (let z = Math.ceil(MARGIN * 10) / 10; z <= alturaZ - MARGIN + EPS; z += STEP) zs.push(roundToTenth(z));
    return zs;
  }, [alturaZ]);

  const candidates = useMemo(() => {
    if (xyCells.length === 0 || zLevels.length === 0) return [] as Array<{x:number;y:number;z:number}>;
    const out: Array<{x:number;y:number;z:number}> = [];
    for (const {x,y} of xyCells) for (const z of zLevels) {
      const p = {x,y,z};
      if (dist3D(p, F1) < MIN_RED_BLUE || dist3D(p, F2) < MIN_RED_BLUE) continue;
      if (p.x === F1.x || p.x === F2.x || p.y === F1.y || p.y === F2.y || p.z === F1.z || p.z === F2.z) continue; // unicidad vs rojos
      out.push(p);
    }
    return out;
  }, [xyCells, zLevels, F1, F2]);

  // ======= Validación de violaciones =======
  const [viol, setViol] = useState<{F1:any;F2:any;blue:Array<{x:boolean;y:boolean;z:boolean;msg:string[]}>}>({F1:{x:false,y:false,z:false,msg:[]},F2:{x:false,y:false,z:false,msg:[]},blue:[]});
  useEffect(()=>{
    const f1 = {...F1}, f2 = {...F2};
    const v = { F1:{x:false,y:false,z:false,msg:[] as string[]}, F2:{x:false,y:false,z:false,msg:[] as string[]}, blue: blue.map(()=>({x:false,y:false,z:false,msg:[] as string[]})) };

    function markDupAxis(axis: 'x'|'y'|'z'){
      const map = new Map<string, Array<{name:'F1'|'F2'|'B'; idx:number}>>();
      const str = (n:number)=> n.toFixed(1);
      function add(name: 'F1'|'F2'|'B', idx: number, val: number){ const k=str(val); if(!map.has(k)) map.set(k, []); map.get(k)!.push({name, idx}); }
      add('F1',-1,(f1 as any)[axis]); add('F2',-1,(f2 as any)[axis]); blue.forEach((b,i)=>add('B',i,(b as any)[axis]));
      for(const [,list] of map){ if(list.length>1){
        list.forEach(e=>{
          if(e.name==='F1'){ (v.F1 as any)[axis]=true; v.F1.msg.push(`${axis.toUpperCase()} repetida`); }
          else if(e.name==='F2'){ (v.F2 as any)[axis]=true; v.F2.msg.push(`${axis.toUpperCase()} repetida`); }
          else { (v.blue[e.idx] as any)[axis]=true; v.blue[e.idx].msg.push(`${axis.toUpperCase()} repetida`); }
        });
      }}
    }
    (['x','y','z'] as const).forEach(markDupAxis);

    function checkPoint(p: {x:number;y:number;z:number}, target: {x:boolean;y:boolean;z:boolean;msg:string[]}){
      if(!pointInPolygon(p, vertices)) { target.x=true; target.y=true; target.msg.push('Fuera del polígono (XY)'); }
      if(minDistToEdges2D(p, vertices) < MARGIN - EPS) { target.x=true; target.y=true; target.msg.push('A <0,5 del borde (XY)'); }
      if(p.z < MARGIN || p.z > alturaZ - MARGIN) { target.z=true; target.msg.push('Z fuera de márgenes'); }
    }
    checkPoint(f1, v.F1); checkPoint(f2, v.F2);
    blue.forEach((b,i)=>checkPoint(b, v.blue[i]));

    if(dist3D(f1,f2) < MIN_RED_RED){ v.F1.x=v.F1.y=v.F1.z=true; v.F2.x=v.F2.y=v.F2.z=true; v.F1.msg.push('F1–F2 < 0,7'); v.F2.msg.push('F1–F2 < 0,7'); }

    const hasher = makeHasher(MIN_BLUE_BLUE);
    const grid = new Map<string, number[]>();
    blue.forEach((b,i)=>{ const k = hasher.key(b.x,b.y,b.z); if(!grid.has(k)) grid.set(k, []); grid.get(k)!.push(i); });

    blue.forEach((b,i)=>{
      if(dist3D(b,f1) < MIN_RED_BLUE){ v.blue[i].x=v.blue[i].y=v.blue[i].z=true; v.blue[i].msg.push('Distancia a F1 < 1,0'); }
      if(dist3D(b,f2) < MIN_RED_BLUE){ v.blue[i].x=v.blue[i].y=v.blue[i].z=true; v.blue[i].msg.push('Distancia a F2 < 1,0'); }
      for(const nk of hasher.neighKeys(b.x,b.y,b.z)){
        const list = grid.get(nk); if(!list) continue;
        for(const j of list){ if(j<=i) continue; if(dist3D(b, blue[j]) < MIN_BLUE_BLUE){
          v.blue[i].x=v.blue[i].y=v.blue[i].z=true; v.blue[j].x=v.blue[j].y=v.blue[j].z=true;
          v.blue[i].msg.push(`P${i+1}–P${j+1} < 0,7`); v.blue[j].msg.push(`P${i+1}–P${j+1} < 0,7`);
        }}
      }
    });

    setViol(v);
  }, [F1,F2,blue,vertices,alturaZ]);

  // ======= Generación robusta =======
  function generateBlue() {
    if (genBusy) return; setGenBusy(true); setGenMsg(""); setGenError(false);
    try {
      const rng = seed ? mulberry32(Array.from(seed).reduce((a, c) => a + c.charCodeAt(0), 0) || 1) : Math.random;
      if (candidates.length === 0) { setGenError(true); setGenMsg("No hay candidatos (comprueba márgenes, F1/F2 y altura Z)."); return; }

      const hasher = makeHasher(MIN_BLUE_BLUE);
      const grid = new Map<string, {x:number;y:number;z:number}[]>();
      const usedX = new Set<number>([F1.x, F2.x]);
      const usedY = new Set<number>([F1.y, F2.y]);
      const usedZ = new Set<number>([F1.z, F2.z]);
      const chosen: Array<{x:number;y:number;z:number}> = [];

      const noise = () => (rng===Math.random ? Math.random() : rng());
      const scored = shuffle(candidates, rng)
        .map(p => ({ p, s: Math.min(dist3D(p,F1), dist3D(p,F2)) + noise()*0.01 }))
        .sort((a,b)=> b.s - a.s);

      for (let k=0; k<5; k++) {
        const window = Math.min(200, Math.max(30, Math.floor(scored.length * 0.15)));
        let pick: {x:number;y:number;z:number} | null = null; let pickIdx = -1;

        const isValid = (cand:{x:number;y:number;z:number}) => {
          if (usedX.has(cand.x) || usedY.has(cand.y) || usedZ.has(cand.z)) return false;
          for (const key of hasher.neighKeys(cand.x, cand.y, cand.z)) {
            const bucket = grid.get(key); if (!bucket) continue;
            for (const q of bucket) if (dist3D(cand, q) < MIN_BLUE_BLUE) return false;
          }
          return true;
        };

        for (let t=0; t<window; t++) { const cand = scored[t].p; if (isValid(cand)) { pick = cand; pickIdx = t; break; } }
        if (!pick) { for (let t=window; t<scored.length; t++) { const cand = scored[t].p; if (isValid(cand)) { pick = cand; pickIdx = t; break; } } }

        if (!pick) { setGenError(true); setGenMsg("No se pudieron distribuir 5 puntos azules (hay candidatos, pero ninguno cumple distancias/unicidad)."); return; }

        chosen.push(pick);
        usedX.add(pick.x); usedY.add(pick.y); usedZ.add(pick.z);
        const kkey = hasher.key(pick.x, pick.y, pick.z); if (!grid.has(kkey)) grid.set(kkey, []); grid.get(kkey)!.push(pick);
        scored.splice(pickIdx,1);
      }

      setBlue(chosen); setGenError(false); setGenMsg("Generados 5 puntos azules."); setShowBlue(true);
    } finally { setGenBusy(false); }
  }

  // ======= Editores =======
  function setBlueField(i: number, key: 'x'|'y'|'z', val: string){ const num = parseFloat(val); const v = Number.isFinite(num) ? roundToTenth(num) : (num as any); setBlue(prev=> updateArrayItem(prev, i, (p)=> ({...p, [key]: v} as any))); }
  function setRedField(name: 'F1'|'F2', key: 'x'|'y'|'z', val: string){ const num = parseFloat(val); const v = Number.isFinite(num) ? roundToTenth(num) : (num as any); (name==='F1'? setF1 : setF2)(prev=> ({...prev, [key]: v} as any)); }

  // ======= Interacción 3D (definidos para evitar ReferenceError) =======
  const dragRef = useRef({dragging:false,x:0,y:0,yaw:0,pitch:0});
  function onPointerDown(e: React.PointerEvent){ if(!view3D) return; dragRef.current={dragging:true,x:e.clientX,y:e.clientY,yaw, pitch}; }
  function onPointerMove(e: React.PointerEvent){ if(!view3D) return; const d = dragRef.current; if(!d.dragging) return; const dx = e.clientX - d.x; const dy = e.clientY - d.y; setYaw((d.yaw + dx*0.4)%360); setPitch(Math.max(-85, Math.min(85, d.pitch + dy*0.3))); }
  function onPointerUp(){ if(!view3D) return; dragRef.current.dragging=false; }
  function onWheel(e: React.WheelEvent){ if(!view3D) return; e.preventDefault(); setZoom3D(z=> Math.max(0.4, Math.min(3, z * (e.deltaY<0? 1.1 : 0.9)))); }

  // ======= Autotests simples =======
  useEffect(() => {
    try {
      const A = polygonArea([{x:0,y:0},{x:3,y:0},{x:3,y:2},{x:0,y:2}]);
      console.assert(Math.abs(A-6)<1e-9, 'Test área rectángulo 3x2 debe ser 6');
      console.assert(pointInPolygon({x:1,y:1}, [{x:0,y:0},{x:3,y:0},{x:3,y:2},{x:0,y:2}]) === true, 'Test punto dentro');
      console.assert(pointInPolygon({x:4,y:1}, [{x:0,y:0},{x:3,y:0},{x:3,y:2},{x:0,y:2}]) === false, 'Test punto fuera');
      console.assert(Math.abs(dist3D({x:0,y:0,z:0},{x:1,y:2,z:2}) - Math.sqrt(9)) < 1e-9, 'Test dist3D');
      console.assert(roundToTenth(1.24) === 1.2 && roundToTenth(1.25) === 1.3, 'Test roundToTenth');
    } catch(e) { console.warn('Autotests fallaron:', e); }
  }, []);

  // Área/volumen
  const area = useMemo(()=> polygonArea(vertices), [vertices]);
  const volumen = useMemo(()=> area * alturaZ, [area, alturaZ]);

  // ======= Rejilla + ejes memoizados (sin artefactos) =======
  const gridAndAxes = useMemo(()=>{
    const origin = toSvg({x:0,y:0}); const axisColor = "#bfbfbf"; const tickLen = 6; const axes: JSX.Element[] = [];
    axes.push(<line key="ax" x1={pad} y1={origin.y} x2={width-pad} y2={origin.y} stroke={axisColor} strokeWidth={1} />);
    axes.push(<line key="ay" x1={origin.x} y1={height-pad} x2={origin.x} y2={pad} stroke={axisColor} strokeWidth={1} />);
    for (let x = Math.ceil(bounds.minX*2)/2; x <= bounds.maxX + EPS; x += 0.5) { const sx = pad + (x - bounds.minX) * scale; axes.push(<line key={"tx"+x} x1={sx} y1={origin.y - tickLen/2} x2={sx} y2={origin.y + tickLen/2} stroke={axisColor} />); axes.push(<text key={"tlx"+x} x={sx} y={height - pad + 14} fontSize={10} textAnchor="middle" fill="#666">{x.toFixed(1)}</text>); }
    for (let y = Math.ceil(bounds.minY*2)/2; y <= bounds.maxY + EPS; y += 0.5) { const sy = height - pad - (y - bounds.minY) * scale; axes.push(<line key={"ty"+y} x1={origin.x - tickLen/2} y1={sy} x2={origin.x + tickLen/2} y2={sy} stroke={axisColor} />); axes.push(<text key={"tly"+y} x={pad - 10} y={sy + 3} fontSize={10} textAnchor="end" fill="#666">{y.toFixed(1)}</text>); }

    const minorSize = STEP*scale; const majorSize = 0.5*scale;
    const offsetX = pad - ((0 - bounds.minX) % STEP) * scale; const offsetY = pad - ((0 - bounds.minY) % STEP) * scale;

    return (
      <>
        <defs>
          <pattern id="gridMinor" patternUnits="userSpaceOnUse" width={minorSize} height={minorSize} patternTransform={`translate(${offsetX},${offsetY})`}>
            <rect x={0} y={0} width={minorSize} height={minorSize} fill="none" />
            <path d={`M ${minorSize} 0 L 0 0 0 ${minorSize}`} fill="none" stroke="#eeeeee" strokeWidth={1} shapeRendering="crispEdges" vectorEffect="non-scaling-stroke" />
          </pattern>
          <pattern id="gridMajor" patternUnits="userSpaceOnUse" width={majorSize} height={majorSize} patternTransform={`translate(${offsetX},${offsetY})`}>
            <rect x={0} y={0} width={majorSize} height={majorSize} fill="none" />
            <path d={`M ${majorSize} 0 L 0 0 0 ${majorSize}`} fill="none" stroke="#e3e3e3" strokeWidth={1.5} shapeRendering="crispEdges" vectorEffect="non-scaling-stroke" />
          </pattern>
        </defs>
        <rect x={pad} y={pad} width={width-2*pad} height={height-2*pad} fill="url(#gridMinor)" />
        <rect x={pad} y={pad} width={width-2*pad} height={height-2*pad} fill="url(#gridMajor)" />
        <g>{axes}</g>
      </>
    );
  }, [bounds, scale]);

  // ============= Render =============
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold mb-4">App Web: Puntos en Paralelepípedo</h1>

      {/* Paneles superiores: Recinto y Círculos */}
      <div className="grid md:grid-cols-2 gap-4 items-stretch">
        {/* Recinto */}
        <section className="p-3 rounded-2xl shadow bg-white border flex flex-col h-full">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-medium">Recinto</h2>
            <div className="text-xs text-gray-500">Área: {area.toFixed(2)} · Volumen: {volumen.toFixed(2)}</div>
          </div>
          <div className="flex-1">
            {vertices.map((v, idx) => (
              <div key={idx} className="flex gap-2 items-center mb-1">
                <input type="number" step={0.1} value={v.x} onChange={e=>setVertices(prev=>updateArrayItem(prev, idx, it=>({...it, x: parseFloat(e.target.value)})))} className="w-20 border rounded px-1" />
                <input type="number" step={0.1} value={v.y} onChange={e=>setVertices(prev=>updateArrayItem(prev, idx, it=>({...it, y: parseFloat(e.target.value)})))} className="w-20 border rounded px-1" />
                <button onClick={()=>setVertices(prev=> prev.length>4? removeArrayItem(prev, idx) : prev)} className="text-red-500">✕</button>
              </div>
            ))}
            <button onClick={()=>setVertices(v=>[...v,{x:0,y:0}])} className="text-sm mt-1 px-2 py-0.5 border rounded">+ vértice</button>
            <div className="mt-3 text-sm flex items-center gap-2">
              <label>Altura Z:</label>
              <input type="number" step={0.1} value={alturaZ} onChange={e=>setAlturaZ(parseFloat(e.target.value))} className="w-24 border rounded px-1"/>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-500">Las X, Y y Z no pueden repetirse entre ningún punto.</div>
        </section>

        {/* Círculos */}
        <section className="p-3 rounded-2xl shadow bg-white border flex flex-col h-full">
          <h2 className="text-base font-medium mb-2">Círculos (r)</h2>
          <div className="flex-1">
            <table className="text-xs border w-full">
              <thead>
                <tr><th className="px-2">r</th><th className="px-2">Rojos</th><th className="px-2">Azules</th></tr>
              </thead>
              <tbody>
                {radii.map(r=> (
                  <tr key={r}>
                    <td className="px-2 py-1">{r}</td>
                    <td className="text-center"><input type="checkbox" checked={!!ringsRed[r]} onChange={()=>setRingsRed(s=>({...s,[r]:!s[r]}))}/></td>
                    <td className="text-center"><input type="checkbox" checked={!!ringsBlue[r]} onChange={()=>setRingsBlue(s=>({...s,[r]:!s[r]}))}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 text-sm flex items-center gap-2">
              <label>Semilla:</label>
              <input className="border rounded px-2 py-1 w-48" placeholder="(opcional)" value={seed} onChange={e=>setSeed(e.target.value)} />
            </div>
            <p className="text-xs text-gray-500 mt-1">Usa una semilla para repetir siempre la misma distribución. Si la dejas vacía, cada vez variará.</p>
            <div className="mt-3 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={view3D} onChange={()=>setView3D(v=>!v)} /> Vista 3D interactiva</label>
              {view3D && (<><button className="text-xs px-2 py-1 border rounded" onClick={()=>{setYaw(35);setPitch(25);setZoom3D(1);}}>Reset vista</button><span className="text-xs text-gray-500">Arrastra para rotar · Rueda para zoom</span></>)}
            </div>
          </div>
        </section>
      </div>

      {/* Dibujo + tabla */}
      <div className="flex gap-6 items-start">
        <div className="p-4 rounded-2xl shadow bg-white border relative select-none"
             onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onWheel={onWheel}>
          {/* Etiquetas ejes fuera */}
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-7 text-sm text-gray-700">Eje X</div>
          <div className="absolute -left-7 top-1/2 -translate-y-1/2 text-sm text-gray-700 rotate-[-90deg] origin-center">Eje Y</div>
          <svg width={width} height={height} className="border rounded bg-white">
            <rect x={0} y={0} width={width} height={height} fill="#fafafa" />
            {gridAndAxes}
            {/* Polígono / volumen en 3D */}
            {view3D ? (
              // Renderizar un paralelepípedo con caras y aristas cuando está activada la vista 3D. Para dar sensación de volumen
              (() => {
                // Proyectamos todos los vértices en z=0 y z=alturaZ
                const bottom = vertices.map(v => toIso({ x: v.x, y: v.y, z: 0 }));
                const top = vertices.map(v => toIso({ x: v.x, y: v.y, z: alturaZ }));
                // Construimos cadenas de puntos
                const bottomPts = bottom.map(p => `${p.x},${p.y}`).join(' ');
                const topPts    = top.map(p => `${p.x},${p.y}`).join(' ');
                // Seleccionamos un color base y transparencias sutiles para caras
                const faceFill = '#f3f4f6'; // gris muy claro para caras horizontales
                const edgeColor = '#6b7280'; // gris medio para aristas
                return (
                  <g>
                    {/* Cara inferior */}
                    <polygon points={bottomPts} fill={faceFill} stroke={edgeColor} strokeWidth={1} opacity={0.8} />
                    {/* Aristas verticales */}
                    {bottom.map((p, idx) => {
                      const q = top[idx];
                      return (
                        <line key={`vert-${idx}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={edgeColor} strokeWidth={1} />
                      );
                    })}
                    {/* Cara superior */}
                    <polygon points={topPts} fill={faceFill} stroke={edgeColor} strokeWidth={1} opacity={0.8} />
                  </g>
                );
              })()
            ) : (
              // En modo 2D clásico dibujamos sólo el contorno del polígono
              <polyline points={vertices.concat([vertices[0]]).map(p=>{const s=toSvg(p);return `${s.x},${s.y}`;}).join(" ")} fill="none" stroke="#111" strokeWidth={2}/>
            )}
            {/* Puntos */}
            {(() => {
              const red=[
                {p:{...F1},label:`F1 (${F1.x.toFixed(1)}, ${F1.y.toFixed(1)}, z=${F1.z.toFixed(1)})`,color:"#e11d48",rings:ringsRed, v:viol.F1},
                {p:{...F2},label:`F2 (${F2.x.toFixed(1)}, ${F2.y.toFixed(1)}, z=${F2.z.toFixed(1)})`,color:"#e11d48",rings:ringsRed, v:viol.F2}
              ];
              const blues = showBlue ? blue.map((b,i)=>({p:b,label:`P${i+1} (z=${b.z?.toFixed(1)})`,color:"#2563eb",rings:ringsBlue, v:viol.blue[i]||{x:false,y:false,z:false,msg:[]} })) : [];
              const all=[...red,...blues];
              const ordered = view3D ? all.map(item=>({item, s: proj(item.p)})).sort((a,b)=> (a.s.z as number) - (b.s.z as number)).map(o=>({...o.item, s:o.s})) : all.map(item=>({item, s: proj(item.p)})).map(o=>({...o.item, s:o.s}));
              return ordered.map((item,idx)=>{const s=item.s as any;return(
                <g key={idx}>
                  {Object.entries(item.rings).filter(([,on])=>on).map(([rr])=>{ const r = parseFloat(rr) * scale * (view3D ? 0.9*zoom3D : 1); return <circle key={rr} cx={s.x} cy={s.y} r={r} fill="none" stroke={item.color} opacity={0.35}/>; })}
                  <circle cx={s.x} cy={s.y} r={5} fill={item.color}/>
                  <text x={s.x+6} y={s.y-6} fontSize={11} fill={item.color}>{item.label}</text>
                </g>)
              });
            })()}
          </svg>
        </div>

        <section className="p-3 rounded-2xl shadow bg-white border min-w-[360px]">
          <h2 className="text-base font-medium mb-2">Tabla de puntos (editable)</h2>
          <table className="text-xs">
            <thead><tr><th className="px-2">Nombre</th><th className="px-2">X</th><th className="px-2">Y</th><th className="px-2">Z</th></tr></thead>
            <tbody>
              {[
                {name:'F1', val:F1, set:setF1, v:viol.F1},
                {name:'F2', val:F2, set:setF2, v:viol.F2},
              ].map(row => (
                <tr key={row.name}>
                  <td className="px-2">{row.name}</td>
                  <td className="px-2"><input type="number" step={0.1} value={row.val.x} onChange={e=>setRedField(row.name as any,'x',e.target.value)} className={`w-16 border rounded px-1 ${row.v.x? 'border-red-500 bg-red-50':''}`} title={row.v.msg.join('\\n')}/></td>
                  <td className="px-2"><input type="number" step={0.1} value={row.val.y} onChange={e=>setRedField(row.name as any,'y',e.target.value)} className={`w-16 border rounded px-1 ${row.v.y? 'border-red-500 bg-red-50':''}`} title={row.v.msg.join('\\n')}/></td>
                  <td className="px-2"><input type="number" step={0.1} value={row.val.z} onChange={e=>setRedField(row.name as any,'z',e.target.value)} className={`w-16 border rounded px-1 ${row.v.z? 'border-red-500 bg-red-50':''}`} title={row.v.msg.join('\\n')}/></td>
                </tr>
              ))}
              {blue.map((b,i)=> (
                <tr key={i}>
                  <td className="px-2">{`P${i+1}`}</td>
                  <td className="px-2"><input type="number" step={0.1} value={b.x} onChange={e=>setBlueField(i,'x',e.target.value)} className={`w-16 border rounded px-1 ${(viol.blue[i]?.x)? 'border-red-500 bg-red-50':''}`} title={(viol.blue[i]?.msg||[]).join('\\n')}/></td>
                  <td className="px-2"><input type="number" step={0.1} value={b.y} onChange={e=>setBlueField(i,'y',e.target.value)} className={`w-16 border rounded px-1 ${(viol.blue[i]?.y)? 'border-red-500 bg-red-50':''}`} title={(viol.blue[i]?.msg||[]).join('\\n')}/></td>
                  <td className="px-2"><input type="number" step={0.1} value={b.z ?? ''} onChange={e=>setBlueField(i,'z',e.target.value)} className={`w-16 border rounded px-1 ${(viol.blue[i]?.z)? 'border-red-500 bg-red-50':''}`} title={(viol.blue[i]?.msg||[]).join('\\n')}/></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex gap-2 items-center">
            <button className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-400 ${genBusy ? 'opacity-70 pointer-events-none' : ''} bg-blue-600 shadow-[0_4px_0_0_#1e40af] active:translate-y-[2px] active:shadow-[0_2px_0_0_#1e40af]`} onClick={generateBlue} disabled={genBusy} title="Generar nueva distribución">
              Generar puntos azules
            </button>
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-gray-200 hover:bg-gray-300 active:translate-y-[1px]" onClick={()=>setShowBlue(s=>!s)}>
              {showBlue ? 'Limpiar' : 'Mostrar azules'}
            </button>
            {genMsg && (<div className={`text-xs ${genError? 'text-red-600' : 'text-green-600'}`}>{genMsg}</div>)}
          </div>
          {(() => { const msgs = [ ...viol.F1.msg.map((m:string)=>`F1: ${m}`), ...viol.F2.msg.map((m:string)=>`F2: ${m}`), ...blue.flatMap((_,i)=> (viol.blue[i]?.msg||[]).map((m:string)=>`P${i+1}: ${m}`)) ]; return msgs.length ? (<div className="mt-2 text-xs text-red-600 whitespace-pre-line">{msgs.join('\\n')}</div>) : null; })()}
        </section>
      </div>

      <div className="text-xs text-gray-600 mt-4">Reglas (3D): margen ≥ 0,5 a caras (incluye Z); F1–F2 ≥ 0,7; azul–azul ≥ 0,7; rojo–azul ≥ 1,0; X, Y y Z únicas entre todos. Coordenadas a pasos de 0,1.</div>
    </div>
  );
}
