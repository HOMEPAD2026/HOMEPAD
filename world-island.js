// world-island.js — My Island: a floating island off the main world that you build brick by brick.
//
//   bricks       41 kinds, generated here (no model files): bricks, walls, windows, doors, roofs, trees, lamps and
//                a few special ones you unlock by playing. One InstancedMesh per kind, so thousands stay cheap.
//   build mode   place / remove / paint / pick, rotate, undo / redo, mirror, a layer lock; a ghost shows where the
//                next brick goes. Third person: you walk and jump on what you build.
//   blueprints   ready-made builds and shareable codes (ARCBP1.…); a build rises layer by layer.
//   residents    every door brings one in; they walk the island and talk about the real market.
//   visits       other wallets' islands, likes and stamps (api/_world.mjs); coin creators can build their coin's lot.
//
// Saved as bytes: [version, N] then 5 bytes a brick (x, y, z, kind, rot | colour << 2), in the order they were placed
// (that order is the time-lapse). TYPES is append-only: a brick's kind is its index.
import { mergeGeometries } from "./vendor/three/addons/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "./vendor/three/addons/RoundedBoxGeometry.js";

export const ISLAND_N = 36, LOT_N = 9, HMAX = 24, MAX_BRICKS = 6000;
export const COLORS = [
  0xf4f1ea, 0xc9ced6, 0x7d8794, 0x2e3440, 0x161a20, 0xe5484d, 0xf2803a, 0xffc861, 0xb6e05a, 0x4caf6a,
  0x2a7a52, 0x35d8d0, 0x4fa8ff, 0x2f86ff, 0x23408e, 0x9b6cff, 0xff7ad9, 0x8a5a36, 0xc89a6a, 0xe9d3a8,
  0x2ee07a, 0x6fd1ff, 0xff4d6d, 0x5b3a8a,
];
const CAT = ["Bricks", "Walls and roofs", "Windows and doors", "Nature", "Lights and decor", "Special"];

