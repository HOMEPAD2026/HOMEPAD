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
import { createShowcase } from "./world-showcase.js";

export const ISLAND_N = 36, LOT_N = 9, HMAX = 24, MAX_BRICKS = 12000;
export const COLORS = [
  0xf4f1ea, 0xc9ced6, 0x7d8794, 0x2e3440, 0x161a20, 0xe5484d, 0xf2803a, 0xffc861, 0xb6e05a, 0x4caf6a,
  0x2a7a52, 0x35d8d0, 0x4fa8ff, 0x2f86ff, 0x23408e, 0x9b6cff, 0xff7ad9, 0x8a5a36, 0xc89a6a, 0xe9d3a8,
  0x2ee07a, 0x6fd1ff, 0xff4d6d, 0x5b3a8a,
];
const CAT = ["Bricks", "Walls and roofs", "Windows and doors", "Nature", "Lights and decor", "Special", "Neon City", "Ocean", "Space Station", "Materials", "Roofs", "Furniture", "Lights", "Decor"];

export function createIsland(ctx) {
  let HM = HMAX; // 32 on a 64×64 island
  const { THREE, K, st, planet, esc, toast, post, sess, Snd, P, VER } = ctx;
  // single words stay out of the site-wide dictionary (they'd change other pages): a small map just for the island
  const LW = {
    ko: { Guestbook: "방명록", Friends: "친구", Friend: "친구", Show: "보이기", Hide: "숨기기", Arch: "아치", Bench: "벤치", Blueprints: "설계도", Brick: "브릭", Bricks: "브릭", Bush: "덤불", Chimney: "굴뚝", Colour: "색상", Cottage: "오두막", Crystal: "크리스탈", Dome: "돔", Door: "문", Fence: "울타리", Flag: "깃발", Flowers: "꽃", Fountain: "분수", Garden: "정원", Islands: "섬 둘러보기", Mirror: "대칭", Nature: "자연", Paint: "칠하기", Pick: "스포이드", Pillar: "기둥", Pine: "소나무", Planter: "화분", Plate: "플레이트", Popular: "인기", Redo: "다시", Rock: "바위", Rocket: "로켓", Roof: "지붕", Rotate: "회전", Slope: "경사", Special: "특별", Table: "테이블", "Time-lapse": "타임랩스", Tree: "나무", Visit: "방문", Wall: "벽", Water: "물", Window: "창문", Wow: "와우", Build: "건설", Place: "놓기", Remove: "지우기", Undo: "되돌리기", Layer: "층", Tools: "도구", Close: "닫기", Done: "완료", Antenna: "안테나", Coral: "산호", Sand: "모래", Lighthouse: "등대", Porthole: "둥근 창(우주)", Ocean: "바다", Materials: "재질", Roofs: "지붕", Furniture: "가구", Lights: "조명", Decor: "장식", "Gable roof": "맞배지붕", "Hip roof": "모임지붕", "Cone roof": "원뿔 지붕", "Flat cap": "평지붕", Awning: "차양", "Roof tiles": "기와 지붕", Bed: "침대", Sofa: "소파", "Dining table": "식탁", Chair: "의자", Bookcase: "책장", TV: "TV", Rug: "러그", "Floor lamp": "스탠드", "Potted plant": "화분 식물", Wardrobe: "옷장", "Picture frame": "액자", "Kitchen counter": "주방 조리대", "Hanging lantern": "매달린 등", "String lights": "전구 줄", Torch: "횃불", "Floor light": "바닥 조명", "Ceiling light": "천장 조명", "Picket fence": "말뚝 울타리", Signpost: "이정표", Banner: "배너", Flagpole: "깃대", Mailbox: "우체통", "Small fountain": "작은 분수", "Park bench": "공원 벤치", "Lamp post": "가로등 기둥" },
    zh: { Guestbook: "留言簿", Friends: "好友", Friend: "好友", Show: "显示", Hide: "隐藏", Arch: "拱门", Bench: "长椅", Blueprints: "蓝图", Brick: "积木", Bricks: "积木", Bush: "灌木", Chimney: "烟囱", Colour: "颜色", Cottage: "小屋", Crystal: "水晶", Dome: "穹顶", Door: "门", Fence: "栅栏", Flag: "旗帜", Flowers: "花", Fountain: "喷泉", Garden: "花园", Islands: "岛屿", Mirror: "镜像", Nature: "自然", Paint: "上色", Pick: "取样", Pillar: "柱子", Pine: "松树", Planter: "花盆", Plate: "薄板", Popular: "热门", Redo: "重做", Rock: "岩石", Rocket: "火箭", Roof: "屋顶", Rotate: "旋转", Slope: "斜坡", Special: "特殊", Table: "桌子", "Time-lapse": "延时回放", Tree: "树", Visit: "拜访", Wall: "墙", Water: "水", Window: "窗户", Wow: "哇", Build: "建造", Place: "放置", Remove: "移除", Undo: "撤销", Layer: "楼层", Tools: "工具", Close: "关闭", Done: "完成", Antenna: "天线", Coral: "珊瑚", Sand: "沙地", Lighthouse: "灯塔", Porthole: "舷窗", Ocean: "海洋", Materials: "材质", Roofs: "屋顶", Furniture: "家具", Lights: "灯光", Decor: "装饰", "Gable roof": "人字屋顶", "Hip roof": "四坡屋顶", "Cone roof": "圆锥屋顶", "Flat cap": "平屋顶", Awning: "遮阳篷", "Roof tiles": "瓦片屋顶", Bed: "床", Sofa: "沙发", "Dining table": "餐桌", Chair: "椅子", Bookcase: "书柜", TV: "电视", Rug: "地毯", "Floor lamp": "落地灯", "Potted plant": "盆栽", Wardrobe: "衣柜", "Picture frame": "相框", "Kitchen counter": "厨房台面", "Hanging lantern": "吊灯笼", "String lights": "灯串", Torch: "火把", "Floor light": "地灯", "Ceiling light": "吸顶灯", "Picket fence": "尖桩栅栏", Signpost: "路牌", Banner: "横幅", Flagpole: "旗杆", Mailbox: "邮箱", "Small fountain": "小喷泉", "Park bench": "公园长椅", "Lamp post": "路灯杆" },
    tr: { Guestbook: "Ziyaretçi defteri", Friends: "Arkadaşlar", Friend: "Arkadaş", Show: "Göster", Hide: "Gizle", Arch: "Kemer", Bench: "Bank", Blueprints: "Şablonlar", Brick: "Brick", Bricks: "Brick'ler", Bush: "Çalı", Chimney: "Baca", Colour: "Renk", Cottage: "Kulübe", Crystal: "Kristal", Dome: "Kubbe", Door: "Kapı", Fence: "Çit", Flag: "Bayrak", Flowers: "Çiçekler", Fountain: "Çeşme", Garden: "Bahçe", Islands: "Adalar", Mirror: "Ayna", Nature: "Doğa", Paint: "Boya", Pick: "Seç", Pillar: "Sütun", Pine: "Çam", Planter: "Saksı", Plate: "Plaka", Popular: "Popüler", Redo: "Yinele", Rock: "Kaya", Rocket: "Roket", Roof: "Çatı", Rotate: "Döndür", Slope: "Eğim", Special: "Özel", Table: "Masa", "Time-lapse": "Time-lapse", Tree: "Ağaç", Visit: "Ziyaret et", Wall: "Duvar", Water: "Su", Window: "Pencere", Wow: "Vay", Build: "İnşa", Place: "Yerleştir", Remove: "Kaldır", Undo: "Geri al", Layer: "Kat", Tools: "Araçlar", Close: "Kapat", Done: "Tamam", Antenna: "Anten", Coral: "Mercan", Sand: "Kum", Lighthouse: "Deniz feneri", Porthole: "Lumbuz", Ocean: "Okyanus", Materials: "Malzemeler", Roofs: "Çatılar", Furniture: "Mobilya", Lights: "Işıklar", Decor: "Dekor", "Gable roof": "Beşik çatı", "Hip roof": "Kırma çatı", "Cone roof": "Konik çatı", "Flat cap": "Düz çatı", Awning: "Tente", "Roof tiles": "Kiremit çatı", Bed: "Yatak", Sofa: "Kanepe", "Dining table": "Yemek masası", Chair: "Sandalye", Bookcase: "Kitaplık", TV: "TV", Rug: "Halı", "Floor lamp": "Lambader", "Potted plant": "Saksı bitkisi", Wardrobe: "Gardırop", "Picture frame": "Resim çerçevesi", "Kitchen counter": "Mutfak tezgâhı", "Hanging lantern": "Asma fener", "String lights": "Işık zinciri", Torch: "Meşale", "Floor light": "Yer lambası", "Ceiling light": "Tavan lambası", "Picket fence": "Tahta çit", Signpost: "Yön tabelası", Banner: "Pankart", Flagpole: "Bayrak direği", Mailbox: "Posta kutusu", "Small fountain": "Küçük çeşme", "Park bench": "Park bankı", "Lamp post": "Sokak lambası direği" },
  }[ctx.lang] || {};
  const T = (s, v) => (LW[s] != null ? LW[s] : ctx.T(s, v));
  const $ = (id) => document.getElementById(id);
  const V3 = THREE.Vector3;

  // ---------------- materials: painted parts take the brick's colour, fixed parts keep their own ----------------
  const fixedPatch = (m) => { m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace("#include <color_vertex>", "#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n vColor = vec4( 1.0 ); // r186: vColor is a vec4\n#endif"); }; m.customProgramCacheKey = () => "fixed"; return m; };
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
  Object.assign(M, ctx.STYLE.brickMats(THREE, fixedPatch)); // the material bricks (ARCL Shop)

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

  // the 12 edges of a cell cube as thin bars (which: a subset; 0-3 the bottom ring, 4-7 the top ring, 8-11 the posts)
  const edges = (t, which = null) => { const a = 0.49, out = [];
    [[0, 0, -a], [0, 0, a], [-a, 0, 0], [a, 0, 0]].forEach(([x, , z], i) => { const w = x ? t : 0.98 + t, d = z ? t : 0.98 + t; out[i] = box(w, t, d, x, t / 2, z); out[i + 4] = box(w, t, d, x, 0.98 - t / 2, z); });
    [[-a, -a], [a, -a], [-a, a], [a, a]].forEach(([x, z], i) => { out[8 + i] = box(t, 0.98, t, x, 0.49, z); });
    return which ? which.map((i) => out[i]) : out; };

  // furniture comes from the GLB packs (preloaded when the build bar opens): a model's meshes merged into one geometry fitted to a cell, in a fixed (untinted) material; a plain stand-in until the pack is in
  const FP = ["kk-furniture", "kenney-furniture"], furnPacks = {}, fixedMats = new Map();
  const fixedMat = (m) => { let c = fixedMats.get(m.uuid); if (!c) fixedMats.set(m.uuid, (c = fixedPatch(m.clone()))); return c; };
  function modelParts(pack, name, maxH) {
    const src = furnPacks[pack] && furnPacks[pack].models.get(name); if (!src) return null;
    const bx = new THREE.Box3().setFromObject(src), sz = bx.getSize(new V3()), c = bx.getCenter(new V3()), k = Math.min(0.92 / Math.max(0.01, sz.x, sz.z), maxH / Math.max(0.01, sz.y));
    const base = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -bx.min.y, -c.z)), by = new Map();
    src.traverse((o) => { if (!o.isMesh) return; const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!by.has(m)) by.set(m, []); by.get(m).push(o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(base, o.matrixWorld))); });
    return [...by].map(([m, gs]) => [fixedMat(m), gs]);
  }
  const furn = (pack, name, maxH, fb) => () => modelParts(pack, name, maxH) || fb();
  const seg = (ax, ay, bx, by, t = 0.015, z = 0) => { const g = box(Math.hypot(bx - ax, by - ay), t, t, 0, 0, 0); g.rotateZ(Math.atan2(by - ay, bx - ax)); g.translate((ax + bx) / 2, (ay + by) / 2, z); return g; };
  // a roof slope stepped like four rows of tiles
  const sawtooth = () => { const P = (t) => [-0.55 + 1.04 * t, 0.06 + 0.92 * t], pts = [[-0.55, 0], [0.49, 0], P(1)]; for (let k = 4; k >= 1; k--) { const B = P((k - 1) / 4); pts.push(B); if (k > 1) pts.push([B[0], B[1] - 0.07]); } return pts; };

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
    // brick packs from the ARCL Shop (pack: the item that unlocks them)
    { id: "neonpanel", name: "Neon panel", cat: 6, top: 1, pack: "pack-neon", color: 15, parts: () => [["dark", [RB(0.98, 0.98, 0.22, 0.03, 0.49, -0.38)]], ["neon", [box(0.8, 0.06, 0.03, 0, 0.2, -0.26), box(0.8, 0.06, 0.03, 0, 0.78, -0.26), box(0.06, 0.6, 0.03, -0.37, 0.49, -0.26), box(0.06, 0.6, 0.03, 0.37, 0.49, -0.26)]]] },
    { id: "holo", name: "Holo screen", cat: 6, top: 0, solid: false, pack: "pack-neon", color: 11, parts: () => [["dark", [box(0.08, 0.7, 0.08, 0, 0.35, -0.3)]], ["glass", [plane(0.86, 0.5, 0, 0.95, -0.3)]], ["neon", [box(0.9, 0.04, 0.04, 0, 0.68, -0.3), box(0.9, 0.04, 0.04, 0, 1.22, -0.3)]]] },
    { id: "neonsign", name: "Neon sign", cat: 6, top: 0, solid: false, pack: "pack-neon", color: 16, parts: () => [["dark", [RB(0.9, 0.5, 0.06, 0.03, 0.6, -0.42)]], ["neon", [torus(0.14, 0.035, -0.2, 0.6, -0.37), torus(0.14, 0.035, 0.2, 0.6, -0.37)]]] },
    { id: "lightpillar", name: "Light pillar", cat: 6, top: 2, tall: 2, pack: "pack-neon", color: 11, parts: () => [["dark", [cyl(0.32, 0.36, 0.2, 12), cyl(0.32, 0.32, 0.12, 12, 0, 1.92)]], ["neon", [cyl(0.2, 0.2, 1.7, 12, 0, 1.05)]]] },
    { id: "sand", name: "Sand", cat: 7, top: 0.2, pack: "pack-ocean", color: 19, parts: () => [["paint", [RB(0.98, 0.2, 0.98, 0.05)]]] },
    { id: "coral", name: "Coral", cat: 7, top: 0, solid: false, pack: "pack-ocean", color: 16, parts: () => { const c = (r, h, x, z, rz) => { const g = new THREE.ConeGeometry(r, h, 6); g.rotateZ(rz); g.translate(x, h / 2, z); return g; }; return [["paint", [c(0.1, 0.7, 0, 0, 0), c(0.08, 0.5, 0.15, 0.1, -0.4), c(0.08, 0.55, -0.16, -0.05, 0.4), ico(0.1, 0, 0.72, 0, 0)]]]; } },
    { id: "palm", name: "Palm tree", cat: 7, top: 2, tall: 2, pack: "pack-ocean", color: 9, parts: () => { const t = cyl(0.09, 0.14, 1.7, 7); t.rotateZ(0.12); const leaf = (a) => { const g = new THREE.ConeGeometry(0.16, 0.9, 4); g.rotateZ(Math.PI / 2 + 0.5); g.rotateY(a); g.translate(Math.cos(a) * 0.35 + 0.1, 1.72, -Math.sin(a) * 0.35); return g; }; return [["wood", [t]], ["paint", [0, 1.26, 2.5, 3.77, 5.03].map(leaf)]]; } },
    { id: "lighthouse", name: "Lighthouse", cat: 7, top: 2, tall: 2, pack: "pack-ocean", color: 5, parts: () => [["white", [cyl(0.3, 0.4, 0.5, 14, 0, 0.25), cyl(0.26, 0.3, 0.5, 14, 0, 1.05)]], ["paint", [cyl(0.3, 0.3, 0.3, 14, 0, 0.65), cyl(0.27, 0.27, 0.12, 14, 0, 1.36)]], ["warm", [cyl(0.18, 0.18, 0.3, 10, 0, 1.57)]], ["dark", [new THREE.ConeGeometry(0.28, 0.3, 10).translate(0, 1.87, 0)]]] },
    { id: "hull", name: "Hull plate", cat: 8, top: 1, pack: "pack-space", color: 1, parts: () => [["paint", [RB(0.98, 0.98, 0.98, 0.04)]], ["dark", [box(0.99, 0.05, 0.99, 0, 0.33, 0), box(0.99, 0.05, 0.99, 0, 0.66, 0)]]] },
    { id: "porthole", name: "Porthole", cat: 8, top: 1, pack: "pack-space", color: 2, parts: () => [["paint", [frame(circHole(0.3, 0.5))]], ["dark", [torus(0.31, 0.05, 0, 0.5, -0.27)]], ["glass", [(() => { const g = new THREE.CircleGeometry(0.3, 20); g.translate(0, 0.5, -0.38); return g; })()]]] },
    { id: "antenna", name: "Antenna", cat: 8, top: 0, solid: false, tall: 2, pack: "pack-space", color: 3, parts: () => [["paint", [cyl(0.22, 0.26, 0.16, 10)]], ["dark", [cyl(0.03, 0.05, 1.6, 6, 0, 0.95)]], ["arcG", [ico(0.09, 0, 1.8, 0, 1)]]] },
    { id: "satdish", name: "Satellite dish", cat: 8, top: 0.3, pack: "pack-space", color: 0, parts: () => { const d = new THREE.SphereGeometry(0.45, 16, 8, 0, Math.PI * 2, 0, 1.05); d.rotateX(-0.8); d.translate(0, 0.72, 0.05); return [["dark", [cyl(0.25, 0.3, 0.3, 10), cyl(0.05, 0.05, 0.45, 6, 0, 0.5)]], ["paint", [d]], ["arcB", [ico(0.06, 0, 0.82, 0.32, 0)]]]; } },
    // material bricks from the ARCL Shop: one each, a cube in its own material
    { id: "mgrass", name: "Grass brick", cat: 9, top: 1, pack: "brick-grass", color: 9, parts: () => [["mDirt", [RB(0.98, 0.76, 0.98, 0.04)]], ["mGrass", [RB(1.0, 0.26, 1.0, 0.05, 0.85), ...[[-0.3, 0.2], [0.25, -0.25], [0.1, 0.32], [-0.2, -0.3]].map(([x, z]) => { const g = new THREE.ConeGeometry(0.05, 0.22, 4); g.translate(x, 1.07, z); return g; })]]] },
    { id: "mstone", name: "Stone brick", cat: 9, top: 1, pack: "brick-stone", color: 1, parts: () => [["mStone", [RB(0.98, 0.98, 0.98, 0.06)]]] },
    { id: "mwood", name: "Wood brick", cat: 9, top: 1, pack: "brick-wood", color: 17, parts: () => [["mWood", [RB(0.98, 0.98, 0.98, 0.04)]]] },
    { id: "mmetal", name: "Metal brick", cat: 9, top: 1, pack: "brick-metal", color: 1, parts: () => [["mMetal", [RB(0.98, 0.98, 0.98, 0.05)]], ["mGlowB", edges(0.035, [4, 5, 6, 7])]] },
    { id: "mglass", name: "Glass brick", cat: 9, top: 1, pack: "brick-glass", color: 21, parts: () => [["mGlass", [RB(0.94, 0.94, 0.94, 0.03, 0.49)]], ["mFrame", edges(0.05)]] },
    { id: "mneon", name: "Neon brick", cat: 9, top: 1, pack: "brick-neon", color: 15, parts: () => [["mNeonBody", [RB(0.94, 0.94, 0.94, 0.04, 0.49)]], ["mNeonEdge", edges(0.05)]] },
    { id: "mcrystal", name: "Crystal brick", cat: 9, top: 1, pack: "brick-crystal", color: 15, parts: () => [["mCrystal", [RB(0.96, 0.96, 0.96, 0.16, 0.49)]], ["mCrystalCore", [(() => { const g = new THREE.OctahedronGeometry(0.24, 0); g.scale(1, 1.4, 1); g.translate(0, 0.49, 0); return g; })()]]] },
    { id: "mgold", name: "Gold block", cat: 9, top: 1, pack: "brick-gold", color: 7, parts: () => [["mGoldB", [RB(0.98, 0.98, 0.98, 0.05)]]] },
    { id: "mcyber", name: "Cyber brick", cat: 9, top: 1, pack: "brick-cyber", color: 3, parts: () => [["mCyber", [RB(0.98, 0.98, 0.98, 0.05)]], ["mGlowB", edges(0.03, [0, 1, 2, 3])]] },
    { id: "marcadia", name: "Arcadia brick", cat: 9, top: 1, pack: "brick-arcadia", color: 0, parts: () => [["mMarble", [RB(0.96, 0.96, 0.96, 0.04, 0.48)]], ["mGoldTrim", edges(0.06)], ["leaf", [ico(0.12, -0.44, 0.9, 0.44, 0), ico(0.1, -0.47, 0.7, 0.47, 0), ico(0.11, -0.4, 0.5, 0.49, 0), ico(0.1, 0.44, 0.95, -0.46, 0)]]] },
    // appended: roofs, furniture (GLB packs), lights (emissive; they feed the indoor point lights), decor
    { id: "r_gable", name: "Gable roof", cat: 10, top: 0.6, color: 5, parts: () => [["paint", [prism([[-0.56, 0], [0.56, 0], [0, 0.64]], 1.0)]]] },
    { id: "r_hip", name: "Hip roof", cat: 10, top: 0.6, color: 5, parts: () => { const g = new THREE.ConeGeometry(0.72, 0.62, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.31, 0); return [["paint", [g]]]; } },
    { id: "r_cone", name: "Cone roof", cat: 10, top: 0.6, color: 13, parts: () => { const g = new THREE.ConeGeometry(0.62, 0.9, 14); g.translate(0, 0.51, 0); return [["paint", [g, cyl(0.64, 0.64, 0.06, 14)]]]; } },
    { id: "r_cap", name: "Flat cap", cat: 10, top: 0.24, color: 2, parts: () => [["paint", [RB(1.02, 0.14, 1.02, 0.03, 0.07), RB(0.84, 0.1, 0.84, 0.03, 0.19)]]] },
    { id: "r_awning", name: "Awning", cat: 10, top: 0, solid: false, color: 5, parts: () => { const a = box(0.98, 0.06, 0.64, 0, 0, 0); a.rotateX(0.4); a.translate(0, 0.86, 0.18); return [["paint", [a]], ["white", [box(0.98, 0.12, 0.04, 0, 0.66, 0.49)]]]; } },
    { id: "r_tiles", name: "Roof tiles", cat: 10, top: 0.55, color: 17, parts: () => [["paint", [prism(sawtooth())]]] },
    { id: "f_bed", name: "Bed", cat: 11, top: 0, solid: false, color: 12, parts: furn("kk-furniture", "bed_double_A", 0.96, () => [["wood", [RB(0.9, 0.2, 0.96, 0.03, 0.1)]], ["white", [RB(0.84, 0.14, 0.7, 0.04, 0.27, 0.1), RB(0.6, 0.1, 0.2, 0.04, 0.4, -0.32)]]]) },
    { id: "f_sofa", name: "Sofa", cat: 11, top: 0, solid: false, color: 13, parts: furn("kk-furniture", "couch_pillows", 0.96, () => [["dark", [RB(0.94, 0.3, 0.6, 0.05, 0.15, 0.12)]], ["pink", [RB(0.94, 0.56, 0.2, 0.05, 0.4, -0.34)]]]) },
    { id: "f_table", name: "Dining table", cat: 11, top: 0, solid: false, color: 18, parts: furn("kk-furniture", "table_medium", 0.96, () => [["wood", [RB(0.92, 0.07, 0.92, 0.02, 0.62), box(0.08, 0.6, 0.08, -0.38, 0.3, -0.38), box(0.08, 0.6, 0.08, 0.38, 0.3, -0.38), box(0.08, 0.6, 0.08, -0.38, 0.3, 0.38), box(0.08, 0.6, 0.08, 0.38, 0.3, 0.38)]]]) },
    { id: "f_chair", name: "Chair", cat: 11, top: 0, solid: false, color: 17, parts: furn("kk-furniture", "chair_A", 0.96, () => [["wood", [box(0.5, 0.06, 0.5, 0, 0.4, 0), box(0.5, 0.5, 0.06, 0, 0.7, -0.22), box(0.06, 0.4, 0.06, -0.2, 0.2, 0.2), box(0.06, 0.4, 0.06, 0.2, 0.2, 0.2)]]]) },
    { id: "f_bookcase", name: "Bookcase", cat: 11, top: 0, solid: false, tall: 2, color: 17, parts: furn("kenney-furniture", "bookcaseOpen", 1.9, () => [["wood", [RB(0.8, 1.7, 0.36, 0.03, 0.85, -0.28)]], ["pink", [box(0.6, 0.2, 0.2, 0, 0.5, -0.28), box(0.6, 0.2, 0.2, 0, 1.0, -0.28)]]]) },
    { id: "f_tv", name: "TV", cat: 11, top: 0, solid: false, color: 3, parts: furn("kenney-furniture", "televisionModern", 0.96, () => [["dark", [box(0.84, 0.5, 0.06, 0, 0.55, 0), box(0.3, 0.3, 0.06, 0, 0.15, 0)]], ["glass", [plane(0.76, 0.42, 0, 0.55, 0.04)]]]) },
    { id: "f_rug", name: "Rug", cat: 11, top: 0, solid: false, color: 5, parts: furn("kk-furniture", "rug_rectangle_stripes_A", 0.1, () => [["pink", [RB(0.92, 0.03, 0.92, 0.01)]], ["white", [RB(0.7, 0.035, 0.7, 0.01)]]]) },
    { id: "f_floorlamp", name: "Floor lamp", cat: 11, top: 0, solid: false, tall: 2, color: 7, parts: furn("kk-furniture", "lamp_standing", 1.9, () => [["dark", [cyl(0.2, 0.22, 0.05, 10), cyl(0.025, 0.025, 1.3, 6, 0, 0.7)]], ["warm", [cyl(0.2, 0.28, 0.32, 10, 0, 1.45)]]]) },
    { id: "f_plant", name: "Potted plant", cat: 11, top: 0, solid: false, color: 9, parts: furn("kenney-furniture", "pottedPlant", 0.96, () => [["wood", [cyl(0.2, 0.15, 0.3, 8)]], ["leaf", [ico(0.3, 0, 0.58, 0), ico(0.2, 0.15, 0.8, 0.05)]]]) },
    { id: "f_wardrobe", name: "Wardrobe", cat: 11, top: 0, solid: false, tall: 2, color: 17, parts: furn("kk-furniture", "cabinet_medium_decorated", 1.9, () => [["wood", [RB(0.86, 1.8, 0.5, 0.03, 0.9, -0.2)]], ["dark", [box(0.03, 0.5, 0.03, -0.05, 0.9, 0.07), box(0.03, 0.5, 0.03, 0.05, 0.9, 0.07)]]]) },
    { id: "f_frame", name: "Picture frame", cat: 11, top: 0, solid: false, color: 7, parts: furn("kk-furniture", "pictureframe_standing_A", 0.96, () => [["gold", [box(0.6, 0.5, 0.05, 0, 0.35, 0.05)]], ["glass", [plane(0.5, 0.4, 0, 0.35, 0.08)]]]) },
    { id: "f_counter", name: "Kitchen counter", cat: 11, top: 0, solid: false, color: 1, parts: furn("kk-furniture", "shelf_B_large_decorated", 0.96, () => [["wood", [RB(0.94, 0.7, 0.7, 0.03, 0.35, -0.1)]], ["white", [RB(0.98, 0.07, 0.76, 0.02, 0.74, -0.1)]]]) },
    { id: "l_lantern", name: "Hanging lantern", cat: 12, top: 0, solid: false, color: 3, parts: () => [["dark", [cyl(0.015, 0.015, 0.34, 4, 0, 0.8)]], ["warm", [box(0.2, 0.28, 0.2, 0, 0.5, 0)]], ["paint", [box(0.28, 0.05, 0.28, 0, 0.66, 0), box(0.26, 0.04, 0.26, 0, 0.34, 0)]]] },
    { id: "l_string", name: "String lights", cat: 12, top: 0, solid: false, color: 3, parts: () => { const xs = [-0.49, -0.4, -0.2, 0, 0.2, 0.4, 0.49], y = (x) => 0.95 - 0.14 * (1 - (x / 0.5) ** 2); return [["dark", xs.slice(1).map((x, i) => seg(xs[i], y(xs[i]), x, y(x), 0.015, -0.3))], ["warm", xs.slice(1, -1).map((x) => ico(0.055, x, y(x) - 0.06, -0.3, 0))]]; } },
    { id: "l_torch", name: "Torch", cat: 12, top: 0, solid: false, color: 17, parts: () => { const f = new THREE.ConeGeometry(0.1, 0.28, 6); f.translate(0, 0.9, 0); return [["wood", [cyl(0.04, 0.05, 0.7, 6, 0, 0.35)]], ["paint", [cyl(0.1, 0.06, 0.14, 8, 0, 0.72)]], ["warm", [f]]]; } },
    { id: "l_floor", name: "Floor light", cat: 12, top: 0, solid: false, color: 3, parts: () => [["dark", [cyl(0.3, 0.32, 0.06, 14)]], ["warm", [cyl(0.24, 0.24, 0.04, 14, 0, 0.08)]]] },
    { id: "l_ceiling", name: "Ceiling light", cat: 12, top: 0, solid: false, color: 0, parts: () => [["paint", [cyl(0.3, 0.3, 0.04, 14, 0, 0.96)]], ["warm", [cyl(0.24, 0.26, 0.05, 14, 0, 0.91)]]] },
    { id: "d_fence", name: "Picket fence", cat: 13, top: 0.8, color: 0, parts: () => { const xs = [-0.4, -0.2, 0, 0.2, 0.4], pk = (x) => { const g = new THREE.ConeGeometry(0.07, 0.12, 4); g.rotateY(Math.PI / 4); g.translate(x, 0.82, 0); return g; }; return [["paint", [...xs.map((x) => box(0.1, 0.76, 0.05, x, 0.38, 0)), ...xs.map(pk), box(0.98, 0.07, 0.05, 0, 0.55, -0.05), box(0.98, 0.07, 0.05, 0, 0.22, -0.05)]]]; } },
    { id: "d_sign", name: "Signpost", cat: 13, top: 0, solid: false, color: 17, parts: () => { const a = box(0.6, 0.18, 0.05, 0.05, 0.88, 0.04), b = box(0.55, 0.16, 0.05, -0.05, 0.66, -0.04); a.rotateY(0.15); b.rotateY(-0.2); return [["wood", [cyl(0.05, 0.06, 1.0, 6)]], ["paint", [a, b]]]; } },
    { id: "d_banner", name: "Banner", cat: 13, top: 0, solid: false, tall: 2, color: 5, parts: () => { const d = box(0.4, 0.4, 0.03, 0, 0, 0); d.rotateZ(Math.PI / 4); d.translate(0, 0.7, 0); const rod = cyl(0.03, 0.03, 0.9, 6, 0, 0, 0); rod.rotateZ(Math.PI / 2); rod.translate(0, 1.9, 0); return [["dark", [rod]], ["paint", [box(0.56, 0.9, 0.03, 0, 1.4, 0), d]], ["gold", [ico(0.07, 0, 1.5, 0.03, 0)]]]; } },
    { id: "d_flag", name: "Flagpole", cat: 13, top: 0, solid: false, tall: 2, color: 4, parts: () => [["paint", [cyl(0.2, 0.24, 0.12, 10), box(0.6, 0.36, 0.03, 0.33, 1.68, 0)]], ["white", [cyl(0.03, 0.04, 1.85, 6, 0, 1.0)]], ["gold", [ico(0.06, 0, 1.96, 0, 1)]]] },
    { id: "d_mailbox", name: "Mailbox", cat: 13, top: 0, solid: false, color: 13, parts: () => { const c = new THREE.CylinderGeometry(0.15, 0.15, 0.5, 10); c.rotateX(Math.PI / 2); c.translate(0, 0.82, 0); return [["wood", [cyl(0.04, 0.05, 0.7, 6)]], ["paint", [c, box(0.3, 0.14, 0.5, 0, 0.74, 0)]], ["yellow", [box(0.03, 0.2, 0.08, 0.17, 0.95, 0.1)]]]; } },
    { id: "d_fountain", name: "Small fountain", cat: 13, top: 0.3, color: 1, parts: () => [["white", [cyl(0.46, 0.5, 0.28, 16), cyl(0.07, 0.1, 0.55, 8, 0, 0.5), cyl(0.2, 0.1, 0.1, 12, 0, 0.78)]], ["water", [cyl(0.4, 0.4, 0.03, 16, 0, 0.27), cyl(0.15, 0.15, 0.03, 12, 0, 0.84), ico(0.05, 0, 0.95, 0, 0)]]] },
    { id: "d_bench", name: "Park bench", cat: 13, top: 0, solid: false, color: 17, parts: () => [["paint", [...[0, 1, 2].map((i) => box(0.94, 0.05, 0.1, 0, 0.42, -0.1 + i * 0.11)), ...[0, 1].map((i) => box(0.94, 0.1, 0.04, 0, 0.62 + i * 0.14, -0.22))]], ["dark", [box(0.06, 0.42, 0.4, -0.42, 0.21, 0), box(0.06, 0.42, 0.4, 0.42, 0.21, 0), box(0.06, 0.2, 0.34, -0.42, 0.52, 0), box(0.06, 0.2, 0.34, 0.42, 0.52, 0)]]] },
    { id: "d_lamp", name: "Lamp post", cat: 13, top: 0, solid: false, tall: 2, color: 3, parts: () => [["dark", [cyl(0.14, 0.18, 0.2, 8), cyl(0.04, 0.06, 1.7, 6), box(0.4, 0.04, 0.04, 0.18, 1.78, 0)]], ["warm", [ico(0.13, 0.36, 1.68, 0, 1)]], ["paint", [cyl(0.17, 0.08, 0.08, 8, 0.36, 1.84)]]] },
  ];
  const TI = Object.fromEntries(TYPES.map((t, i) => [t.id, i]));
  const ROOFS = new Set(["roof", "peak", "dome", "r_gable", "r_hip", "r_cone", "r_cap", "r_awning", "r_tiles"]), WINDOWS = new Set(["window", "roundwin", "porthole"]);
  const LIGHTS = new Set(["lamp", "lantern", "neon", "crystal", "neoncube", "l_lantern", "l_string", "l_torch", "l_floor", "l_ceiling", "d_lamp", "f_floorlamp"]);
  // where the glow comes from, up a piece (the indoor point lights go to these)
  const LH = { lamp: 1.8, lantern: 0.3, lightpillar: 1.1, l_lantern: 0.5, l_string: 0.85, l_torch: 1, l_floor: 0.2, l_ceiling: 0.85, d_lamp: 1.7, f_floorlamp: 1.5 };
  TYPES.forEach((t) => { t.lh = LH[t.id]; t.solid = t.solid !== false; t.tall = t.tall || 1; t.name = T(t.name); });
  const REQ = { slayer: "Beat all six scammers", launcher: "Launch a coin on ArcPad", phisher: "Beat The Phisher", holder: "Hold $ARCIRCLE", streak7: "Keep a 7-day streak", collector: "Collect all 12 key cards" };
  const unlocked = (t) => (t.pack ? ctx.owns(t.pack) : t.req ? (t.req === "phisher" ? P.beaten.includes("phisher") : P.badges.includes(t.req)) : ctx.level() >= (t.lv || 1));
  const lockText = (t) => (t.pack ? T("In the ARCL Shop") : t.req ? T(REQ[t.req]) : T("Reach level {n}", { n: t.lv }));

  const geoCache = new Map();
  function kindGeo(i) {
    let k = geoCache.get(i); if (k) return k;
    const parts = TYPES[i].parts();
    const flat = (list) => list.map((g) => { const x = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(x.attributes)) if (!["position", "normal", "uv"].includes(a)) x.deleteAttribute(a); return x; });
    const merged = parts.map(([, list]) => mergeGeometries(flat(list), false));
    const geo = merged.length === 1 ? merged[0] : mergeGeometries(merged, true);
    const mats = parts.map(([m]) => (typeof m === "string" ? M[m] : m));
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
      const n0 = u[1] || N, out = [], sh = N > n0 && n0 !== 64 ? (N - n0) >> 1 : 0;
      for (let i = 2; i + 5 <= u.length && out.length < MAX_BRICKS; i += 5) {
        const [x, y, z, t, rc] = u.subarray(i, i + 5), c = rc >> 2;
        if (x >= n0 || z >= n0 || y >= 32 || !TYPES[t] || c >= COLORS.length) continue;
        out.push({ x: x + sh, y, z: z + sh, t, r: rc & 3, c });
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
  // beside your own island: the aquarium and the boss trophies (world-showcase.js)
  const show = ctx.showcase ? createShowcase({ THREE, K, T, fishList: ctx.showcase.fish, zones: ctx.showcase.zones, fish3d: ctx.showcase.fish3d }) : null;
  if (show) root.add(show.group);
  const ghostRoot = new THREE.Group(); root.add(ghostRoot);
  const fxRoot = new THREE.Group(); root.add(fxRoot);
  const gridTex = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 64); g.strokeStyle = "rgba(0,0,0,.16)"; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  let topMat = null, exit = null;
  function buildLand() {
    land.clear();
    const W = N + 6;
    topMat = new THREE.MeshStandardMaterial({ color: 0x5fae62, roughness: 0.95, map: gridTex.clone() });
    topMat.map.repeat.set(W, W); topMat.map.offset.set(0, 0); topMat.map.needsUpdate = true;
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 1 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(W, 1, W), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
    top.position.y = -0.5; top.receiveShadow = true; land.add(top);
    // blocky cliffs that narrow toward the bottom
    const rock = new THREE.MeshStandardMaterial({ color: 0x7d7368, roughness: 1, flatShading: true }), dirt = new THREE.MeshStandardMaterial({ color: 0x5f4430, roughness: 1 });
    for (let i = 1; i <= 5; i++) { const w = W * (1 - i * 0.15); const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, w), i % 2 ? dirt : rock); m.position.y = -1 - i * 1.3; m.rotation.y = i * 0.12; land.add(m); }
    Object.assign(land.userData, { topMat, sideMat, rock, dirt, styled: null });
    const tip = new THREE.Mesh(new THREE.ConeGeometry(W * 0.12, 5, 5), rock); tip.rotation.x = Math.PI; tip.position.y = -10.5; land.add(tip);
    // a sea of clouds below and a few around
    const sea = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: true, depthWrite: false }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -16; land.add(sea); land.userData.sea = sea;
    const cl = K.makeClouds(14, { spread: 80, y: -32 }); cl.userData.mat.emissiveIntensity = 0.55; cl.userData.mat.flatShading = false; land.add(cl); land.userData.clouds = cl;
    // the way back: a portal at the front edge, facing the island
    exit = K.makePortal(T("Back to the world")); exit.position.set(-N / 2 - 1.2, 0, N / 2 - 1.5); exit.rotation.y = Math.PI / 2; exit.scale.setScalar(0.8); land.add(exit);
  }
  buildLand();

  // ---------------- state ----------------
  let bricks = [], occ = new Map(), cols = new Map();
  let cRect = null; const CS = 6; // the village centre's 6×6 cells ([x0, z0]); nothing is built there
  const key = (x, y, z) => x + "," + y + "," + z, ckey = (x, z) => x + "," + z;
  function index() {
    occ = new Map(); cols = new Map();
    bricks.forEach((b) => addIndex(b));
  }
  function addIndex(b) { for (let k = 0; k < TYPES[b.t].tall; k++) occ.set(key(b.x, b.y + k, b.z), b); const c = ckey(b.x, b.z); let a = cols.get(c); if (!a) cols.set(c, (a = [])); a.push(b); }
  function dropIndex(b) { for (let k = 0; k < TYPES[b.t].tall; k++) occ.delete(key(b.x, b.y + k, b.z)); const a = cols.get(ckey(b.x, b.z)); if (a) a.splice(a.indexOf(b), 1); }
  const free = (x, y, z, tall = 1) => { if (x < 0 || z < 0 || x >= N || z >= N || y < 0 || y + tall > HM) return false; if (cRect && x >= cRect[0] && x < cRect[0] + CS && z >= cRect[1] && z < cRect[1] + CS) return false; for (let k = 0; k < tall; k++) if (occ.has(key(x, y + k, z))) return false; return true; };

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
    if (centre && centre.visible) { const c = centre.position, r = 1.95 * centre.scale.x + 0.25; if (Math.abs(p.x - c.x) < r && Math.abs(p.z - c.z) < r && p.y < centre.userData.h * centre.scale.x) return true; }
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
      if (k >= 0.6 && !a.hit) { a.hit = true; if (anims.length < 40) bump(a.b); } // it lands: a little ring of dust at its foot
      const lift = k < 0.6 ? (1 - k / 0.6) * 0.9 : 0, sq = k < 0.6 ? 1 : 1 - Math.sin((k - 0.6) / 0.4 * Math.PI) * 0.22;
      set.pose(a.b, lift, sq);
    }
  }
  const shardGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  const bumpGeo = new THREE.RingGeometry(0.35, 0.62, 28); bumpGeo.rotateX(-Math.PI / 2);
  function bump(b) {
    const [cx, cz] = set.center(b.x, b.z), m = new THREE.Mesh(bumpGeo, new THREE.MeshBasicMaterial({ color: 0xeef3f7, transparent: true, opacity: 0.55, depthWrite: false }));
    m.position.set(cx, b.y + 0.04, cz); fxRoot.add(m); const t0 = performance.now();
    const step = () => { const k = (performance.now() - t0) / 320; if (k >= 1) { fxRoot.remove(m); m.material.dispose(); return; } m.scale.setScalar(1 + k * 0.9); m.material.opacity = 0.55 * (1 - k); requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
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
  const mirrorRot = (t, r) => (["slope", "roof", "stairs", "door", "window", "roundwin", "wall", "neon", "sign", "bench", "flag", "r_awning", "f_bed", "f_sofa", "f_chair", "f_bookcase", "f_tv", "f_wardrobe", "f_counter", "d_sign", "d_banner", "d_mailbox", "d_bench"].includes(TYPES[t].id) ? (4 - r) % 4 : r);
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
    saveSoon(); paintHud(); keepHidden();
    const doors = bricks.filter((b) => TYPES[b.t].id === "door").length;
    if (doors !== lastDoors) { const more = doors > lastDoors; lastDoors = doors; syncResidents(more); }
    ctx.onStats(stats());
  }
  function stats() {
    const ids = bricks.map((b) => TYPES[b.t].id);
    const nature = ids.filter((i) => ["tree", "pine", "bush", "flowers", "grass", "planter", "water"].includes(i)).length;
    const light = ids.filter((i) => LIGHTS.has(i)).length;
    const beauty = Math.min(999, nature * 2 + light * 2 + new Set(ids).size * 5 + new Set(bricks.map((b) => b.c)).size * 2);
    // roof/door/window/light/furniture counts: the quests read these keys off P.isle
    return { bricks: bricks.length, residents: Math.min(8, ids.filter((i) => i === "door").length), beauty, roof: ids.filter((i) => ROOFS.has(i)).length, door: ids.filter((i) => i === "door").length, window: ids.filter((i) => WINDOWS.has(i)).length, light, furniture: bricks.filter((b) => TYPES[b.t].cat === 11).length };
  }

  // ---------------- furniture packs: loaded once the build bar opens (or an island with furniture comes in) ----------------
  let furnP = null;
  function ensureFurn() {
    if (furnP) return furnP;
    return (furnP = Promise.all(FP.map((n) => K.loadPack(`/models/world/packs/${n}.glb`, VER).then((p) => (furnPacks[n] = p)).catch(() => null))).then(() => {
      if (!FP.some((n) => furnPacks[n])) return;
      const ks = []; TYPES.forEach((t, i) => { if (t.cat !== 11) return; ks.push(i); const k = geoCache.get(i); if (k) { k.geo.dispose(); geoCache.delete(i); } }); // the stand-ins give way to the models
      if (active && bricks.some((b) => TYPES[b.t].cat === 11)) { set.clear(); set.sync(bricks); keepHidden(); }
      if (building) setGhost();
      if (thumbsDone || thumbsBusy) renderThumbs(ks).then(() => { paintBuild(); if (!$("wi-pal").hidden) paintPal(); });
    }));
  }

  // ---------------- indoors: under a roof the pieces overhead hide, the light comes up, the nearest lamps glow ----------------
  // a grid test five times a second (no raycasts); the lights are pooled (2 on phones) and live in the island group, so they only cost anything here
  const hidden = new Set(), IR = 6, GL = 9;
  const amb = new THREE.AmbientLight(0xffffff, 0), pool = Array.from({ length: ctx.coarse ? 2 : 4 }, () => { const l = new THREE.PointLight(0xffc27a, 0, 7, 2); l.userData = { b: null, on: false }; return l; });
  root.add(amb, ...pool);
  let indoor = false, inK = 0, inT = 0;
  const hero = () => local(new V3(-planet.position.x, ctx.feet(), -planet.position.z));
  // a solid roof over the head (one layer is enough), and walls within 3 cells on 3+ sides (a doorway may be open)
  function isIndoors(p) {
    const [cx, cz] = cellOf(p.x, p.z), fy = Math.floor(p.y + 0.05), yh = fy + 2, a = cols.get(ckey(cx, cz)); if (!a) return false;
    let over = 0; for (const b of a) { const t = TYPES[b.t]; if (t.solid && b.y + t.tall > yh) over += b.y + t.tall - Math.max(b.y, yh); }
    if (over < 1) return false; // one layer of roof is enough (it used to need two, so most homes never counted as indoors)
    let walls = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) scan: for (let d = 1; d <= 3; d++) for (let y = fy; y <= fy + 1; y++) { const w = occ.get(key(cx + dx * d, y, cz + dz * d)); if (w && TYPES[w.t].solid) { walls++; break scan; } }
    return walls >= 3;
  }
  // pieces overhead shrink away (and grow back) over ~0.25 s instead of popping; with reduced motion they switch at once
  const fading = new Map(); // brick → its scale now (0 hidden … 1 shown)
  const hide = (b, on) => { if (on) hidden.add(b); else hidden.delete(b); if (ctx.reduce) { fading.delete(b); set.pose(b, 0, on ? 0 : 1); } else if (!fading.has(b)) fading.set(b, on ? 1 : 0); };
  // after a re-sync the hidden ones were drawn again: hide them once more (the deleted ones drop out)
  function keepHidden() { fading.clear(); hidden.forEach((b) => { if (occ.get(key(b.x, b.y, b.z)) === b) set.pose(b, 0, 0); else hidden.delete(b); }); inT = 0; }
  function resetIndoor() { fading.clear(); hidden.clear(); indoor = false; inK = 0; inT = 0; amb.intensity = 0; pool.forEach((l) => { l.intensity = 0; l.userData.b = null; l.userData.on = false; }); }
  function refreshIndoor() {
    const p = hero(), now = !lapse && isIndoors(p), want = new Set(), near = [];
    if (now) {
      const [cx, cz] = cellOf(p.x, p.z), yh = Math.floor(p.y + 0.05) + 2;
      for (let dx = -IR; dx <= IR; dx++) for (let dz = -IR; dz <= IR; dz++) {
        if (dx * dx + dz * dz > IR * IR) continue;
        const a = cols.get(ckey(cx + dx, cz + dz)); if (!a) continue;
        for (const b of a) { if (b.y >= yh && b.i != null) want.add(b); const lh = TYPES[b.t].lh; if (lh != null) near.push([(b.x - cx) ** 2 + (b.z - cz) ** 2 + (b.y + lh - p.y - 1) ** 2, b]); }
      }
    }
    if (lapse) hidden.clear(); // the time-lapse redrew everything
    for (const b of [...hidden]) if (!want.has(b)) hide(b, false);
    for (const b of want) if (!hidden.has(b)) hide(b, true);
    indoor = now;
    near.sort((u, v) => u[0] - v[0]);
    const pick2 = near.slice(0, pool.length).map((x) => x[1]);
    pool.forEach((l) => { if (!pick2.includes(l.userData.b)) { l.userData.b = null; l.userData.on = false; } });
    pick2.forEach((b) => {
      if (pool.some((l) => l.userData.b === b)) return;
      const l = pool.find((x) => !x.userData.b) || pool.find((x) => x.intensity < 0.2); if (!l) return;
      const [cx, cz] = set.center(b.x, b.z); l.position.set(cx, b.y + TYPES[b.t].lh, cz); l.userData.b = b; l.userData.on = true;
    });
  }
  st.on((dt) => {
    if (!active) return;
    if ((inT -= dt) <= 0) { inT = 0.2; refreshIndoor(); }
    const f = Math.min(1, dt * 5); inK += ((indoor ? 1 : 0) - inK) * f;
    amb.intensity = inK * st.hemi.intensity * 0.4; // ~40% more fill than the day/night light gives
    for (const l of pool) l.intensity += ((l.userData.on ? GL : 0) - l.intensity) * f;
    if (fading.size) { const step = dt * 4; for (const [b, k] of fading) { const to = hidden.has(b) ? 0 : 1, n = to > k ? Math.min(1, k + step) : Math.max(0, k - step); if (occ.get(key(b.x, b.y, b.z)) !== b) { fading.delete(b); continue; } set.pose(b, 0, n); if (n === to) fading.delete(b); else fading.set(b, n); } }
  });

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
      if (y < HM + 2) { const b = occ.get(key(x, y, z)); if (b && !hidden.has(b)) { const p = [x - n[0], y - n[1], z - n[2]]; return { place: p, hit: b, normal: n }; } }
      if (tx < ty && tx < tz) { x += sx; tx += tdx; n = [sx, 0, 0]; } else if (ty < tz) { y += sy; ty += tdy; n = [0, sy, 0]; } else { z += sz; tz += tdz; n = [0, 0, sz]; }
      if (y > HM + 30 && sy > 0) return null;
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
    const body = kind === "lot" ? { action: "world-lot-save", ...s, coin: lotCoin.token, data } : { action: "world-island-save", ...s, data, name: P.name || "", n: st2.bricks, res: st2.residents, theme: myTheme };
    try {
      const r = await post(body);
      if (r.ok) { setSave(T("Saved to your wallet")); if (kind === "home") { ctx.onSaved(st2); if (r.j.village && ctx.onVillage) ctx.onVillage(r.j.village); } }
      else if (r.status === 503) setSave(T("Saved in this browser"));
      else if (r.status === 429) { clearTimeout(cloudT); cloudT = setTimeout(cloudSave, 9000); }
      else setSave(r.j.error || T("Couldn't save"));
    } catch { setSave(T("Saved in this browser")); }
  }
  function setSave(t) { saveState = t; const el = $("wi-save"); if (el) el.textContent = t; }
  async function loadOwn(N) {
    let local = null; try { local = JSON.parse(localStorage.getItem(LKEY()) || "null"); } catch { local = null; }
    let list = local && local.d ? decode(local.d, N) : [];
    const me = sess();
    try {
      if (kind === "lot") { const r = await fetch("/api/social?world=lots&coins=" + lotCoin.token); if (r.ok) { const j = await r.json(); const d = j.lots && j.lots[lotCoin.token]; if (d && (!local || (d.at || 0) > (local.at || 0))) list = decode(d.data, N); } }
      else if (me) { const r = await fetch("/api/social?world=island&fresh=1&wallet=" + me.wallet); if (r.ok) { const j = await r.json(); if (j.data && (!local || (j.at || 0) > (local.at || 0))) list = decode(j.data, N); if (j.likes) ctx.onLikes(j.likes); } }
    } catch { /* keep this browser's copy */ }
    return list;
  }

  // ---------------- visiting: likes and stamps ----------------
  const STAMPS = ["Lovely build", "So cozy", "Wow", "Great view", "Neighbours?", "Built different"];
  // the owner's answers to a stamp: a few fixed lines (no free text, so nothing to moderate)
  const REPLIES = ["Thank you!", "Come again", "Glad you like it", "Let's build together", "See you on the plaza", "Neighbours!"];
  let visitInfo = null;
  async function loadVisit(wallet) {
    const r = await fetch("/api/social?world=island&wallet=" + wallet);
    if (!r.ok) throw new Error(T("Couldn't load that island"));
    const j = await r.json();
    if (j.enabled === false) throw new Error(T("Island visits open once cloud saving is switched on."));
    if (!j.data) throw new Error(T("That wallet hasn't built an island yet"));
    visitInfo = { wallet, name: j.name || wallet.slice(0, 6) + "…" + wallet.slice(-4), likes: j.likes || 0, stamps: j.stamps || [], vlevel: (j.village && j.village.level) || 1, vscore: (j.village && j.village.score) || 0 };
    const n0 = unb64(j.data)[1] || ISLAND_N;
    return { list: decode(j.data, n0), N: n0, theme: j.theme || "" };
  }
  let liking = false;
  async function like() {
    const s = sess(); if (!s) { toast(T("Sign in with your wallet to like islands")); return; }
    if (liking) return; liking = true;
    // count it straight away (pop + sound), then settle with the server's number or roll back
    const vi = visitInfo, before = vi.likes || 0, btn = $("wi-like");
    vi.likes = before + 1; paintVisit(); Snd.win(); confetti(new V3(0, 3, N / 2 - 2));
    if (btn) { btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop"); }
    try {
      const r = await post({ action: "world-like", ...s, target: vi.wallet });
      if (r.ok) { vi.likes = r.j.likes ?? vi.likes; if (ctx.onLiked) ctx.onLiked(); }
      else { vi.likes = before; toast(r.j.error || T("Couldn't like it right now")); }
    } catch { vi.likes = before; toast(T("Couldn't like it right now")); }
    liking = false; if (visitInfo === vi) paintVisit();
  }
  async function stamp(k) {
    const s = sess(); if (!s) { toast(T("Sign in with your wallet to leave a stamp")); return; }
    const msg = ($("wi-note") && $("wi-note").value.trim()) || "";
    const r = await post({ action: "world-stamp", ...s, target: visitInfo.wallet, k, ...(msg ? { msg } : {}) });
    if (r.ok) { visitInfo.stamps = r.j.stamps || visitInfo.stamps; if ($("wi-note")) $("wi-note").value = ""; paintVisit(); Snd.pick(); toast(msg ? T("Stamp and note left") : T("Stamp left")); if (r.j.arcl) ctx.onArcl(r.j.arcl); }
    else toast(r.j.error || T("Couldn't leave a stamp right now"));
  }

  // ---------------- friends (saved with your character: P.rpg.x.friends) ----------------
  const FR = () => { const r = P.rpg || (P.rpg = {}); r.x = r.x || {}; if (!Array.isArray(r.x.friends)) r.x.friends = []; return r.x.friends; };
  const isFriend = (w) => FR().some((f) => f.w === w);
  function toggleFriend(w, name) {
    const list = FR(), i = list.findIndex((f) => f.w === w);
    if (i >= 0) { list.splice(i, 1); toast(T("Removed from friends")); }
    else { if (list.length >= 30) { toast(T("Your friends list is full (30)")); return; } list.push({ w, n: String(name || "").slice(0, 16) }); toast(T("Added to friends")); Snd.pick(); }
    ctx.saveP && ctx.saveP(); paintVisit();
  }
  const myLink = () => { const s = sess(); return s ? "https://www.arcircle.app/play?isle=" + s.wallet : ""; };
  // ---------------- the guestbook: notes left on your island, and hiding one ----------------
  let book = null;
  async function openBook() {
    const s = sess(); if (!s) { toast(T("Sign in with your wallet to see your guestbook")); return; }
    openSheet("wi-book"); $("wi-book-list").innerHTML = `<li class="wi-empty">${esc(T("Loading…"))}</li>`;
    try { const r = await fetch("/api/social?world=island&fresh=1&wallet=" + s.wallet); book = r.ok ? ((await r.json()).stamps || []) : []; } catch { book = []; }
    const top = Math.max(0, ...book.map((x) => x.at || 0)); try { localStorage.setItem(BOOK, String(top)); } catch { /* private */ } bookNew = 0; paintBookDot();
    paintBook();
  }
  // what's new since you last looked: friends playing right now, stamps left on your island
  const BOOK = "arc.world.bookSeen", told = new Set();
  let bookNew = 0, lastNew = 0;
  function paintBookDot() { const b = $("wi-book-btn"); if (b) { b.classList.toggle("has-new", bookNew > 0); b.dataset.n = bookNew ? String(bookNew) : ""; } }
  async function news(say) {
    const fr = FR();
    if (fr.length) {
      try {
        const r = await fetch("/api/social?world=friends&wallets=" + fr.map((f) => f.w).join(",")), j = r.ok ? await r.json() : {};
        for (const f of fr) { const x = (j.friends || {})[f.w]; if (x && x.seen && Date.now() - x.seen < 15 * 60e3 && !told.has(f.w)) { told.add(f.w); say(T("{x} is playing now. Visit their island from Islands → Friends.", { x: `<b>${esc(x.name || f.n || f.w.slice(0, 6) + "…" + f.w.slice(-4))}</b>` }), "#7fe0ff"); } }
      } catch { /* next time */ }
    }
    const s = sess(); if (!s) return;
    try {
      const r = await fetch("/api/social?world=island&fresh=1&wallet=" + s.wallet), j = r.ok ? await r.json() : {};
      let seen = 0; try { seen = Number(localStorage.getItem(BOOK) || 0); } catch { /* private */ }
      bookNew = (j.stamps || []).filter((x) => (x.at || 0) > seen).length; paintBookDot();
      if (bookNew && bookNew !== lastNew) { lastNew = bookNew; say(bookNew === 1 ? T("A new stamp on your island. Open the Guestbook to see it.") : T("{n} new stamps on your island. Open the Guestbook to see them.", { n: bookNew }), "#ffc861"); }
    } catch { /* next time */ }
  }
  function paintBook() {
    const list = (book || []).slice().reverse();
    $("wi-book-list").innerHTML = list.length ? list.map((x) => `<li class="${x.h ? "hid" : ""}"><div><b>${esc(T(STAMPS[x.k] || ""))}</b><small>${esc(String(x.w || ""))} · ${esc(new Date(x.at).toLocaleDateString())}</small>${x.h ? `<q class="dim">${esc(T("Note hidden"))}</q>` : x.m ? `<q>${esc(x.m)}</q>` : ""}</div>${x.m || x.h ? `<button type="button" class="wp-btn" data-hide="${x.at}">${esc(x.h ? T("Show") : T("Hide"))}</button>` : ""}<p class="wi-replies"><span>${esc(T("Reply"))}</span>${REPLIES.map((t, i) => `<button type="button" data-reply="${x.at}:${i}" aria-pressed="${x.r === i}">${esc(T(t))}</button>`).join("")}</p></li>`).join("") : `<li class="wi-empty">${esc(T("No stamps yet. Share your island link so friends can visit."))}</li>`;
  }
  async function replyNote(v) {
    const [at, r] = String(v).split(":").map(Number), s = sess(); if (!s) { toast(T("Sign in with your wallet first")); return; }
    const res = await post({ action: "world-stamp-reply", ...s, at, r });
    if (res.ok) { book = res.j.stamps || book; paintBook(); Snd.pick(); toast(T("Reply sent: {x}", { x: T(REPLIES[r]) })); } else toast(res.j.error || T("Couldn't change that right now"));
  }
  async function hideNote(at) {
    const s = sess(); if (!s) return;
    const r = await post({ action: "world-stamp-hide", ...s, at: Number(at) });
    if (r.ok) { book = r.j.stamps || book; paintBook(); } else toast(r.j.error || T("Couldn't change that right now"));
  }

  // ---------------- what the wallet owns (the ARCL Shop): island size, brick packs, sky ----------------
  let ownedItems = [], ownedLots = [], myTheme = P.isleTheme || "";
  const ownedN = () => (ownedItems.includes("isle64") ? 64 : ownedItems.includes("isle48") ? 48 : ISLAND_N);
  function setOwned(items, lots) {
    const before = ownedN(); ownedItems = items || []; ownedLots = lots || [];
    if (active && kind === "home" && !readOnly && ownedN() !== before) { leave(); enter({}).then(() => toast(T("Your island grew to {n}×{n}", { n: N }))); }
    else if (active && building) paintBuild();
  }
  // the island's style (world-style.js): ground, cliffs, edge props, waterfalls, weather, the sea; the sky in world-play
  const styler = ctx.STYLE.createStyler({ THREE, K, reduce: ctx.reduce });
  function applyTheme(th) {
    th = ctx.STYLE.STYLES[th] ? th : "";
    ctx.skyTheme(active ? th : "");
    styler.apply(land, N, th);
  }
  function setTheme(th) { myTheme = th || ""; if (active && kind === "home" && !readOnly) { applyTheme(myTheme); saveSoon(); } }

  // ---------------- the village centre (world-village.js): six cells square, as near the middle as there's room ----------------
  // Its level is the village's (api/_world-village.mjs); it grows from a cottage to a palace. Your own island and the
  // islands you visit have one; a coin's lot doesn't. With no 6×6 room left on the island it stands off the back edge.
  let centre = null, myVLevel = 0, myVInfo = null;
  function findSpot() {
    const c = Math.floor(N / 2) - CS / 2, empty = (x, z) => !(cols.get(ckey(x, z)) || []).length;
    const fits = (x0, z0) => { if (x0 < 0 || z0 < 0 || x0 + CS > N || z0 + CS > N) return false; for (let x = x0; x < x0 + CS; x++) for (let z = z0; z < z0 + CS; z++) if (!empty(x, z)) return false; return true; };
    for (let r = 0; r < N; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r && fits(c + dx, c + dz)) return [c + dx, c + dz];
    return null;
  }
  function dropCentre() { if (!centre) return; root.remove(centre); centre.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); centre = null; }
  function placeCentre(level, cheer) {
    dropCentre(); if (!ctx.makeCentre || kind !== "home") { cRect = null; return; }
    if (!cheer || !cRect) cRect = findSpot();
    centre = ctx.makeCentre(Math.max(1, level || 1));
    if (cRect) { centre.scale.setScalar(1.45); centre.position.set(cRect[0] + CS / 2 - N / 2, 0, cRect[1] + CS / 2 - N / 2); }
    else { centre.scale.setScalar(0.75); centre.position.set(0, 0, -N / 2 - 1.5); }
    root.add(centre); ctx.labelsDirty();
    if (cheer) { confetti(new V3(centre.position.x, centre.userData.h * centre.scale.x + 1, centre.position.z)); Snd.win(); }
  }
  const centreLevel = () => (readOnly ? (visitInfo && visitInfo.vlevel) || 1 : myVLevel || 1);
  /// the village's level from world-play.js (and the score, and whether an upgrade is ready), for your own island
  function setVillage(level, info) {
    const was = myVLevel; myVLevel = level || 0; myVInfo = info || null;
    if (active && kind === "home" && !readOnly && centre && centre.userData.level !== centreLevel()) placeCentre(centreLevel(), was > 0 && myVLevel > was);
    paintHud();
  }
  function tickCentre(dt, t) { if (centre) for (const f of centre.userData.spin) f(dt, t); }

  // ---------------- entering and leaving ----------------
  let active = false;
  async function enter(opt = {}) {
    kind = opt.lot ? "lot" : "home"; lotCoin = opt.lot || null; readOnly = !!opt.visit; owner = opt.visit || "";
    let list, n2, theme = "";
    try {
      if (opt.visit) { const v = await loadVisit(opt.visit); list = v.list; n2 = v.N; theme = v.theme; }
      else if (opt.lot) { n2 = ownedLots.includes(String(opt.lot.token).toLowerCase()) ? 13 : LOT_N; list = await loadOwn(n2); }
      else { n2 = ownedN(); list = await loadOwn(n2); theme = myTheme; }
    } catch (e) { toast(e.message || T("Couldn't load that island")); return false; }
    if (n2 !== N) { N = n2; set.clear(); set = brickSet(brickRoot, N); buildLand(); }
    HM = N === 64 ? 32 : HMAX;
    bricks = list; index(); set.clear(); set = brickSet(brickRoot, N); set.sync(bricks); resetIndoor();
    if (bricks.some((b) => TYPES[b.t].cat === 11)) ensureFurn();
    undo.length = 0; redo.length = 0; anims.length = 0;
    cRect = null; placeCentre(centreLevel(), false);
    residents.splice(0).forEach((r) => root.remove(r.g)); lastDoors = bricks.filter((b) => TYPES[b.t].id === "door").length; syncResidents(false);
    root.visible = true; active = true; ghostRoot.visible = false; applyTheme(theme);
    if (show) { if (kind === "home" && !readOnly) show.build(ctx.showcase.data() || {}, N + 6); else show.clear(); }
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
    setBuild(false); resetIndoor(); active = false; root.visible = false; pending = null; lapse = null; ctx.skyTheme(""); dropCentre(); cRect = null;
    document.body.classList.remove("wi-on", "wi-visit", "wi-lapse"); closeSheets();
  }

  // ---------------- the island's own HUD (built here, styled in arc-v10.css as .wi-*) ----------------
  const ui = document.createElement("div"); ui.id = "wi"; ui.setAttribute("data-no-i18n", "");
  ui.innerHTML = `
  <div class="wi-bar"><div class="wi-title"><b id="wi-name"></b><span id="wi-stats"></span><small id="wi-save"></small></div>
    <div class="wi-acts"><button type="button" class="wi-b" id="wi-build-btn" aria-pressed="false">${esc(T("Build"))}<kbd>B</kbd></button><button type="button" class="wi-b" id="wi-bp-btn">${esc(T("Blueprints"))}</button><button type="button" class="wi-b" id="wi-replay-btn">${esc(T("Time-lapse"))}</button><button type="button" class="wi-b" id="wi-book-btn">${esc(T("Guestbook"))}</button><button type="button" class="wi-b" id="wi-isles-btn">${esc(T("Islands"))}</button></div></div>
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
    <div class="wi-hot-name" id="wi-hot-name" aria-live="polite"></div>
    <div class="wi-hot" id="wi-hot" role="listbox" aria-label="${esc(T("Bricks"))}"></div>
    <button type="button" class="wi-more" id="wi-pal-btn">${esc(T("All bricks"))}<kbd>Tab</kbd></button>
  </div>
  <div class="wi-sheet" id="wi-pal" hidden><div class="wi-card"><header><h2>${esc(T("Bricks"))}</h2><button type="button" class="wp-btn wp-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
    <nav class="wi-cats" id="wi-cats"></nav><div class="wi-grid" id="wi-grid"></div>
    <h3>${esc(T("Colour"))}</h3><div class="wi-colors" id="wi-colors"></div></div></div>
  <div class="wi-sheet" id="wi-bp" hidden><div class="wi-card"><header><h2>${esc(T("Blueprints"))}</h2><button type="button" class="wp-btn wp-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
    <p class="wi-note">${esc(T("Pick one, then tap a spot on your island. It rises layer by layer."))}</p><div class="wi-bplist" id="wi-bplist"></div>
    <h3>${esc(T("Share a build"))}</h3><div class="wi-code"><button type="button" class="wp-btn" id="wi-copy">${esc(T("Copy my island as a code"))}</button><input id="wi-code-in" placeholder="ARCBP1.…" spellcheck="false" autocomplete="off"><button type="button" class="wp-btn" id="wi-paste">${esc(T("Use code"))}</button></div></div></div>
  <div class="wi-sheet" id="wi-isles" hidden><div class="wi-card"><header><h2>${esc(T("Islands"))}</h2><button type="button" class="wp-btn wp-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
    <div class="wi-mine-row"><button type="button" class="wp-cta wi-mine" id="wi-go-mine">${esc(T("Go to my island"))}</button><button type="button" class="wp-btn wi-link" id="wi-link">${esc(T("Copy my island link"))}</button><button type="button" class="wp-btn wi-tour" id="wi-tour">${esc(T("Surprise me"))}</button></div>
    <nav class="wi-cats" id="wi-isle-tabs"><button type="button" data-tab="top" aria-pressed="true">${esc(T("Popular"))}</button><button type="button" data-tab="week" aria-pressed="false">${esc(T("This week"))}</button><button type="button" data-tab="recent" aria-pressed="false">${esc(T("Recently built"))}</button><button type="button" data-tab="friends" aria-pressed="false">${esc(T("Friends"))}</button><button type="button" data-tab="villages" aria-pressed="false">${esc(T("Top villages"))}</button></nav>
    <nav class="wi-cats" id="wi-vtop-tabs" hidden><button type="button" data-vp="week">${esc(T("This week"))}</button><button type="button" data-vp="month">${esc(T("This month"))}</button><button type="button" data-vp="all">${esc(T("All time"))}</button></nav>
    <p class="wi-note" id="wi-isle-note" hidden></p>
    <ul class="wi-isle-list" id="wi-isle-list"></ul>
    <form class="wi-code" id="wi-visit-form"><input id="wi-visit-in" placeholder="${esc(T("Visit a wallet: 0x…"))}" spellcheck="false" autocomplete="off"><button type="submit" class="wp-btn">${esc(T("Visit"))}</button></form></div></div>
  <div class="wi-sheet" id="wi-book" hidden><div class="wi-card"><header><h2>${esc(T("Guestbook"))}</h2><button type="button" class="wp-btn wp-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
    <p class="wi-note">${esc(T("Stamps and notes visitors left on your island. Hide a note and only the stamp stays."))}</p><ul class="wi-book" id="wi-book-list"></ul></div></div>
  <div class="wi-visitbar" id="wi-visitbar" hidden><div><b id="wi-v-name"></b><small id="wi-v-sub"></small></div><button type="button" class="wi-like" id="wi-like"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg><span id="wi-likes">0</span></button><button type="button" class="wi-friend" id="wi-friend" aria-pressed="false"></button><button type="button" class="wi-next" id="wi-next">${esc(T("Next island"))}</button>
    <div class="wi-stamps" id="wi-stamps"></div><input class="wi-note-in" id="wi-note" maxlength="60" placeholder="${esc(T("Add a note to your stamp (optional, no links)"))}" autocomplete="off" spellcheck="false"><ul class="wi-stamp-log" id="wi-stamp-log"></ul></div>`;
  document.body.appendChild(ui);
  const q = (s) => ui.querySelector(s);

  function paintHud() {
    if (!active) return;
    const s = stats();
    $("wi-name").textContent = readOnly ? (visitInfo ? T("{name}'s island", { name: visitInfo.name }) : "") : kind === "lot" ? T("{sym} lot", { sym: "$" + lotCoin.symbol }) : T("My Island");
    $("wi-stats").innerHTML = `<span>${esc(s.bricks === 1 ? T("1 brick") : T("{n} bricks", { n: s.bricks }))}</span><span>${esc(s.residents === 1 ? T("1 resident") : T("{n} residents", { n: s.residents }))}</span><span>${esc(T("Beauty {n}", { n: s.beauty }))}</span>${kind === "home" ? `<span class="wi-vlv">${esc(T("Village Lv {n}", { n: centreLevel() }))}${readOnly ? (visitInfo && visitInfo.vscore ? " · " + esc(T("score {s}", { s: visitInfo.vscore.toLocaleString("en-US") })) : "") : myVInfo && myVInfo.score ? " · " + esc(T("score {s}", { s: myVInfo.score.toLocaleString("en-US") })) : ""}</span>` : ""}`;
    q(".wi-acts").hidden = readOnly; $("wi-replay-btn").hidden = !bricks.length;
    $("wi-bp-btn").hidden = kind === "lot"; $("wi-book-btn").hidden = kind === "lot";
  }
  function paintBuild() {
    $("wi-build").hidden = !building;
    $("wi-build-btn").setAttribute("aria-pressed", String(building));
    ui.querySelectorAll("[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
    $("wi-mirror").setAttribute("aria-pressed", String(mirror));
    $("wi-layer").setAttribute("aria-pressed", String(layer >= 0)); $("wi-layer-t").textContent = layer >= 0 ? T("Layer {n}", { n: layer + 1 }) : T("Layer");
    { const ht = TYPES[TI[hot[slot]]], hn = $("wi-hot-name"); if (hn) hn.textContent = ht ? T(ht.name) : ""; } // the brick in hand, by name (b405)
    $("wi-hot").innerHTML = hot.map((id, i) => { const t = TYPES[TI[id]]; return `<button type="button" role="option" aria-selected="${i === slot}" data-slot="${i}" title="${esc(t.name)}${unlocked(t) ? "" : " · " + esc(lockText(t))}" class="${unlocked(t) ? "" : "locked"}">${thumbs[TI[id]] ? `<img alt="" src="${thumbs[TI[id]]}">` : `<span class="wi-ph" style="--c:${hexc(t.color)}"></span>`}<i style="--c:${hexc(i === slot ? curColor() : t.color)}"></i><kbd>${i + 1}</kbd></button>`; }).join("");
    if (!thumbsDone) renderThumbs().then(paintBuild);
  }
  const hexc = (i) => "#" + (COLORS[i] ?? 0xffffff).toString(16).padStart(6, "0");
  let palCat = 0;
  // the bricks you picked last, first in their own tab ("Recent", kept in this browser)
  const RKEY = "arc.world.recentBricks";
  const recent = () => { try { const a = JSON.parse(localStorage.getItem(RKEY) || "[]"); return Array.isArray(a) ? a.slice(0, 12) : []; } catch { return []; } };
  const addRecent = (id) => { try { localStorage.setItem(RKEY, JSON.stringify([id, ...recent().filter((x) => x !== id)].slice(0, 12))); } catch { /* private */ } };
  function paintPal() {
    const rec = recent(); if (palCat === -1 && !rec.length) palCat = 0;
    $("wi-cats").innerHTML = (rec.length ? `<button type="button" data-cat="-1" aria-pressed="${palCat === -1}">${esc(T("Recent"))}</button>` : "") + CAT.map((c, i) => `<button type="button" data-cat="${i}" aria-pressed="${i === palCat}">${esc(T(c))}</button>`).join("");
    const show = (t) => (palCat === -1 ? rec.includes(t.id) : t.cat === palCat);
    $("wi-grid").innerHTML = TYPES.map((t, i) => (!show(t) ? "" : `<button type="button" data-k="${i}" class="${unlocked(t) ? "" : "locked"}" aria-pressed="${i === cur()}"><img alt="" src="${thumbs[i] || ""}"><b>${esc(t.name)}</b>${unlocked(t) ? "" : `<small>${esc(lockText(t))}</small>`}</button>`)).join("");
    $("wi-colors").innerHTML = COLORS.map((c, i) => `<button type="button" data-col="${i}" aria-pressed="${i === curColor()}" style="--c:${hexc(i)}" aria-label="${esc(T("Colour {n}", { n: i + 1 }))}"></button>`).join("");
  }
  const thumbs = []; let thumbsDone = false, thumbsBusy = null;
  // all the kinds, or `only` (the furniture again once its pack is in)
  function renderThumbs(only) {
    if (thumbsBusy && !only) return thumbsBusy;
    const run = async () => {
      let r = null;
      try {
        r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(96, 96); r.outputColorSpace = THREE.SRGBColorSpace;
        const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.4)); const dl = new THREE.DirectionalLight(0xffffff, 1.8); dl.position.set(3, 5, 4); sc.add(dl);
        const cm = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
        let n = 0;
        for (const i of only || TYPES.keys()) {
          const k = kindGeo(i), m = new THREE.InstancedMesh(k.geo, k.mat, 1); m.setMatrixAt(0, new THREE.Matrix4()); m.setColorAt(0, col.setHex(COLORS[TYPES[i].color]));
          const h = TYPES[i].tall; sc.add(m); cm.position.set(2.2, 1.6 + h * 0.8, 3.0).multiplyScalar(0.8 + h * 0.35); cm.lookAt(0, h * 0.45, 0);
          r.render(sc, cm); thumbs[i] = r.domElement.toDataURL("image/png"); sc.remove(m); m.dispose();
          if (++n % 6 === 0) await new Promise((res) => setTimeout(res, 0));
        }
      } catch { /* no thumbnails, names still show */ }
      if (r) { r.dispose(); r.forceContextLoss(); }
      thumbsDone = true;
    };
    return (thumbsBusy = thumbsBusy ? thumbsBusy.then(run) : run());
  }
  function paintVisit() {
    if (!visitInfo) return;
    $("wi-visitbar").hidden = false;
    $("wi-v-name").textContent = T("{name}'s island", { name: visitInfo.name });
    $("wi-v-sub").textContent = visitInfo.wallet.slice(0, 6) + "…" + visitInfo.wallet.slice(-4);
    $("wi-likes").textContent = String(visitInfo.likes || 0);
    $("wi-stamps").innerHTML = STAMPS.map((s, i) => `<button type="button" data-st="${i}">${esc(T(s))}</button>`).join("");
    $("wi-stamp-log").innerHTML = (visitInfo.stamps || []).slice(-4).reverse().map((s) => `<li><b>${esc(T(STAMPS[s.k] || ""))}</b> <small>${esc(String(s.w || ""))}</small>${s.m && !s.h ? `<q>${esc(s.m)}</q>` : ""}${s.r != null && REPLIES[s.r] ? `<em class="wi-reply">${esc(T("{name} replied: {x}", { name: visitInfo.name, x: T(REPLIES[s.r]) }))}</em>` : ""}</li>`).join("");
    const fr = isFriend(visitInfo.wallet); $("wi-friend").setAttribute("aria-pressed", String(fr)); $("wi-friend").textContent = fr ? T("Friend") : T("Add friend");
  }
  function setBuild(on) {
    if (on && readOnly) return;
    building = on; ghostRoot.visible = false; aim = null;
    if (on) { ensureFurn(); setGhost(); if (!thumbsDone) renderThumbs().then(paintBuild); }
    document.body.classList.toggle("wi-building", on);
    topMat && topMat.color.set(on ? 0x6cbd6f : 0x5fae62);
    if (land.userData.clouds) land.userData.clouds.visible = !on; // puffs drifting through the build view
    gridTex.needsUpdate = true; paintBuild();
    if (on) toast(ctx.coarse ? T("Build mode: tap to place, drag to look") : T("Build mode: click to place, right-click to remove, R to rotate"));
  }
  function openSheet(id) { closeSheets(); $(id).hidden = false; ctx.freeze(true); }
  function closeSheets() { ["wi-pal", "wi-bp", "wi-isles", "wi-book"].forEach((id) => { const e = $(id); if (e && !e.hidden) { e.hidden = true; ctx.freeze(false); } }); }
  function openPalette() { paintPal(); openSheet("wi-pal"); if (!thumbsDone) renderThumbs().then(() => { if (!$("wi-pal").hidden) paintPal(); }); }
  /// a piece you bought, in your hands: the builder opens with it in the hotbar and its shelf open in the palette
  function useItem(id) {
    if (!active || kind !== "home" || readOnly) return false;
    const list = TYPES.filter((t) => t.pack === id);
    setBuild(true);
    if (list.length) {
      const t = list[0], at = hot.indexOf(t.id); if (at >= 0) slot = at; else { hot[slot] = t.id; saveHot(); }
      list.slice().reverse().forEach((x) => addRecent(x.id)); color = -1; setTool("place"); palCat = t.cat; paintBuild(); openPalette();
      toast(T("{x} is in your hotbar. Pick a piece and place it.", { x: T(t.name) }));
    }
    return true;
  }
  function openBlueprints() {
    $("wi-bplist").innerHTML = Object.keys(BP).map((id) => { const list = bpList(id), ok = list.every((b) => unlocked(TYPES[b.t])); return `<button type="button" data-bp="${id}" class="${ok ? "" : "locked"}"><b>${esc(T(BP_NAMES[id]))}</b><small>${esc(T("{n} bricks", { n: list.length }))}${ok ? "" : " · " + esc(T("needs bricks you haven't unlocked"))}</small></button>`; }).join("");
    openSheet("wi-bp");
  }
  let isleTab = "top", isleData = null;
  async function openIsles(tab) {
    if (tab && /^(top|week|recent|friends|villages)$/.test(tab)) isleTab = tab;
    openSheet("wi-isles"); $("wi-isle-list").innerHTML = `<li class="wi-empty">${esc(T("Loading islands…"))}</li>`;
    try { const r = await fetch("/api/social?world=islands"); isleData = r.ok ? await r.json() : null; } catch { isleData = null; }
    weekData = null; paintIsles(); if (isleTab === "week" || isleTab === "friends" || isleTab === "villages") loadTab();
  }
  let weekData = null, friendData = null, vp = "week"; const vtop = {}; // the popular-village lists by period, each kept 30 s (the server caches them too)
  // the island tour: a random island you haven't seen on this tour, from the popular, this week's and recently built lists
  const toured = new Set();
  async function tour() {
    if (!isleData) { try { const r = await fetch("/api/social?world=islands"); isleData = r.ok ? await r.json() : null; } catch { isleData = null; } }
    const me = (sess() || {}).wallet || "", seen = new Map();
    for (const k of ["top", "recent", "week"]) for (const x of ((isleData || {})[k] || [])) if (x && /^0x[0-9a-f]{40}$/.test(x.wallet || "") && x.wallet !== me && (x.n || 0) > 0) seen.set(x.wallet, x);
    let pool = [...seen.keys()].filter((w) => !toured.has(w) && w !== (visitInfo && visitInfo.wallet));
    if (!pool.length) { toured.clear(); pool = [...seen.keys()].filter((w) => w !== (visitInfo && visitInfo.wallet)); }
    if (!pool.length) { toast(T("No other islands to visit yet")); return; }
    const w = pool[Math.floor(Math.random() * pool.length)]; toured.add(w); closeSheets(); ctx.goIsland({ visit: w });
  }
  // a friend's island, picked at random (b406: the My Island gate's second button). Friends whose island has bricks
  // first; with no friends yet, a random island instead (and how to add one)
  async function visitFriend() {
    const me = (sess() || {}).wallet || "", here = visitInfo && visitInfo.wallet;
    const ws = FR().map((f) => f.w).filter((w) => /^0x[0-9a-f]{40}$/.test(w || "") && w !== me && w !== here);
    if (!ws.length) { toast(T("No friends yet: add one with Add friend on their island. Here's a random island.")); return tour(); }
    let built = [];
    try { const r = await fetch("/api/social?world=friends&wallets=" + ws.join(",")); const j = r.ok ? await r.json() : {}; built = ws.filter((w) => ((j.friends || {})[w] || {}).isle); } catch { built = []; }
    const pool = built.length ? built : ws, w = pool[Math.floor(Math.random() * pool.length)];
    closeSheets(); ctx.goIsland({ visit: w });
  }
  async function loadTab() {
    if (isleTab === "week" && !weekData) { try { const r = await fetch("/api/social?world=island-week"); weekData = r.ok ? await r.json() : { top: [] }; } catch { weekData = { top: [] }; } }
    if (isleTab === "friends") { const ws = FR().map((f) => f.w); friendData = { list: [] }; if (ws.length) { try { const r = await fetch("/api/social?world=friends&wallets=" + ws.join(",")); const j = r.ok ? await r.json() : {}; friendData.list = FR().map((f) => ({ wallet: f.w, saved: f.n, ...((j.friends || {})[f.w] || {}) })); } catch { friendData.list = FR().map((f) => ({ wallet: f.w, saved: f.n })); } } }
    if (isleTab === "villages" && !(vtop[vp] && Date.now() - vtop[vp].at < 30e3)) { const p = vp; try { const r = await fetch("/api/social?world=village-top&p=" + p); vtop[p] = { ...(r.ok ? await r.json() : { top: [] }), at: Date.now() }; } catch { vtop[p] = { top: [], at: Date.now() }; } }
    paintIsles();
  }
  const ago = (t) => { if (!t) return T("not seen yet"); const m = Math.floor((Date.now() - t) / 60000); return m < 15 ? T("just now") : m < 60 ? T("{n} min ago", { n: m }) : m < 1440 ? T("{n} h ago", { n: Math.floor(m / 60) }) : T("{n} days ago", { n: Math.floor(m / 1440) }); };
  function paintIsles() {
    ui.querySelectorAll("#wi-isle-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === isleTab)));
    $("wi-vtop-tabs").hidden = isleTab !== "villages"; ui.querySelectorAll("#wi-vtop-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vp === vp)));
    const note = $("wi-isle-note"); note.hidden = !(isleTab === "week" || isleTab === "friends" || isleTab === "villages");
    if (isleTab === "villages") {
      const d = vtop[vp], pz = d && d.prizes;
      note.textContent = vp === "all" ? T("The most-liked villages ever. Only likes from players of level 3 and up count.") : (vp === "week" ? T("The top 3 villages of the week win ARCL: {a}. Only likes from players of level 3 and up count. Winners claim in the Adventure log.", { a: pz ? pz.map((x) => x.toLocaleString("en-US")).join(" / ") : "" }) : T("The top 3 villages of the month win ARCL: {a}. Only likes from players of level 3 and up count. Winners claim in the Adventure log.", { a: pz ? pz.map((x) => x.toLocaleString("en-US")).join(" / ") : "" }));
      if (!d) { $("wi-isle-list").innerHTML = `<li class="wi-empty">${esc(T("Loading islands…"))}</li>`; return; }
      const last = d.last && d.last.winners.length ? `<li class="wi-empty">${esc((vp === "week" ? T("Last week's winners: {x}", { x: d.last.winners.map((x) => x.name || "?").join(", ") }) : T("Last month's winners: {x}", { x: d.last.winners.map((x) => x.name || "?").join(", ") })))}</li>` : "";
      $("wi-isle-list").innerHTML = d.top.length ? d.top.map((x, i) => `<li class="${i < 3 ? "vt p" + (i + 1) : "vt"}"><span class="wi-rank">${i + 1}</span><div><b>${esc(x.name || x.wallet.slice(0, 6) + "…" + x.wallet.slice(-4))}</b><small>♥ ${x.likes || 0} · ${esc(T("Village Lv {n}", { n: x.level || 1 }))} · ${esc(T("{n} score", { n: (x.score || 0).toLocaleString("en-US") }))}</small></div><button type="button" class="wi-visit" data-wal="${esc(x.wallet)}">${esc(T("Visit this island"))}</button></li>`).join("") + last : `<li class="wi-empty">${esc(vp === "all" ? T("No likes yet.") : vp === "week" ? T("No likes yet this week. Visit an island and leave the first.") : T("No likes yet this month. Visit an island and leave the first."))}</li>${last}`;
      return;
    }
    if (isleTab === "week") note.textContent = T("This week's contest: the islands with the most new likes since Monday (Seoul time). It starts over every week.");
    if (isleTab === "friends") note.textContent = T("Add friends from their island's visit bar. Their card shows their level, when they last played and their island.");
    if (isleTab === "week" || isleTab === "friends") {
      const L = isleTab === "week" ? (weekData ? weekData.top || [] : null) : friendData ? friendData.list : null;
      if (!L) { $("wi-isle-list").innerHTML = `<li class="wi-empty">${esc(T("Loading islands…"))}</li>`; return; }
      $("wi-isle-list").innerHTML = L.length ? L.map((x, i) => isleTab === "week"
        ? `<li class="${i < 3 ? "wk p" + (i + 1) : "wk"}"><button type="button" data-wal="${esc(x.wallet)}"><span class="wi-rank">${i + 1}</span><b>${esc(x.name || x.wallet.slice(0, 6) + "…" + x.wallet.slice(-4))}</b><small>${esc(T("{n} likes this week", { n: x.likes || 0 }))} · ${esc(T("{n} bricks", { n: x.n || 0 }))}</small></button></li>`
        : `<li class="fr"><button type="button" data-wal="${esc(x.wallet)}" ${x.isle ? "" : "disabled"}><b>${esc(x.name || x.saved || x.wallet.slice(0, 6) + "…" + x.wallet.slice(-4))}${x.lv ? ` <em>Lv ${x.lv}</em>` : ""}</b><small>${esc(ago(x.seen))} · ${esc(x.isle ? T("{n} bricks", { n: x.isle }) + " · ♥ " + (x.likes || 0) : T("no island yet"))}</small></button><button type="button" class="wi-unfriend" data-unfriend="${esc(x.wallet)}" aria-label="${esc(T("Remove from friends"))}">×</button></li>`).join("")
        : `<li class="wi-empty">${esc(isleTab === "week" ? T("No likes yet this week. Visit an island and leave the first.") : T("No friends yet. Visit an island and tap Add friend."))}</li>`;
      return;
    }
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
    if (b.dataset.k != null) { const t = TYPES[+b.dataset.k]; if (!unlocked(t)) { toast(T("Locked: {why}", { why: lockText(t) })); return; } const at = hot.indexOf(t.id); if (at >= 0) slot = at; else { hot[slot] = t.id; saveHot(); } addRecent(t.id); color = -1; setTool("place"); paintPal(); paintBuild(); return; }
    if (b.dataset.col != null) { color = +b.dataset.col; paintPal(); paintBuild(); return; }
    if (b.dataset.bp) { closeSheets(); startBlueprint(bpList(b.dataset.bp), T(BP_NAMES[b.dataset.bp])); return; }
    if (b.id === "wi-copy") { const code = toCode(bricks); if (!code) { toast(T("Build something first")); return; } try { await navigator.clipboard.writeText(code); toast(T("Code copied. Anyone can paste it into Blueprints.")); } catch { $("wi-code-in").value = code; toast(T("Here's your code: copy it from the box")); } return; }
    if (b.id === "wi-paste") { closeSheets(); startBlueprint(fromCode($("wi-code-in").value), T("Your blueprint")); return; }
    if (b.id === "wi-go-mine") { closeSheets(); ctx.goIsland({}); return; }
    if (b.id === "wi-tour" || b.id === "wi-next") { tour(); return; }
    if (b.dataset.vp) { vp = b.dataset.vp; paintIsles(); loadTab(); return; }
    if (b.dataset.tab) { isleTab = b.dataset.tab; if (isleTab === "week") weekData = null; paintIsles(); loadTab(); return; }
    if (b.dataset.unfriend) { const list = FR(), i = list.findIndex((f) => f.w === b.dataset.unfriend); if (i >= 0) list.splice(i, 1); ctx.saveP && ctx.saveP(); loadTab(); return; }
    if (b.id === "wi-friend") { if (visitInfo) toggleFriend(visitInfo.wallet, visitInfo.name); return; }
    if (b.id === "wi-book-btn") { openBook(); return; }
    if (b.dataset.hide) { hideNote(b.dataset.hide); return; }
    if (b.dataset.reply) { replyNote(b.dataset.reply); return; }
    if (b.id === "wi-link") { const u = myLink(); if (!u) { toast(T("Sign in with your wallet to share your island")); return; } try { await navigator.clipboard.writeText(u); toast(T("Island link copied. Anyone who opens it lands on your island.")); if (ctx.onShared) ctx.onShared(); } catch { $("wi-visit-in").value = u; toast(T("Here's your link: copy it from the box")); } return; }
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
    if (k === "]" && layer >= 0) { layer = Math.min(HM - 1, layer + 1); paintBuild(); return true; }
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
    let n0 = LOT_N; try { n0 = unb64(data)[1] || LOT_N; } catch { /* the default */ }
    const g = new THREE.Group(), list = decode(data, n0); if (!list.length) return null;
    const s = brickSet(g, n0); s.sync(list); g.userData.h = Math.max(...list.map((b) => b.y + TYPES[b.t].tall)); g.userData.N = n0;
    return g;
  }

  return {
    TYPES, enter, leave, floorAt, blocked, indoor: () => indoor, solidAt: (x, y, z) => { const b = occ.get(key(Math.floor(x - ISLE.x + N / 2), Math.floor(y), Math.floor(z - ISLE.z + N / 2))); return !!b && TYPES[b.t].solid; }, // the camera's wall check (world coords)
    keyDown, tap, hover, makeStatic, stats, setOwned, setTheme, setVillage, useItem, centre: () => centre,
    active: () => active, building: () => building, readOnly: () => readOnly, kind: () => kind,
    title: () => (readOnly && visitInfo ? T("{name}'s island", { name: visitInfo.name }) : kind === "lot" ? "$" + lotCoin.symbol : T("My Island")),
    near(consider) { consider(exit, "isle-exit", {}, 2.6); if (centre) { centre.userData.radius = 2.2 * centre.scale.x; consider(centre, "village", { level: centreLevel(), mine: !readOnly }, 1.4); } residents.forEach((r) => consider(r.g, "resident", { res: r }, 1.8)); },
    talk(r) { const lines = ctx.lines(); if (r.bub) r.g.remove(r.bub); r.bub = K.bubble(lines.length ? lines[Math.floor(Math.random() * lines.length)] : T("Hi! Nice island."), "#7ee0a0"); r.bub.position.y = 3.1; r.bub.scale.multiplyScalar(0.8); r.g.add(r.bub); r.ch.play("emote-yes", { once: true }); ctx.labelsDirty(); setTimeout(() => { if (r.bub) { r.g.remove(r.bub); r.bub = null; ctx.labelsDirty(); } }, 5000); },
    mini(put) { put(exit, "#35d8d0", 6); if (centre) put(centre, "#ffc861", 8); residents.forEach((r) => put(r.g, "#7ee0a0", 4)); },
    showcase: () => show, tick(dt, t) { if (!active) return; if (show) show.tick(dt, t); tickAnims(); tickLapse(); tickResidents(dt, t); tickCentre(dt, t); styler.tick(dt, t); if (land.userData.clouds && !building) land.userData.clouds.userData.update(dt); },
    openIsles, tour, visitFriend, friendCount: () => FR().length, closeSheets, news, isFriend, toggleFriend, bookNew: () => bookNew, save: cloudSave, debug: () => ({ bricks: bricks.length, kinds: new Set(bricks.map((b) => b.t)).size, residents: residents.length, building, tool, slot, undo: undo.length, layer, mirror }),
    _place: (x, y, z, id, r = 0, c) => { const t = TI[id]; apply({ add: [{ x, y, z, t, r, c: c ?? TYPES[t].color }] }); }, _blueprint: (id, x, y, z) => { pending = { list: bpList(id), name: id }; aim = { place: [x, y, z] }; return placeBlueprint(); },
  };
}