export function createIsland(ctx) {
  const { THREE, K, st, planet, esc, toast, post, sess, Snd, P, VER } = ctx;
  // single words stay out of the site-wide dictionary (they'd change other pages): a small map just for the island
  const LW = {
    ko: { Arch: "아치", Bench: "벤치", Blueprints: "설계도", Brick: "브릭", Bricks: "브릭", Bush: "덤불", Chimney: "굴뚝", Colour: "색상", Cottage: "오두막", Crystal: "크리스탈", Dome: "돔", Door: "문", Fence: "울타리", Flag: "깃발", Flowers: "꽃", Fountain: "분수", Garden: "정원", Islands: "섬 둘러보기", Mirror: "대칭", Nature: "자연", Paint: "칠하기", Pick: "스포이드", Pillar: "기둥", Pine: "소나무", Planter: "화분", Plate: "플레이트", Popular: "인기", Redo: "다시", Rock: "바위", Rocket: "로켓", Roof: "지붕", Rotate: "회전", Slope: "경사", Special: "특별", Table: "테이블", "Time-lapse": "타임랩스", Tree: "나무", Visit: "방문", Wall: "벽", Water: "물", Window: "창문", Wow: "와우", Build: "건설", Place: "놓기", Remove: "지우기", Undo: "되돌리기", Layer: "층", Tools: "도구", Close: "닫기", Done: "완료" },
    zh: { Arch: "拱门", Bench: "长椅", Blueprints: "蓝图", Brick: "积木", Bricks: "积木", Bush: "灌木", Chimney: "烟囱", Colour: "颜色", Cottage: "小屋", Crystal: "水晶", Dome: "穹顶", Door: "门", Fence: "栅栏", Flag: "旗帜", Flowers: "花", Fountain: "喷泉", Garden: "花园", Islands: "岛屿", Mirror: "镜像", Nature: "自然", Paint: "上色", Pick: "取样", Pillar: "柱子", Pine: "松树", Planter: "花盆", Plate: "薄板", Popular: "热门", Redo: "重做", Rock: "岩石", Rocket: "火箭", Roof: "屋顶", Rotate: "旋转", Slope: "斜坡", Special: "特殊", Table: "桌子", "Time-lapse": "延时回放", Tree: "树", Visit: "拜访", Wall: "墙", Water: "水", Window: "窗户", Wow: "哇", Build: "建造", Place: "放置", Remove: "移除", Undo: "撤销", Layer: "楼层", Tools: "工具", Close: "关闭", Done: "完成" },
  }[ctx.lang] || {};
  const T = (s, v) => (LW[s] != null ? LW[s] : ctx.T(s, v));
  const $ = (id) => document.getElementById(id);
  const V3 = THREE.Vector3;

  // ---------------- materials: painted parts take the brick's colour, fixed parts keep their own ----------------
  const fixedPatch = (m) => { m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace("#include <color_vertex>", "#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n vColor = vec3( 1.0 );\n#endif"); }; m.customProgramCacheKey = () => "fixed"; return m; };
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05, ...o });
  const M = {
    paint: std({ color: 0xffffff, roughness: 0.42 }),
    neon: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2) }),
    glass: fixedPatch(new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false })),
    wood: fixedPatch(std({ color: 0x8a5a36, roughness: 0.8 })),
    dark: fixedPatch(std({ color: 0x2a3442, metalness: 0.5 })),
    gold: fixedPatch(std({ color: 0xffc861, metalness: 0.9, roughness: 0.25 })),
    warm: fixedPatch(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.2) })),
    water: fixedPatch(std({ color: 0x3fa9e0, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.78 })),
    leaf: fixedPatch(std({ color: 0x3f9a5a, roughness: 0.8, flatShading: true })),
    white: fixedPatch(std({ color: 0xf2f4f6, metalness: 0.3, roughness: 0.3 })),
    pink: fixedPatch(std({ color: 0xff7ad9 })), yellow: fixedPatch(std({ color: 0xffd34d })),
    arcB: fixedPatch(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.4, 3.2) })), arcG: fixedPatch(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3.0, 1.4) })),
  };

  // ---------------- brick geometry (a cell is 1×1×1; the origin is the bottom centre; +Z is the front) ----------------
  const RB = (w, h, d, r = 0.05, y = h / 2, z = 0, x = 0) => { const g = new RoundedBoxGeometry(w, h, d, 1, r); g.translate(x, y, z); return g; };
  const box = (w, h, d, x = 0, y = h / 2, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  const cyl = (r1, r2, h, seg = 12, x = 0, y = h / 2, z = 0) => { const g = new THREE.CylinderGeometry(r1, r2, h, seg); g.translate(x, y, z); return g; };
  const studs = (h) => [-0.25, 0.25].flatMap((sx) => [-0.25, 0.25].map((sz) => cyl(0.14, 0.14, 0.09, 8, sx, h + 0.045, sz)));
  const prism = (pts, depth = 0.98) => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); g.rotateY(Math.PI / 2); return g; };
  // a wall panel at the back of the cell with a hole (windows, arches)
  const frame = (hole, depth = 0.22) => {
    const sh = new THREE.Shape(); sh.moveTo(-0.49, 0); sh.lineTo(0.49, 0); sh.lineTo(0.49, 0.98); sh.lineTo(-0.49, 0.98); sh.lineTo(-0.49, 0);
    sh.holes.push(hole); const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 10 }); g.translate(0, 0, -0.49); return g;
  };
  const rectHole = (w, h, y) => { const p = new THREE.Path(); p.moveTo(-w / 2, y); p.lineTo(w / 2, y); p.lineTo(w / 2, y + h); p.lineTo(-w / 2, y + h); p.lineTo(-w / 2, y); return p; };
  const circHole = (r, y) => { const p = new THREE.Path(); p.absarc(0, y, r, 0, Math.PI * 2, false); return p; };
  const archHole = () => { const p = new THREE.Path(); p.moveTo(-0.3, 0); p.lineTo(0.3, 0); p.lineTo(0.3, 0.5); p.absarc(0, 0.5, 0.3, 0, Math.PI, false); p.lineTo(-0.3, 0); return p; };
  const plane = (w, h, x, y, z) => { const g = new THREE.PlaneGeometry(w, h); g.translate(x, y, z); return g; };
  const ico = (r, x, y, z, d = 1) => { const g = new THREE.IcosahedronGeometry(r, d); g.translate(x, y, z); return g; };
  const torus = (r, t, x, y, z, rx = 0) => { const g = new THREE.TorusGeometry(r, t, 8, 28); g.rotateX(rx); g.translate(x, y, z); return g; };

  // kind: { id, name, cat, top (how high you stand on it), solid, tall (cells), lv | req, color (default), parts }
  // parts(): [[materialKey, [geometries]], …] — "paint" parts take the brick colour
  const TYPES = [
    { id: "brick", name: "Brick", cat: 0, top: 1, color: 5, parts: () => [["paint", [RB(0.98, 0.98, 0.98), ...studs(0.98)]]] },
    { id: "plate", name: "Plate", cat: 0, top: 0.33, color: 12, parts: () => [["paint", [RB(0.98, 0.32, 0.98, 0.04), ...studs(0.32)]]] },
    { id: "tile", name: "Floor tile", cat: 0, top: 0.12, color: 1, parts: () => [["paint", [RB(0.98, 0.12, 0.98, 0.03)]]] },
    { id: "slope", name: "Slope", cat: 0, top: 0.55, color: 13, parts: () => [["paint", [prism([[-0.49, 0], [0.49, 0], [0.49, 0.98], [-0.49, 0.14]])]]] },
    { id: "stairs", name: "Steps", cat: 0, top: 0.5, color: 1, parts: () => [["paint", [RB(0.98, 0.25, 0.49, 0.03, 0.125, 0.245), RB(0.98, 0.5, 0.49, 0.03, 0.25, -0.245)]]] },
    { id: "pillar", name: "Pillar", cat: 0, top: 1, color: 0, parts: () => [["paint", [cyl(0.4, 0.4, 0.98, 16), cyl(0.14, 0.14, 0.09, 8, 0, 1.025)]]] },
    { id: "wall", name: "Wall", cat: 1, top: 1, color: 0, parts: () => [["paint", [RB(0.98, 0.98, 0.22, 0.03, 0.49, -0.38)]]] },
    { id: "roof", name: "Roof", cat: 1, top: 0.55, color: 5, parts: () => [["paint", [prism([[-0.55, 0], [0.49, 0], [0.49, 0.98], [-0.55, 0.06]])]]] },
    { id: "peak", name: "Roof ridge", cat: 1, top: 0.55, color: 5, parts: () => [["paint", [prism([[-0.49, 0], [0.49, 0], [0.49, 0.1], [0, 0.6], [-0.49, 0.1]])]]] },
    { id: "fence", name: "Fence", cat: 1, top: 0.7, color: 17, parts: () => [["paint", [box(0.12, 0.72, 0.12, -0.38), box(0.12, 0.72, 0.12, 0.38), box(0.98, 0.1, 0.06, 0, 0.5, 0), box(0.98, 0.1, 0.06, 0, 0.25, 0)]]] },
    { id: "window", name: "Window", cat: 2, top: 1, color: 0, parts: () => [["paint", [frame(rectHole(0.56, 0.5, 0.26))]], ["glass", [plane(0.58, 0.52, 0, 0.51, -0.38)]]] },
    { id: "door", name: "Door", cat: 2, top: 2, tall: 2, solid: false, color: 0, parts: () => { const panel = box(0.7, 1.78, 0.07, 0.35, 0.89, 0); panel.rotateY(-1.3); panel.translate(-0.36, 0, -0.38); return [["paint", [box(0.14, 1.96, 0.22, -0.42, 0.98, -0.38), box(0.14, 1.96, 0.22, 0.42, 0.98, -0.38), box(0.98, 0.18, 0.22, 0, 1.89, -0.38)]], ["wood", [panel]]]; } },
    { id: "water", name: "Water", cat: 3, top: 0.1, solid: false, color: 12, parts: () => [["water", [box(0.98, 0.1, 0.98)]]] },
    { id: "tree", name: "Tree", cat: 3, top: 2, tall: 2, color: 9, parts: () => [["wood", [cyl(0.12, 0.17, 1.1, 7)]], ["paint", [ico(0.62, 0, 1.45, 0), ico(0.42, 0.25, 1.85, 0.1)]]] },
    { id: "bush", name: "Bush", cat: 3, top: 0.7, color: 9, parts: () => [["paint", [ico(0.45, 0, 0.4, 0), ico(0.3, 0.22, 0.32, 0.18)]]] },
    { id: "flowers", name: "Flowers", cat: 3, top: 0, solid: false, color: 9, parts: () => [["paint", [cyl(0.03, 0.03, 0.3, 4, -0.2, 0.15, 0.1), cyl(0.03, 0.03, 0.36, 4, 0.18, 0.18, -0.12), cyl(0.03, 0.03, 0.26, 4, 0.05, 0.13, 0.26)]], ["pink", [ico(0.1, -0.2, 0.32, 0.1, 0), ico(0.1, 0.05, 0.28, 0.26, 0)]], ["yellow", [ico(0.11, 0.18, 0.38, -0.12, 0)]]] },
    { id: "grass", name: "Tall grass", cat: 3, top: 0, solid: false, color: 8, parts: () => [["paint", [[-0.2, 0.1], [0.1, -0.2], [0.25, 0.2], [-0.05, 0.3]].map(([x, z], i) => { const g = new THREE.ConeGeometry(0.06, 0.4 + i * 0.06, 4); g.translate(x, 0.2 + i * 0.03, z); return g; })]] },
    { id: "rock", name: "Rock", cat: 3, top: 0.7, color: 2, parts: () => { const g = new THREE.DodecahedronGeometry(0.46, 0); g.scale(1, 0.75, 1); g.translate(0, 0.34, 0); return [["paint", [g]]]; } },
    { id: "lamp", name: "Street lamp", cat: 4, top: 2, tall: 2, color: 3, parts: () => [["dark", [cyl(0.05, 0.08, 1.7, 6)]], ["warm", [ico(0.17, 0, 1.78, 0, 1)]], ["paint", [cyl(0.24, 0.1, 0.14, 8, 0, 1.97)]]] },
    { id: "bench", name: "Bench", cat: 4, top: 0, solid: false, color: 17, parts: () => [["paint", [box(0.9, 0.08, 0.36, 0, 0.42, 0.05), box(0.9, 0.3, 0.06, 0, 0.62, -0.15)]], ["dark", [box(0.06, 0.42, 0.3, -0.38, 0.21, 0.05), box(0.06, 0.42, 0.3, 0.38, 0.21, 0.05)]]] },
    { id: "arch", name: "Arch", cat: 1, top: 1, lv: 2, color: 0, parts: () => [["paint", [frame(archHole(), 0.98)]]] },
    { id: "roundwin", name: "Round window", cat: 2, top: 1, lv: 2, color: 0, parts: () => [["paint", [frame(circHole(0.27, 0.5))]], ["glass", [(() => { const g = new THREE.CircleGeometry(0.28, 20); g.translate(0, 0.5, -0.38); return g; })()]]] },
    { id: "glass", name: "Glass block", cat: 2, top: 1, lv: 2, color: 0, parts: () => [["glass", [RB(0.98, 0.98, 0.98, 0.04)]]] },
    { id: "dome", name: "Dome", cat: 1, top: 0.5, lv: 2, color: 11, parts: () => { const g = new THREE.SphereGeometry(0.49, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); return [["paint", [g]]]; } },
    { id: "chimney", name: "Chimney", cat: 1, top: 1, lv: 2, color: 5, parts: () => [["paint", [RB(0.5, 1.15, 0.5, 0.03, 0.575), RB(0.62, 0.12, 0.62, 0.02, 1.2)]]] },
    { id: "pine", name: "Pine", cat: 3, top: 2, tall: 2, lv: 2, color: 10, parts: () => { const c = (r, h, y) => { const g = new THREE.ConeGeometry(r, h, 7); g.translate(0, y, 0); return g; }; return [["wood", [cyl(0.1, 0.14, 0.6, 6)]], ["paint", [c(0.55, 0.9, 0.9), c(0.42, 0.8, 1.35), c(0.28, 0.7, 1.8)]]]; } },
    { id: "lantern", name: "Lantern", cat: 4, top: 0, solid: false, lv: 2, color: 3, parts: () => [["warm", [box(0.2, 0.26, 0.2, 0, 0.17, 0)]], ["paint", [box(0.28, 0.05, 0.28, 0, 0.32, 0), box(0.26, 0.04, 0.26, 0, 0.02, 0)]]] },
    { id: "table", name: "Table", cat: 4, top: 0, solid: false, lv: 2, color: 18, parts: () => [["paint", [RB(0.86, 0.07, 0.86, 0.02, 0.72), cyl(0.06, 0.08, 0.7, 6)]]] },
    { id: "planter", name: "Planter", cat: 4, top: 0.5, lv: 2, color: 17, parts: () => [["paint", [RB(0.9, 0.46, 0.9, 0.04)]], ["leaf", [ico(0.3, -0.15, 0.62, 0), ico(0.26, 0.18, 0.58, 0.1)]]] },
    { id: "neon", name: "Neon strip", cat: 4, top: 0, solid: false, lv: 3, color: 11, parts: () => [["neon", [box(0.98, 0.12, 0.12, 0, 0.5, -0.43)]]] },
    { id: "crystal", name: "Crystal", cat: 4, top: 0, solid: false, lv: 3, color: 11, parts: () => { const g = new THREE.ConeGeometry(0.22, 0.8, 5); g.translate(0, 0.4, 0); const h = new THREE.ConeGeometry(0.14, 0.5, 5); h.rotateZ(0.4); h.translate(0.18, 0.25, 0.05); return [["neon", [g, h]]]; } },
    { id: "sign", name: "Sign", cat: 4, top: 0, solid: false, lv: 3, color: 13, parts: () => [["dark", [box(0.08, 1.0, 0.08, 0, 0.5, 0)]], ["paint", [RB(0.8, 0.42, 0.08, 0.03, 0.95, 0.06)]], ["arcG", [box(0.62, 0.05, 0.02, 0, 0.84, 0.11)]]] },
    { id: "flag", name: "Flag", cat: 4, top: 0, solid: false, tall: 2, lv: 3, color: 13, parts: () => [["dark", [cyl(0.035, 0.035, 1.95, 6)]], ["paint", [box(0.62, 0.38, 0.03, 0.33, 1.68, 0)]], ["arcG", [box(0.62, 0.08, 0.035, 0.33, 1.5, 0)]]] },
    { id: "neoncube", name: "Neon cube", cat: 0, top: 1, lv: 3, color: 11, parts: () => [["neon", [RB(0.9, 0.9, 0.9, 0.06)]]] },
    { id: "goldbrick", name: "Gold brick", cat: 5, top: 1, lv: 4, color: 7, parts: () => [["gold", [RB(0.98, 0.98, 0.98), ...studs(0.98)]]] },
    { id: "rings", name: "ARCIRCLE rings", cat: 5, top: 0.2, tall: 2, req: "slayer", color: 3, parts: () => [["paint", [cyl(0.42, 0.46, 0.2, 16)]], ["arcB", [torus(0.42, 0.06, -0.2, 1.1, 0)]], ["arcG", [torus(0.42, 0.06, 0.2, 1.1, 0, Math.PI / 2)]]] },
    { id: "rocket", name: "Rocket", cat: 5, top: 2, tall: 2, req: "launcher", color: 20, parts: () => { const nose = new THREE.ConeGeometry(0.26, 0.5, 14); nose.translate(0, 1.72, 0); return [["white", [cyl(0.26, 0.3, 1.3, 14, 0, 0.82)]], ["paint", [nose, box(0.06, 0.4, 0.4, 0.3, 0.3, 0), box(0.06, 0.4, 0.4, -0.3, 0.3, 0), box(0.4, 0.4, 0.06, 0, 0.3, 0.3)]]]; } },
    { id: "dish", name: "Scanner dish", cat: 5, top: 0.3, req: "phisher", color: 11, parts: () => { const d = new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, 1.1); d.rotateX(-0.9); d.translate(0, 0.7, 0.05); return [["dark", [cyl(0.32, 0.38, 0.28, 10), cyl(0.06, 0.06, 0.5, 6, 0, 0.5)]], ["paint", [d]]]; } },
    { id: "crown", name: "Holder crown", cat: 5, top: 0.3, req: "holder", color: 7, parts: () => [["paint", [cyl(0.32, 0.36, 0.3, 12)]], ["arcB", [torus(0.2, 0.05, -0.12, 0.62, 0)]], ["arcG", [torus(0.2, 0.05, 0.12, 0.62, 0, Math.PI / 2)]]] },
    { id: "trophy", name: "Streak trophy", cat: 5, top: 0.3, req: "streak7", color: 3, parts: () => { const cup = new THREE.CylinderGeometry(0.26, 0.12, 0.4, 14, 1, true); cup.translate(0, 0.78, 0); return [["paint", [RB(0.5, 0.3, 0.5, 0.03)]], ["gold", [cyl(0.05, 0.05, 0.3, 6, 0, 0.45), cup, torus(0.12, 0.03, 0.3, 0.8, 0)]]]; } },
    { id: "keycard", name: "Card display", cat: 5, top: 0.3, req: "collector", color: 3, parts: () => [["paint", [RB(0.6, 0.3, 0.4, 0.03)]], ["gold", [box(0.42, 0.56, 0.03, 0, 0.62, 0)]]] },
  ];
  const TI = Object.fromEntries(TYPES.map((t, i) => [t.id, i]));
  TYPES.forEach((t) => { t.solid = t.solid !== false; t.tall = t.tall || 1; t.name = T(t.name); });
  const REQ = { slayer: "Beat all six scammers", launcher: "Launch a coin on ArcPad", phisher: "Beat The Phisher", holder: "Hold $ARCIRCLE", streak7: "Keep a 7-day streak", collector: "Collect all 12 key cards" };
  const unlocked = (t) => (t.req ? (t.req === "phisher" ? P.beaten.includes("phisher") : P.badges.includes(t.req)) : ctx.level() >= (t.lv || 1));
  const lockText = (t) => (t.req ? T(REQ[t.req]) : T("Reach level {n}", { n: t.lv }));

  const geoCache = new Map();
  function kindGeo(i) {
    let k = geoCache.get(i); if (k) return k;
    const parts = TYPES[i].parts();
    const flat = (list) => list.map((g) => { const x = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(x.attributes)) if (!["position", "normal", "uv"].includes(a)) x.deleteAttribute(a); return x; });
    const merged = parts.map(([, list]) => mergeGeometries(flat(list), false));
    const geo = merged.length === 1 ? merged[0] : mergeGeometries(merged, true);
    const mats = parts.map(([m]) => M[m]);
    k = { geo, mat: mats.length === 1 ? mats[0] : mats };
    geoCache.set(i, k); return k;
  }

  // ---------------- a set of bricks drawn with one InstancedMesh per kind ----------------
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  function brickSet(parent, N) {
    const meshes = new Map(); // kind → InstancedMesh
    const center = (x, z) => [x - N / 2 + 0.5, z - N / 2 + 0.5];
    function mesh(t, need) {
      let m = meshes.get(t);
      if (m && m.instanceMatrix.count >= need) return m;
      const cap = Math.max(64, 1 << Math.ceil(Math.log2(need + 1)));
      const k = kindGeo(t), n = new THREE.InstancedMesh(k.geo, k.mat, cap);
      n.count = 0; n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false;
      n.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      if (m) { parent.remove(m); m.dispose(); }
      parent.add(n); meshes.set(t, n); return n;
    }
    function write(m, i, b, lift = 0, sq = 1) {
      const [cx, cz] = center(b.x, b.z);
      dummy.position.set(cx, b.y + lift, cz); dummy.rotation.set(0, -b.r * Math.PI / 2, 0);
      if (sq <= 0) dummy.scale.setScalar(0.0001); else dummy.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, col.setHex(COLORS[b.c] ?? 0xffffff));
    }
    // rebuild the kinds in `kinds` (or all) from the list; `upto` limits to the first n bricks (time-lapse)
    function sync(list, kinds = null, upto = Infinity) {
      const by = new Map();
      list.forEach((b, idx) => { if (idx >= upto) return; if (kinds && !kinds.has(b.t)) return; let a = by.get(b.t); if (!a) by.set(b.t, (a = [])); a.push(b); });
      const todo = kinds ? [...kinds] : [...new Set([...meshes.keys(), ...by.keys()])];
      for (const t of todo) {
        const a = by.get(t) || [];
        if (!a.length) { const m = meshes.get(t); if (m) m.count = 0; continue; }
        const m = mesh(t, a.length);
        a.forEach((b, i) => { b.i = i; write(m, i, b); });
        m.count = a.length; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
      }
    }
    function pose(b, lift, sq) { const m = meshes.get(b.t); if (!m || b.i == null) return; write(m, b.i, b, lift, sq); m.instanceMatrix.needsUpdate = true; }
    function clear() { meshes.forEach((m) => { parent.remove(m); m.dispose(); }); meshes.clear(); }
    return { sync, pose, clear, center };
  }

  // ---------------- bytes ⇄ bricks ----------------
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  function encode(list, N) { const u = new Uint8Array(2 + list.length * 5); u[0] = 1; u[1] = N; list.forEach((b, i) => u.set([b.x, b.y, b.z, b.t, (b.r & 3) | (b.c << 2)], 2 + i * 5)); return b64(u); }
  function decode(s, N) {
    try {
      const u = unb64(s); if (u[0] !== 1) return [];
      const n0 = u[1] || N, out = [];
      for (let i = 2; i + 5 <= u.length && out.length < MAX_BRICKS; i += 5) {
        const [x, y, z, t, rc] = u.subarray(i, i + 5), c = rc >> 2;
        if (x >= n0 || z >= n0 || y >= HMAX || !TYPES[t] || c >= COLORS.length) continue;
        out.push({ x, y, z, t, r: rc & 3, c });
      }
      return out;
    } catch { return []; }
  }

  // ---------------- the island: ground, cliffs, the cloud sea, the way back ----------------
  const ISLE = new V3(0, 0, 900);
  const root = new THREE.Group(); root.name = "island"; root.position.copy(ISLE); root.visible = false; planet.add(root);
  let N = ISLAND_N, owner = "", kind = "home", lotCoin = null, readOnly = false;
  const brickRoot = new THREE.Group(); root.add(brickRoot);
  let set = brickSet(brickRoot, N);
  const land = new THREE.Group(); root.add(land);
  const ghostRoot = new THREE.Group(); root.add(ghostRoot);
  const fxRoot = new THREE.Group(); root.add(fxRoot);
  const gridTex = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 64); g.strokeStyle = "rgba(0,0,0,.16)"; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  let topMat = null, exit = null;
  function buildLand() {
    land.clear();
    const W = N + 6;
    topMat = new THREE.MeshStandardMaterial({ color: 0x5fae62, roughness: 0.95, map: gridTex.clone() });
    topMat.map.repeat.set(W, W); topMat.map.offset.set(0, 0); topMat.map.needsUpdate = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(W, 1, W), [new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 1 }), topMat, new THREE.MeshStandardMaterial({ color: 0x5a3e2a }), new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 1 })]);
    top.position.y = -0.5; top.receiveShadow = true; land.add(top);
    // blocky cliffs that narrow toward the bottom
    const rock = new THREE.MeshStandardMaterial({ color: 0x7d7368, roughness: 1, flatShading: true }), dirt = new THREE.MeshStandardMaterial({ color: 0x5f4430, roughness: 1 });
    for (let i = 1; i <= 5; i++) { const w = W * (1 - i * 0.15); const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, w), i % 2 ? dirt : rock); m.position.y = -1 - i * 1.3; m.rotation.y = i * 0.12; land.add(m); }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(W * 0.12, 5, 5), rock); tip.rotation.x = Math.PI; tip.position.y = -10.5; land.add(tip);
    // a sea of clouds below and a few around
    const sea = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: true, depthWrite: false }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -16; land.add(sea);
    const cl = K.makeClouds(14, { spread: 80, y: -13 }); cl.userData.mat.emissiveIntensity = 0.55; cl.userData.mat.flatShading = false; land.add(cl); land.userData.clouds = cl;
    // the way back: a portal at the front edge, facing the island
    exit = K.makePortal(T("Back to the world")); exit.position.set(-N / 2 - 1.2, 0, N / 2 - 1.5); exit.rotation.y = Math.PI / 2; exit.scale.setScalar(0.8); land.add(exit);
  }
  buildLand();

  // ---------------- state ----------------
  let bricks = [], occ = new Map(), cols = new Map();
  const key = (x, y, z) => x + "," + y + "," + z, ckey = (x, z) => x + "," + z;
  function index() {
    occ = new Map(); cols = new Map();
    bricks.forEach((b) => addIndex(b));
  }
  function addIndex(b) { for (let k = 0; k < TYPES[b.t].tall; k++) occ.set(key(b.x, b.y + k, b.z), b); const c = ckey(b.x, b.z); let a = cols.get(c); if (!a) cols.set(c, (a = [])); a.push(b); }
  function dropIndex(b) { for (let k = 0; k < TYPES[b.t].tall; k++) occ.delete(key(b.x, b.y + k, b.z)); const a = cols.get(ckey(b.x, b.z)); if (a) a.splice(a.indexOf(b), 1); }
  const free = (x, y, z, tall = 1) => { if (x < 0 || z < 0 || x >= N || z >= N || y < 0 || y + tall > HMAX) return false; for (let k = 0; k < tall; k++) if (occ.has(key(x, y + k, z))) return false; return true; };

  // ---------------- walking on bricks: floor under the feet, walls in the way ----------------
  const local = (v) => new V3(v.x - ISLE.x, v.y, v.z - ISLE.z);
  const cellOf = (lx, lz) => [Math.floor(lx + N / 2), Math.floor(lz + N / 2)];
  const span = (b) => { const t = TYPES[b.t]; return [b.y, b.y + (t.tall - 1) + t.top]; };
  const CORNERS = [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]];
  function floorAt(v) {
    const p = local(v); let best = 0;
    for (const [dx, dz] of CORNERS) {
      const [cx, cz] = cellOf(p.x + dx, p.z + dz), a = cols.get(ckey(cx, cz)); if (!a) continue;
      for (const b of a) { if (!TYPES[b.t].solid) continue; const top = span(b)[1]; if (top <= p.y + 0.56 && top > best) best = top; }
    }
    return best;
  }
  function blocked(v) {
    const p = local(v), lim = N / 2 + 2.6;
    if (Math.abs(p.x) > lim || Math.abs(p.z) > lim) return true;
    for (const [dx, dz] of CORNERS) {
      const [cx, cz] = cellOf(p.x + dx, p.z + dz), a = cols.get(ckey(cx, cz)); if (!a) continue;
      for (const b of a) { if (!TYPES[b.t].solid) continue; const [y0, y1] = span(b); if (y1 > p.y + 0.56 && y0 < p.y + 1.8) return true; }
    }
    return false;
  }

  // ---------------- residents: every door brings one in ----------------
  const NAMES = ["Arcy", "Nova", "Beryl", "Juno", "Milo", "Kiki", "Rook", "Tess"];
  const residents = [];
  let resBusy = false;
  async function syncResidents(celebrate) {
    if (resBusy) return; resBusy = true;
    try {
      const doors = bricks.filter((b) => TYPES[b.t].id === "door").slice(0, 8);
      while (residents.length > doors.length) { const r = residents.pop(); root.remove(r.g); }
      for (let i = residents.length; i < doors.length; i++) {
        const d = doors[i], chars = K.CHARACTERS.filter((c) => c !== "bot");
        const ch = await K.makeCharacter(chars[(d.x * 7 + d.z * 3 + i) % chars.length], VER).catch(() => null); if (!ch) continue;
        const g = new THREE.Group(); g.add(ch.obj); ch.obj.scale.setScalar(0.85);
        const name = NAMES[i % NAMES.length]; const tag = K.label(name, { accent: "#7ee0a0", size: 0.36 }); tag.position.y = 2.55; g.add(tag);
        const [cx, cz] = set.center(d.x, d.z), fr = new V3(Math.sin(-d.r * Math.PI / 2), 0, Math.cos(-d.r * Math.PI / 2));
        g.position.set(cx + fr.x * 0.9, d.y, cz + fr.z * 0.9); root.add(g);
        const r = { g, ch, name, to: null, wait: 1 + Math.random() * 2, bub: null, bubT: 0, door: d };
        residents.push(r);
        if (celebrate) { confetti(g.position.clone().setY(d.y + 1.2)); toast(T("{name} moved in", { name })); Snd.win(); ch.play("emote-yes", { once: true }); }
      }
      ctx.labelsDirty(); paintHud();
    } finally { resBusy = false; }
  }
  const walkable = (lx, lz, y) => { const v = new V3(lx + ISLE.x, y, lz + ISLE.z); return !blocked(v) && Math.abs(floorAt(v) - y) < 0.6; };
  function tickResidents(dt, t) {
    const lines = ctx.lines();
    residents.forEach((r, i) => {
      r.ch.update(dt, t);
      const p = r.g.position;
      if (!r.to) {
        r.wait -= dt; if (r.wait > 0) { r.ch.play("idle"); return; }
        for (let k = 0; k < 8; k++) { const lx = (Math.random() - 0.5) * N, lz = (Math.random() - 0.5) * N; if (walkable(lx, lz, 0)) { r.to = new V3(lx, 0, lz); break; } }
        r.wait = 2 + Math.random() * 4; if (!r.to) return;
      }
      const d = new V3(r.to.x - p.x, 0, r.to.z - p.z), len = d.length();
      if (len < 0.3) { r.to = null; return; }
      d.normalize(); const nx = p.x + d.x * dt * 1.6, nz = p.z + d.z * dt * 1.6;
      if (!walkable(nx, nz, p.y)) { r.to = null; r.wait = 0.5; return; }
      p.x = nx; p.z = nz; p.y = floorAt(new V3(p.x + ISLE.x, p.y, p.z + ISLE.z));
      r.ch.obj.rotation.y = Math.atan2(d.x, d.z); r.ch.play("walk", { speed: 0.8 });
      if ((r.bubT -= dt) < 0) {
        r.bubT = 9 + Math.random() * 9 + i * 2;
        if (r.bub) { r.g.remove(r.bub); r.bub = null; }
        if (lines.length && Math.random() < 0.6) { r.bub = K.bubble(lines[(Math.floor(t) + i) % lines.length], "#7ee0a0"); r.bub.position.y = 3.1; r.bub.scale.multiplyScalar(0.8); r.g.add(r.bub); setTimeout(() => { if (r.bub) { r.g.remove(r.bub); r.bub = null; ctx.labelsDirty(); } }, 5000); ctx.labelsDirty(); }
      }
    });
  }

  // ---------------- effects: drop, break, confetti, layer-by-layer builds, the time-lapse ----------------
  const anims = [];
  function dropIn(b, delay = 0) { if (ctx.reduce) return; anims.push({ b, t0: performance.now() + delay }); }
  function tickAnims() {
    const now = performance.now();
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i], k = (now - a.t0) / 220;
      if (k < 0) { set.pose(a.b, 0, 0); continue; }
      if (k >= 1) { set.pose(a.b, 0, 1); anims.splice(i, 1); continue; }
      const lift = k < 0.6 ? (1 - k / 0.6) * 0.9 : 0, sq = k < 0.6 ? 1 : 1 - Math.sin((k - 0.6) / 0.4 * Math.PI) * 0.22;
      set.pose(a.b, lift, sq);
    }
  }
  const shardGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  function shatter(b) {
    if (ctx.reduce) return;
    const [cx, cz] = set.center(b.x, b.z), c = COLORS[b.c] ?? 0xffffff;
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(shardGeo, new THREE.MeshStandardMaterial({ color: c, transparent: true }));
      m.position.set(cx + (Math.random() - 0.5) * 0.5, b.y + 0.5, cz + (Math.random() - 0.5) * 0.5); fxRoot.add(m);
      const v = new V3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4), t0 = performance.now();
      const off = st.on((dt) => { const k = (performance.now() - t0) / 700; v.y -= 14 * dt; m.position.addScaledVector(v, dt); m.rotation.x += dt * 8; m.material.opacity = 1 - k; if (k >= 1) { off(); fxRoot.remove(m); m.material.dispose(); } });
    }
  }
  function confetti(at) {
    if (ctx.reduce) return;
    const cols2 = [0x2f86ff, 0x2ee07a, 0xffc861, 0xff7ad9, 0x35d8d0];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ color: cols2[i % 5], side: THREE.DoubleSide, transparent: true }));
      m.position.copy(at); fxRoot.add(m);
      const v = new V3((Math.random() - 0.5) * 5, 5 + Math.random() * 4, (Math.random() - 0.5) * 5), t0 = performance.now();
      const off = st.on((dt) => { const k = (performance.now() - t0) / 1500; v.y -= 9 * dt; v.multiplyScalar(1 - dt * 0.8); m.position.addScaledVector(v, dt); m.rotation.x += dt * 9; m.rotation.y += dt * 6; m.material.opacity = 1 - k * k; if (k >= 1) { off(); fxRoot.remove(m); m.geometry.dispose(); m.material.dispose(); } });
    }
  }
  let lapse = null;
  function replay() {
    if (!bricks.length || lapse) return;
    const t0 = performance.now(), ms = Math.min(9000, 2500 + bricks.length * 6);
    lapse = { t0, ms }; document.body.classList.add("wi-lapse"); toast(T("Time-lapse: how this island was built"));
  }
  function tickLapse() {
    if (!lapse) return;
    const k = Math.min(1, (performance.now() - lapse.t0) / lapse.ms);
    set.sync(bricks, null, Math.ceil(bricks.length * k * k * (3 - 2 * k)));
    if (k >= 1) { lapse = null; set.sync(bricks); document.body.classList.remove("wi-lapse"); }
  }

  // ---------------- editing, with undo ----------------
  const undo = [], redo = [];
  const mirrorRot = (t, r) => (["slope", "roof", "stairs", "door", "window", "roundwin", "wall", "neon", "sign", "bench", "flag"].includes(TYPES[t].id) ? (4 - r) % 4 : r);
  function apply(op, rec = true) {
    const touched = new Set();
    (op.del || []).forEach((b) => { const i = bricks.indexOf(b); if (i < 0) return; bricks.splice(i, 1); dropIndex(b); touched.add(b.t); });
    (op.add || []).forEach((b) => { if (!free(b.x, b.y, b.z, TYPES[b.t].tall) || bricks.length >= MAX_BRICKS) return; bricks.push(b); addIndex(b); touched.add(b.t); });
    (op.paint || []).forEach((p) => { p.b.c = p.to; touched.add(p.b.t); });
    set.sync(bricks, touched);
    if (rec) { undo.push(op); if (undo.length > 200) undo.shift(); redo.length = 0; }
    changed();
  }
  const inverse = (op) => ({ add: op.del, del: op.add, paint: (op.paint || []).map((p) => ({ b: p.b, to: p.from, from: p.to })) });
  function doUndo() { const op = undo.pop(); if (!op) return; const inv = inverse(op); apply(inv, false); redo.push(op); Snd.pop(); }
  function doRedo() { const op = redo.pop(); if (!op) return; apply(op, false); undo.push(op); Snd.place(); }
  let lastDoors = 0;
  function changed() {
    saveSoon(); paintHud();
    const doors = bricks.filter((b) => TYPES[b.t].id === "door").length;
    if (doors !== lastDoors) { const more = doors > lastDoors; lastDoors = doors; syncResidents(more); }
    ctx.onStats(stats());
  }
  function stats() {
    const ids = bricks.map((b) => TYPES[b.t].id);
    const nature = ids.filter((i) => ["tree", "pine", "bush", "flowers", "grass", "planter", "water"].includes(i)).length;
    const light = ids.filter((i) => ["lamp", "lantern", "neon", "crystal", "neoncube"].includes(i)).length;
    const beauty = Math.min(999, nature * 2 + light * 2 + new Set(ids).size * 5 + new Set(bricks.map((b) => b.c)).size * 2);
    return { bricks: bricks.length, residents: Math.min(8, ids.filter((i) => i === "door").length), beauty };
  }

  // ---------------- building: tools, the ghost, picking cells ----------------
  let building = false, tool = "place", rot = 0, color = -1, mirror = false, layer = -1;
  const HOT0 = ["brick", "plate", "slope", "wall", "window", "door", "roof", "tree", "lamp"];
  let hot = (() => { try { const h = JSON.parse(localStorage.getItem("arc.world.hot") || "null"); if (Array.isArray(h) && h.length === 9 && h.every((x) => TI[x] != null)) return h; } catch { /* default */ } return HOT0.slice(); })();
  let slot = 0;
  const cur = () => TI[hot[slot]];
  const curColor = () => (color >= 0 ? color : TYPES[cur()].color);
  const ray = new THREE.Raycaster();
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x7ee0a0, transparent: true, opacity: 0.45, depthWrite: false });
  const ghostBad = new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.4, depthWrite: false });
  const hiBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)), new THREE.LineBasicMaterial({ color: 0xffffff }));
  let ghost = null, aim = null, ghostKind = -1;
  function setGhost() {
    if (ghost) { ghostRoot.remove(ghost); ghost = null; }
    ghostKind = cur(); const k = kindGeo(ghostKind);
    ghost = new THREE.Mesh(k.geo, ghostMat); ghost.renderOrder = 5; ghostRoot.add(ghost);
    ghostRoot.add(hiBox);
  }
  // walk the grid along the pointer ray (Amanatides–Woo); the ground plane counts as y = 0
  function pick(clientX, clientY) {
    const r = st.renderer.domElement.getBoundingClientRect();
    ray.setFromCamera({ x: ((clientX - r.left) / r.width) * 2 - 1, y: -((clientY - r.top) / r.height) * 2 + 1 }, st.camera);
    const o = root.worldToLocal(ray.ray.origin.clone()), d = root.worldToLocal(ray.ray.origin.clone().add(ray.ray.direction)).sub(o).normalize();
    const g = new V3(o.x + N / 2, o.y, o.z + N / 2);
    if (layer >= 0) {
      if (Math.abs(d.y) < 1e-4) return null;
      const s = (layer + 0.5 - g.y) / d.y; if (s < 0) return null;
      const x = Math.floor(g.x + d.x * s), z = Math.floor(g.z + d.z * s);
      if (x < 0 || z < 0 || x >= N || z >= N) return null;
      const hit = occ.get(key(x, layer, z));
      return { place: [x, layer, z], hit: hit || null };
    }
    let x = Math.floor(g.x), y = Math.floor(g.y), z = Math.floor(g.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
    let tx = sx > 0 ? (x + 1 - g.x) * tdx : sx < 0 ? (g.x - x) * tdx : Infinity, ty = sy > 0 ? (y + 1 - g.y) * tdy : sy < 0 ? (g.y - y) * tdy : Infinity, tz = sz > 0 ? (z + 1 - g.z) * tdz : sz < 0 ? (g.z - z) * tdz : Infinity;
    let n = [0, 0, 0];
    for (let i = 0; i < 240; i++) {
      if (y < 0) { if (x >= 0 && z >= 0 && x < N && z < N) return { place: [x, 0, z], hit: null, ground: true }; return null; }
      if (y < HMAX + 2) { const b = occ.get(key(x, y, z)); if (b) { const p = [x - n[0], y - n[1], z - n[2]]; return { place: p, hit: b, normal: n }; } }
      if (tx < ty && tx < tz) { x += sx; tx += tdx; n = [sx, 0, 0]; } else if (ty < tz) { y += sy; ty += tdy; n = [0, sy, 0]; } else { z += sz; tz += tdz; n = [0, 0, sz]; }
      if (y > HMAX + 30 && sy > 0) return null;
    }
    return null;
  }
  function hover(clientX, clientY) {
    if (!building || lapse) { ghostRoot.visible = false; return; }
    aim = pick(clientX, clientY); paintGhost();
  }
  function paintGhost() {
    if (!aim) { ghostRoot.visible = false; return; }
    ghostRoot.visible = true;
    if (ghostKind !== cur()) setGhost();
    const showGhost = tool === "place";
    ghost.visible = showGhost;
    const target = showGhost ? aim.place : aim.hit ? [aim.hit.x, aim.hit.y, aim.hit.z] : aim.place;
    const [cx, cz] = set.center(target[0], target[2]);
    if (showGhost) { const t = TYPES[cur()]; ghost.material = free(target[0], target[1], target[2], t.tall) && unlocked(t) ? ghostMat : ghostBad; ghost.position.set(cx, target[1], cz); ghost.rotation.y = -rot * Math.PI / 2; }
    hiBox.position.set(cx, target[1] + 0.5, cz); hiBox.scale.set(1, showGhost ? TYPES[cur()].tall : aim.hit ? TYPES[aim.hit.t].tall : 1, 1); hiBox.position.y = target[1] + hiBox.scale.y / 2;
    hiBox.material.color.set(tool === "remove" ? 0xff4d6d : tool === "paint" ? COLORS[curColor()] : 0xffffff);
  }
  function act(alt) {
    if (!building || readOnly || lapse || !aim) return;
    const t = alt ? "remove" : tool;
    if (t === "place") {
      const ty = TYPES[cur()]; if (!unlocked(ty)) { toast(T("Locked: {why}", { why: lockText(ty) })); Snd.bad(); return; }
      const [x, y, z] = aim.place; if (!free(x, y, z, ty.tall)) { Snd.bad(); return; }
      if (bricks.length >= MAX_BRICKS) { toast(T("This island is full ({n} bricks)", { n: MAX_BRICKS })); return; }
      const add = [{ x, y, z, t: cur(), r: rot, c: curColor() }];
      if (mirror) { const mx = N - 1 - x; if (mx !== x && free(mx, y, z, ty.tall)) add.push({ x: mx, y, z, t: cur(), r: mirrorRot(cur(), rot), c: curColor() }); }
      apply({ add }); add.forEach((b) => dropIn(b)); Snd.place(); ctx.avatarPlay("interact-right");
    } else if (t === "remove") {
      const b = aim.hit; if (!b) return;
      const del = [b]; if (mirror) { const m = occ.get(key(N - 1 - b.x, b.y, b.z)); if (m && m !== b && m.t === b.t) del.push(m); }
      apply({ del }); del.forEach(shatter); Snd.pop();
    } else if (t === "paint") {
      const b = aim.hit; if (!b || b.c === curColor()) return;
      const paint = [{ b, from: b.c, to: curColor() }]; if (mirror) { const m = occ.get(key(N - 1 - b.x, b.y, b.z)); if (m && m !== b) paint.push({ b: m, from: m.c, to: curColor() }); }
      apply({ paint }); Snd.paint();
    } else if (t === "pick") {
      const b = aim.hit; if (!b) return;
      const id = TYPES[b.t].id, at = hot.indexOf(id);
      if (at >= 0) slot = at; else { hot[slot] = id; saveHot(); }
      color = b.c; rot = b.r; setTool("place"); paintBuild();
    }
    aim = null; ghostRoot.visible = false;
  }
  function setTool(t) { tool = t; paintBuild(); paintGhost(); }
  const saveHot = () => { try { localStorage.setItem("arc.world.hot", JSON.stringify(hot)); } catch { /* private */ } };

  // ---------------- blueprints ----------------
  const BP = {
    cottage: () => { const o = []; for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) for (let y = 0; y < 3; y++) { if (x > 0 && x < 4 && z > 0 && z < 4) continue; if (x === 2 && z === 4 && y < 2) { if (y === 0) o.push([x, y, z, "door", 0, 0]); continue; } if ((x === 0 || x === 4) && z === 2 && y === 1) { o.push([x, y, z, "window", x === 0 ? 3 : 1, 0]); continue; } if (z === 0 && x === 2 && y === 1) { o.push([x, y, z, "window", 2, 0]); continue; } o.push([x, y, z, "brick", 0, y === 2 ? 18 : 19]); } for (let x = 0; x < 5; x++) { o.push([x, 3, 0, "roof", 2, 5], [x, 3, 4, "roof", 0, 5], [x, 3, 1, "brick", 0, 5], [x, 3, 3, "brick", 0, 5], [x, 3, 2, "brick", 0, 5], [x, 4, 1, "roof", 2, 5], [x, 4, 3, "roof", 0, 5], [x, 4, 2, "peak", 1, 5]); } o.push([3, 5, 2, "chimney", 0, 5], [0, 0, 5, "flowers", 0, 9], [4, 0, 5, "flowers", 0, 9], [1, 0, 5, "bush", 0, 9]); return o; },
    stall: () => { const o = []; [[0, 0], [3, 0], [0, 2], [3, 2]].forEach(([x, z]) => { for (let y = 0; y < 2; y++) o.push([x, y, z, "pillar", 0, 0]); }); for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) o.push([x, 2, z, "plate", 0, x % 2 ? 0 : 13]); for (let x = 1; x < 3; x++) o.push([x, 0, 2, "brick", 0, 17], [x, 1, 2, "plate", 0, 18]); o.push([1, 2, 3, "sign", 0, 13], [0, 0, 3, "lantern", 0, 3], [3, 0, 3, "lantern", 0, 3]); return o; },
    tower: () => { const o = []; for (let y = 0; y < 7; y++) for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) { if (x === 1 && z === 1) continue; if (x === 1 && z === 2 && y < 2) { if (y === 0) o.push([x, y, z, "door", 0, 0]); continue; } if (y % 2 === 1 && x === 1 && z === 0) { o.push([x, y, z, "roundwin", 2, 0]); continue; } o.push([x, y, z, "brick", 0, y % 3 === 2 ? 13 : 1]); } for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) o.push([x, 7, z, x === 1 && z === 1 ? "dome" : "plate", 0, x === 1 && z === 1 ? 11 : 13]); o.push([1, 8, 1, "flag", 0, 13]); return o; },
    garden: () => { const o = []; for (let x = 0; x < 7; x++) for (let z = 0; z < 7; z++) { if (x === 3 || z === 3) { o.push([x, 0, z, "tile", 0, 19]); continue; } if ((x + z) % 3 === 0) o.push([x, 0, z, "flowers", 0, 9]); else if ((x * z) % 5 === 1) o.push([x, 0, z, "bush", 0, 9]); else o.push([x, 0, z, "grass", 0, 8]); } o.push([0, 0, 0, "tree", 0, 9], [6, 0, 0, "tree", 0, 10], [0, 0, 6, "tree", 0, 10], [6, 0, 6, "tree", 0, 9], [2, 0, 4, "bench", 0, 17], [4, 0, 2, "lamp", 0, 3]); return o.filter((b, i, a) => a.findIndex((c) => c[0] === b[0] && c[1] === b[1] && c[2] === b[2]) === i); },
    fountain: () => { const o = []; for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) { const edge = x === 0 || z === 0 || x === 4 || z === 4; o.push([x, 0, z, edge ? "plate" : "water", 0, edge ? 1 : 12]); } o.push([2, 0, 2, "pillar", 0, 0], [2, 1, 2, "pillar", 0, 0], [2, 2, 2, "dome", 0, 11], [0, 1, 0, "lantern", 0, 3], [4, 1, 0, "lantern", 0, 3], [0, 1, 4, "lantern", 0, 3], [4, 1, 4, "lantern", 0, 3]); return o; },
    rocketpad: () => { const o = []; for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) o.push([x, 0, z, "plate", 0, x === 1 && z === 1 ? 20 : 3]); o.push([1, 1, 1, "rocket", 0, 20], [0, 1, 0, "neon", 0, 11], [2, 1, 2, "neon", 2, 11]); return o; },
  };
  const BP_NAMES = { cottage: "Cottage", stall: "Market stall", tower: "Lookout tower", garden: "Garden", fountain: "Fountain", rocketpad: "Rocket pad" };
  const bpList = (id) => BP[id]().map(([x, y, z, t, r, c]) => ({ x, y, z, t: TI[t], r, c }));
  const toCode = (list) => { if (!list.length) return ""; const mx = Math.min(...list.map((b) => b.x)), mz = Math.min(...list.map((b) => b.z)), my = Math.min(...list.map((b) => b.y)); return "ARCBP1." + encode(list.map((b) => ({ ...b, x: b.x - mx, y: b.y - my, z: b.z - mz })), 64); };
  const fromCode = (s) => { const m = /^ARCBP1\.([A-Za-z0-9+/=]+)$/.exec(String(s || "").trim()); return m ? decode(m[1], 64) : []; };
  let pending = null; // a blueprint waiting for a spot
  function startBlueprint(list, name) {
    if (!list.length) { toast(T("That blueprint code isn't valid.")); return; }
    const locked = list.find((b) => !unlocked(TYPES[b.t])); if (locked) { toast(T("Locked: {why}", { why: lockText(TYPES[locked.t]) })); return; }
    pending = { list, name }; setBuild(true); setTool("place"); toast(T("Tap where {name} should go", { name }));
  }
  function placeBlueprint() {
    if (!pending || !aim) return false;
    const [ox, oy, oz] = aim.place, add = [];
    for (const b of pending.list) { const n = { ...b, x: b.x + ox, y: b.y + oy, z: b.z + oz }; if (free(n.x, n.y, n.z, TYPES[n.t].tall)) add.push(n); }
    if (!add.length) { toast(T("No room there")); return true; }
    add.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
    const name = pending.name; pending = null;
    apply({ add }); add.forEach((b, i) => dropIn(b, i * Math.max(4, 1400 / add.length)));
    const dur = add.length * Math.max(4, 1400 / add.length) + 300;
    for (let i = 0; i < 5; i++) setTimeout(() => Snd.place(), i * dur / 5);
    setTimeout(() => { const [cx, cz] = set.center(ox + 2, oz + 2); confetti(new V3(cx, oy + 3, cz)); Snd.win(); toast(T("{name} built", { name })); }, dur);
    return true;
  }

  // ---------------- saving: this browser always, your wallet when signed in ----------------
  const LKEY = () => (kind === "lot" ? "arc.world.lot." + lotCoin.token : "arc.world.isle");
  let saveT = 0, cloudT = 0, saveState = "";
  function saveSoon() {
    if (readOnly) return;
    clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LKEY(), JSON.stringify({ d: encode(bricks, N), at: Date.now() })); } catch { /* private */ } setSave(sess() ? T("Saving…") : T("Saved in this browser")); }, 600);
    clearTimeout(cloudT); cloudT = setTimeout(cloudSave, 8000);
  }
  async function cloudSave() {
    const s = sess(); if (!s || readOnly) return;
    const data = encode(bricks, N), st2 = stats();
    const body = kind === "lot" ? { action: "world-lot-save", ...s, coin: lotCoin.token, data } : { action: "world-island-save", ...s, data, name: P.name || "", n: st2.bricks, res: st2.residents };
    try {
      const r = await post(body);
      if (r.ok) setSave(T("Saved to your wallet"));
      else if (r.status === 503) setSave(T("Saved in this browser"));
      else if (r.status === 429) { clearTimeout(cloudT); cloudT = setTimeout(cloudSave, 9000); }
      else setSave(r.j.error || T("Couldn't save"));
    } catch { setSave(T("Saved in this browser")); }
  }
  function setSave(t) { saveState = t; const el = $("wi-save"); if (el) el.textContent = t; }
  async function loadOwn() {
    let local = null; try { local = JSON.parse(localStorage.getItem(LKEY()) || "null"); } catch { local = null; }
    let list = local && local.d ? decode(local.d, N) : [];
    const me = sess();
    try {
      if (kind === "lot") { const r = await fetch("/api/social?world=lots&coins=" + lotCoin.token); if (r.ok) { const j = await r.json(); const d = j.lots && j.lots[lotCoin.token]; if (d && (!local || (d.at || 0) > (local.at || 0))) list = decode(d.data, N); } }
      else if (me) { const r = await fetch("/api/social?world=island&wallet=" + me.wallet); if (r.ok) { const j = await r.json(); if (j.data && (!local || (j.at || 0) > (local.at || 0))) list = decode(j.data, N); } }
    } catch { /* keep this browser's copy */ }
    return list;
  }

  // ---------------- visiting: likes and stamps ----------------
  const STAMPS = ["Lovely build", "So cozy", "Wow", "Great view", "Neighbours?", "Built different"];
  let visitInfo = null;
  async function loadVisit(wallet) {
    const r = await fetch("/api/social?world=island&wallet=" + wallet);
    if (!r.ok) throw new Error(T("Couldn't load that island"));
    const j = await r.json();
    if (j.enabled === false) throw new Error(T("Island visits open once cloud saving is switched on."));
    if (!j.data) throw new Error(T("That wallet hasn't built an island yet"));
    visitInfo = { wallet, name: j.name || wallet.slice(0, 6) + "…" + wallet.slice(-4), likes: j.likes || 0, stamps: j.stamps || [] };
    return j.data ? decode(j.data, ISLAND_N) : [];
  }
  async function like() {
    const s = sess(); if (!s) { toast(T("Sign in with your wallet to like islands")); return; }
    const r = await post({ action: "world-like", ...s, target: visitInfo.wallet });
    if (r.ok) { visitInfo.likes = r.j.likes ?? visitInfo.likes + 1; paintVisit(); Snd.win(); confetti(new V3(0, 3, N / 2 - 2)); }
    else toast(r.j.error || T("Couldn't like it right now"));
  }
  async function stamp(k) {
    const s = sess(); if (!s) { toast(T("Sign in with your wallet to leave a stamp")); return; }
    const r = await post({ action: "world-stamp", ...s, target: visitInfo.wallet, k });
    if (r.ok) { visitInfo.stamps = r.j.stamps || visitInfo.stamps; paintVisit(); Snd.pick(); toast(T("Stamp left")); }
    else toast(r.j.error || T("Couldn't leave a stamp right now"));
  }

  // ---------------- entering and leaving ----------------
  let active = false;
  async function enter(opt = {}) {
    kind = opt.lot ? "lot" : "home"; lotCoin = opt.lot || null; readOnly = !!opt.visit; owner = opt.visit || "";
    const n2 = kind === "lot" ? LOT_N : ISLAND_N;
    if (n2 !== N) { N = n2; set.clear(); set = brickSet(brickRoot, N); buildLand(); }
    let list;
    try { list = opt.visit ? await loadVisit(opt.visit) : await loadOwn(); }
    catch (e) { toast(e.message || T("Couldn't load that island")); return false; }
    bricks = list; index(); set.clear(); set = brickSet(brickRoot, N); set.sync(bricks);
    undo.length = 0; redo.length = 0; anims.length = 0;
    residents.splice(0).forEach((r) => root.remove(r.g)); lastDoors = bricks.filter((b) => TYPES[b.t].id === "door").length; syncResidents(false);
    root.visible = true; active = true; ghostRoot.visible = false;
    ctx.goTo(ISLE.clone().add(new V3(-N / 2 + 3.5, 0, N / 2 - 3.5)), Math.PI * 0.75);
    setSave(kind === "lot" || readOnly ? "" : sess() ? T("Saved to your wallet") : T("Saved in this browser"));
    paintHud(); document.body.classList.add("wi-on"); document.body.classList.toggle("wi-visit", readOnly);
    if (readOnly) paintVisit();
    if (kind === "lot") setBuild(true);
    ctx.labelsDirty(); ctx.onStats(readOnly ? null : stats());
    return true;
  }
  function leave() {
    if (!active) return;
    if (!readOnly) { clearTimeout(saveT); try { if (bricks.length || localStorage.getItem(LKEY())) localStorage.setItem(LKEY(), JSON.stringify({ d: encode(bricks, N), at: Date.now() })); } catch { /* private */ } cloudSave(); }
    setBuild(false); active = false; root.visible = false; pending = null; lapse = null;
    document.body.classList.remove("wi-on", "wi-visit", "wi-lapse"); closeSheets();
  }

  // ---------------- the island's own HUD (built here, styled in arc-v10.css as .wi-*) ----------------
  const ui = document.createElement("div"); ui.id = "wi"; ui.setAttribute("data-no-i18n", "");
  ui.innerHTML = `
  <div class="wi-bar"><div class="wi-title"><b id="wi-name"></b><span id="wi-stats"></span><small id="wi-save"></small></div>
    <div class="wi-acts"><button type="button" class="wi-b" id="wi-build-btn" aria-pressed="false">${esc(T("Build"))}<kbd>B</kbd></button><button type="button" class="wi-b" id="wi-bp-btn">${esc(T("Blueprints"))}</button><button type="button" class="wi-b" id="wi-replay-btn">${esc(T("Time-lapse"))}</button><button type="button" class="wi-b" id="wi-isles-btn">${esc(T("Islands"))}</button></div></div>
  <div class="wi-build" id="wi-build" hidden>
    <div class="wi-tools" role="toolbar" aria-label="${esc(T("Tools"))}">
      <button type="button" data-tool="place" title="${esc(T("Place"))}"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span>${esc(T("Place"))}</span></button>
      <button type="button" data-tool="remove" title="${esc(T("Remove"))} (X)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg><span>${esc(T("Remove"))}</span></button>
      <button type="button" data-tool="paint" title="${esc(T("Paint"))} (C)"><svg viewBox="0 0 24 24"><path d="M4 20l4-1 10-10-3-3L5 16z"/></svg><span>${esc(T("Paint"))}</span></button>
      <button type="button" data-tool="pick" title="${esc(T("Pick"))} (V)"><svg viewBox="0 0 24 24"><path d="M14 4l6 6-9 9H5v-6z"/></svg><span>${esc(T("Pick"))}</span></button>
      <i></i>
      <button type="button" id="wi-rot" title="${esc(T("Rotate"))} (R)"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5"/></svg><span>${esc(T("Rotate"))}</span></button>
      <button type="button" id="wi-mirror" aria-pressed="false" title="${esc(T("Mirror"))} (G)"><svg viewBox="0 0 24 24"><path d="M12 3v18M9 7L4 12l5 5zM15 7l5 5-5 5z"/></svg><span>${esc(T("Mirror"))}</span></button>
      <button type="button" id="wi-layer" aria-pressed="false" title="${esc(T("Layer lock"))} (L, [ ])"><svg viewBox="0 0 24 24"><path d="M12 4l9 5-9 5-9-5zM3 15l9 5 9-5"/></svg><span id="wi-layer-t">${esc(T("Layer"))}</span></button>
      <button type="button" id="wi-undo" title="${esc(T("Undo"))} (Ctrl+Z)"><svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/></svg><span>${esc(T("Undo"))}</span></button>
      <button type="button" id="wi-redo" title="${esc(T("Redo"))} (Ctrl+Y)"><svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3"/></svg><span>${esc(T("Redo"))}</span></button>
      <button type="button" id="wi-done" class="wi-done" title="${esc(T("Done"))} (B)"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg><span>${esc(T("Done"))}</span></button>
    </div>
    <div class="wi-hot" id="wi-hot" role="listbox" aria-label="${esc(T("Bricks"))}"></div>
    <button type="button" class="wi-more" id="wi-pal-btn">${esc(T("All bricks"))}<kbd>Tab</kbd></button>
  </div>
  <div class="wi-sheet" id="wi-pal" hidden><div class="wi-card"><header><h2>${esc(T("Bricks"))}</h2><button type="button" class="wp-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
    <nav class="wi-cats" id="wi-cats"></nav><div class="wi-grid" id="wi-grid"></div>
    <h3>${esc(T("Colour"))}</h3><div class="wi-colors" id="wi-colors"></div></div></div>
  <div class="wi-sheet" id="wi-bp" hidden><div class="wi-card"><header><h2>${esc(T("Blueprints"))}</h2><button type="button" class="wp-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
    <p class="wi-note">${esc(T("Pick one, then tap a spot on your island. It rises layer by layer."))}</p><div class="wi-bplist" id="wi-bplist"></div>
    <h3>${esc(T("Share a build"))}</h3><div class="wi-code"><button type="button" class="wp-btn" id="wi-copy">${esc(T("Copy my island as a code"))}</button><input id="wi-code-in" placeholder="ARCBP1.…" spellcheck="false" autocomplete="off"><button type="button" class="wp-btn" id="wi-paste">${esc(T("Use code"))}</button></div></div></div>
  <div class="wi-sheet" id="wi-isles" hidden><div class="wi-card"><header><h2>${esc(T("Islands"))}</h2><button type="button" class="wp-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
    <button type="button" class="wp-cta wi-mine" id="wi-go-mine">${esc(T("Go to my island"))}</button>
    <nav class="wi-cats" id="wi-isle-tabs"><button type="button" data-tab="top" aria-pressed="true">${esc(T("Popular"))}</button><button type="button" data-tab="recent" aria-pressed="false">${esc(T("Recently built"))}</button></nav>
    <ul class="wi-isle-list" id="wi-isle-list"></ul>
    <form class="wi-code" id="wi-visit-form"><input id="wi-visit-in" placeholder="${esc(T("Visit a wallet: 0x…"))}" spellcheck="false" autocomplete="off"><button type="submit" class="wp-btn">${esc(T("Visit"))}</button></form></div></div>
  <div class="wi-visitbar" id="wi-visitbar" hidden><div><b id="wi-v-name"></b><small id="wi-v-sub"></small></div><button type="button" class="wi-like" id="wi-like"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg><span id="wi-likes">0</span></button>
    <div class="wi-stamps" id="wi-stamps"></div><ul class="wi-stamp-log" id="wi-stamp-log"></ul></div>`;
  document.body.appendChild(ui);
  const q = (s) => ui.querySelector(s);

  function paintHud() {
    if (!active) return;
    const s = stats();
    $("wi-name").textContent = readOnly ? (visitInfo ? T("{name}'s island", { name: visitInfo.name }) : "") : kind === "lot" ? T("{sym} lot", { sym: "$" + lotCoin.symbol }) : T("My Island");
    $("wi-stats").innerHTML = `<span>${esc(s.bricks === 1 ? T("1 brick") : T("{n} bricks", { n: s.bricks }))}</span><span>${esc(s.residents === 1 ? T("1 resident") : T("{n} residents", { n: s.residents }))}</span><span>${esc(T("Beauty {n}", { n: s.beauty }))}</span>`;
    q(".wi-acts").hidden = readOnly; $("wi-replay-btn").hidden = !bricks.length;
    $("wi-bp-btn").hidden = kind === "lot";
  }
  function paintBuild() {
    $("wi-build").hidden = !building;
    $("wi-build-btn").setAttribute("aria-pressed", String(building));
    ui.querySelectorAll("[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
    $("wi-mirror").setAttribute("aria-pressed", String(mirror));
    $("wi-layer").setAttribute("aria-pressed", String(layer >= 0)); $("wi-layer-t").textContent = layer >= 0 ? T("Layer {n}", { n: layer + 1 }) : T("Layer");
    $("wi-hot").innerHTML = hot.map((id, i) => { const t = TYPES[TI[id]]; return `<button type="button" role="option" aria-selected="${i === slot}" data-slot="${i}" title="${esc(t.name)}${unlocked(t) ? "" : " · " + esc(lockText(t))}" class="${unlocked(t) ? "" : "locked"}"><img alt="" src="${thumbs[TI[id]] || ""}"><i style="--c:${hexc(i === slot ? curColor() : t.color)}"></i><kbd>${i + 1}</kbd></button>`; }).join("");
    if (!thumbsDone) renderThumbs().then(paintBuild);
  }
  const hexc = (i) => "#" + (COLORS[i] ?? 0xffffff).toString(16).padStart(6, "0");
  let palCat = 0;
  function paintPal() {
    $("wi-cats").innerHTML = CAT.map((c, i) => `<button type="button" data-cat="${i}" aria-pressed="${i === palCat}">${esc(T(c))}</button>`).join("");
    $("wi-grid").innerHTML = TYPES.map((t, i) => (t.cat !== palCat ? "" : `<button type="button" data-k="${i}" class="${unlocked(t) ? "" : "locked"}" aria-pressed="${i === cur()}"><img alt="" src="${thumbs[i] || ""}"><b>${esc(t.name)}</b>${unlocked(t) ? "" : `<small>${esc(lockText(t))}</small>`}</button>`)).join("");
    $("wi-colors").innerHTML = COLORS.map((c, i) => `<button type="button" data-col="${i}" aria-pressed="${i === curColor()}" style="--c:${hexc(i)}" aria-label="${esc(T("Colour {n}", { n: i + 1 }))}"></button>`).join("");
  }
  const thumbs = []; let thumbsDone = false, thumbsBusy = null;
  function renderThumbs() {
    if (thumbsBusy) return thumbsBusy;
    thumbsBusy = (async () => {
      let r = null;
      try {
        r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(96, 96); r.outputColorSpace = THREE.SRGBColorSpace;
        const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.4)); const dl = new THREE.DirectionalLight(0xffffff, 1.8); dl.position.set(3, 5, 4); sc.add(dl);
        const cm = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
        for (let i = 0; i < TYPES.length; i++) {
          const k = kindGeo(i), m = new THREE.InstancedMesh(k.geo, k.mat, 1); m.setMatrixAt(0, new THREE.Matrix4()); m.setColorAt(0, col.setHex(COLORS[TYPES[i].color]));
          const h = TYPES[i].tall; sc.add(m); cm.position.set(2.2, 1.6 + h * 0.8, 3.0).multiplyScalar(0.8 + h * 0.35); cm.lookAt(0, h * 0.45, 0);
          r.render(sc, cm); thumbs[i] = r.domElement.toDataURL("image/png"); sc.remove(m); m.dispose();
          if (i % 6 === 5) await new Promise((res) => setTimeout(res, 0));
        }
      } catch { /* no thumbnails, names still show */ }
      if (r) { r.dispose(); r.forceContextLoss(); }
      thumbsDone = true;
    })();
    return thumbsBusy;
  }
  function paintVisit() {
    if (!visitInfo) return;
    $("wi-visitbar").hidden = false;
    $("wi-v-name").textContent = T("{name}'s island", { name: visitInfo.name });
    $("wi-v-sub").textContent = visitInfo.wallet.slice(0, 6) + "…" + visitInfo.wallet.slice(-4);
    $("wi-likes").textContent = String(visitInfo.likes || 0);
    $("wi-stamps").innerHTML = STAMPS.map((s, i) => `<button type="button" data-st="${i}">${esc(T(s))}</button>`).join("");
    $("wi-stamp-log").innerHTML = (visitInfo.stamps || []).slice(-4).reverse().map((s) => `<li><b>${esc(T(STAMPS[s.k] || ""))}</b> <small>${esc(String(s.w || ""))}</small></li>`).join("");
  }
  function setBuild(on) {
    if (on && readOnly) return;
    building = on; ghostRoot.visible = false; aim = null;
    if (on) { setGhost(); if (!thumbsDone) renderThumbs().then(paintBuild); }
    document.body.classList.toggle("wi-building", on);
    topMat && topMat.color.set(on ? 0x6cbd6f : 0x5fae62);
    gridTex.needsUpdate = true; paintBuild();
    if (on) toast(ctx.coarse ? T("Build mode: tap to place, drag to look") : T("Build mode: click to place, right-click to remove, R to rotate"));
  }
  function openSheet(id) { closeSheets(); $(id).hidden = false; ctx.freeze(true); }
  function closeSheets() { ["wi-pal", "wi-bp", "wi-isles"].forEach((id) => { const e = $(id); if (e && !e.hidden) { e.hidden = true; ctx.freeze(false); } }); }
  function openPalette() { paintPal(); openSheet("wi-pal"); if (!thumbsDone) renderThumbs().then(() => { if (!$("wi-pal").hidden) paintPal(); }); }
  function openBlueprints() {
    $("wi-bplist").innerHTML = Object.keys(BP).map((id) => { const list = bpList(id), ok = list.every((b) => unlocked(TYPES[b.t])); return `<button type="button" data-bp="${id}" class="${ok ? "" : "locked"}"><b>${esc(T(BP_NAMES[id]))}</b><small>${esc(T("{n} bricks", { n: list.length }))}${ok ? "" : " · " + esc(T("needs bricks you haven't unlocked"))}</small></button>`; }).join("");
    openSheet("wi-bp");
  }
  let isleTab = "top", isleData = null;
  async function openIsles() {
    openSheet("wi-isles"); $("wi-isle-list").innerHTML = `<li class="wi-empty">${esc(T("Loading islands…"))}</li>`;
    try { const r = await fetch("/api/social?world=islands"); isleData = r.ok ? await r.json() : null; } catch { isleData = null; }
    paintIsles();
  }
  function paintIsles() {
    ui.querySelectorAll("#wi-isle-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === isleTab)));
    const list = (isleData && isleData[isleTab]) || [];
    $("wi-isle-list").innerHTML = list.length ? list.map((x) => `<li><button type="button" data-wal="${esc(x.wallet)}"><b>${esc(x.name || x.wallet.slice(0, 6) + "…" + x.wallet.slice(-4))}</b><small>${esc(T("{n} bricks", { n: x.n || 0 }))} · ♥ ${x.likes || 0}</small></button></li>`).join("") : `<li class="wi-empty">${esc(isleData && isleData.enabled === false ? T("Island visits open once cloud saving is switched on.") : T("No islands here yet. Build yours and sign in to share it."))}</li>`;
  }

  // ---------------- input ----------------
  ui.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.x != null) { closeSheets(); return; }
    if (b.id === "wi-build-btn") { setBuild(!building); return; }
    if (b.id === "wi-bp-btn") { openBlueprints(); return; }
    if (b.id === "wi-replay-btn") { replay(); return; }
    if (b.id === "wi-isles-btn") { openIsles(); return; }
    if (b.dataset.tool) { setTool(b.dataset.tool); return; }
    if (b.id === "wi-rot") { rot = (rot + 1) % 4; paintGhost(); return; }
    if (b.id === "wi-mirror") { mirror = !mirror; paintBuild(); toast(mirror ? T("Mirror on: builds on both halves") : T("Mirror off")); return; }
    if (b.id === "wi-layer") { layer = layer >= 0 ? -1 : Math.max(0, Math.floor(ctx.feet())); paintBuild(); return; }
    if (b.id === "wi-undo") { doUndo(); return; }
    if (b.id === "wi-redo") { doRedo(); return; }
    if (b.id === "wi-done") { setBuild(false); return; }
    if (b.id === "wi-pal-btn") { openPalette(); return; }
    if (b.dataset.slot != null) { slot = +b.dataset.slot; color = -1; setTool("place"); paintBuild(); return; }
    if (b.dataset.cat != null) { palCat = +b.dataset.cat; paintPal(); return; }
    if (b.dataset.k != null) { const t = TYPES[+b.dataset.k]; if (!unlocked(t)) { toast(T("Locked: {why}", { why: lockText(t) })); return; } const at = hot.indexOf(t.id); if (at >= 0) slot = at; else { hot[slot] = t.id; saveHot(); } color = -1; setTool("place"); paintPal(); paintBuild(); return; }
    if (b.dataset.col != null) { color = +b.dataset.col; paintPal(); paintBuild(); return; }
    if (b.dataset.bp) { closeSheets(); startBlueprint(bpList(b.dataset.bp), T(BP_NAMES[b.dataset.bp])); return; }
    if (b.id === "wi-copy") { const code = toCode(bricks); if (!code) { toast(T("Build something first")); return; } try { await navigator.clipboard.writeText(code); toast(T("Code copied. Anyone can paste it into Blueprints.")); } catch { $("wi-code-in").value = code; toast(T("Here's your code: copy it from the box")); } return; }
    if (b.id === "wi-paste") { closeSheets(); startBlueprint(fromCode($("wi-code-in").value), T("Your blueprint")); return; }
    if (b.id === "wi-go-mine") { closeSheets(); ctx.goIsland({}); return; }
    if (b.dataset.tab) { isleTab = b.dataset.tab; paintIsles(); return; }
    if (b.dataset.wal) { closeSheets(); ctx.goIsland({ visit: b.dataset.wal }); return; }
    if (b.id === "wi-like") { like(); return; }
    if (b.dataset.st != null) { stamp(+b.dataset.st); return; }
  });
  $("wi-visit-form").addEventListener("submit", (e) => { e.preventDefault(); const w = $("wi-visit-in").value.trim().toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(w)) { toast(T("That isn't a wallet address")); return; } closeSheets(); ctx.goIsland({ visit: w }); });
  ui.querySelectorAll(".wi-sheet").forEach((s) => s.addEventListener("click", (e) => { if (e.target === s) closeSheets(); }));
  function keyDown(e) {
    if (!active) return false;
    const k = e.key.toLowerCase();
    if (k === "escape" && ui.querySelector(".wi-sheet:not([hidden])")) { closeSheets(); return true; }
    if (readOnly || lapse) return false;
    if (k === "b") { setBuild(!building); return true; }
    if (!building) return false;
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return true; }
    if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); doRedo(); return true; }
    if (/^[1-9]$/.test(k)) { slot = +k - 1; color = -1; setTool("place"); paintBuild(); return true; }
    if (k === "r") { rot = (rot + 1) % 4; paintGhost(); return true; }
    if (k === "x") { setTool(tool === "remove" ? "place" : "remove"); return true; }
    if (k === "c") { setTool(tool === "paint" ? "place" : "paint"); return true; }
    if (k === "v") { setTool(tool === "pick" ? "place" : "pick"); return true; }
    if (k === "g") { mirror = !mirror; paintBuild(); return true; }
    if (k === "l") { layer = layer >= 0 ? -1 : Math.max(0, Math.floor(ctx.feet())); paintBuild(); return true; }
    if (k === "[" && layer >= 0) { layer = Math.max(0, layer - 1); paintBuild(); return true; }
    if (k === "]" && layer >= 0) { layer = Math.min(HMAX - 1, layer + 1); paintBuild(); return true; }
    if (k === "tab") { e.preventDefault(); if ($("wi-pal").hidden) openPalette(); else closeSheets(); return true; }
    return false;
  }
  function tap(e) {
    if (!active || !building) return false;
    aim = pick(e.clientX, e.clientY); if (!aim) return true;
    if (pending) { placeBlueprint(); return true; }
    act(e.button === 2);
    return true;
  }

  // ---------------- static builds for Coin City lots ----------------
  function makeStatic(data) {
    const g = new THREE.Group(), list = decode(data, LOT_N); if (!list.length) return null;
    const s = brickSet(g, LOT_N); s.sync(list); g.userData.h = Math.max(...list.map((b) => b.y + TYPES[b.t].tall));
    return g;
  }

  return {
    TYPES, enter, leave, floorAt, blocked, keyDown, tap, hover, makeStatic, stats,
    active: () => active, building: () => building, readOnly: () => readOnly, kind: () => kind,
    title: () => (readOnly && visitInfo ? T("{name}'s island", { name: visitInfo.name }) : kind === "lot" ? "$" + lotCoin.symbol : T("My Island")),
    near(consider) { consider(exit, "isle-exit", {}, 2.6); residents.forEach((r) => consider(r.g, "resident", { res: r }, 1.8)); },
    talk(r) { const lines = ctx.lines(); if (r.bub) r.g.remove(r.bub); r.bub = K.bubble(lines.length ? lines[Math.floor(Math.random() * lines.length)] : T("Hi! Nice island."), "#7ee0a0"); r.bub.position.y = 3.1; r.bub.scale.multiplyScalar(0.8); r.g.add(r.bub); r.ch.play("emote-yes", { once: true }); ctx.labelsDirty(); setTimeout(() => { if (r.bub) { r.g.remove(r.bub); r.bub = null; ctx.labelsDirty(); } }, 5000); },
    mini(put) { put(exit, "#35d8d0", 6); residents.forEach((r) => put(r.g, "#7ee0a0", 4)); },
    tick(dt, t) { if (!active) return; tickAnims(); tickLapse(); tickResidents(dt, t); if (land.userData.clouds) land.userData.clouds.userData.update(dt); },
    openIsles, closeSheets, save: cloudSave, debug: () => ({ bricks: bricks.length, kinds: new Set(bricks.map((b) => b.t)).size, residents: residents.length, building, tool, slot, undo: undo.length, layer, mirror }),
    _place: (x, y, z, id, r = 0, c) => { const t = TI[id]; apply({ add: [{ x, y, z, t, r, c: c ?? TYPES[t].color }] }); }, _blueprint: (id, x, y, z) => { pending = { list: bpList(id), name: id }; aim = { place: [x, y, z] }; return placeBlueprint(); },
  };
}
