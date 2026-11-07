// galaxy.js — ARC GALAXY (arcircle.app/galaxy): every transaction on Arc, live in 3D. Community-built by ARCIRCLE.
// The feed (/api/social?arc=galaxy, api/_arc-galaxy.mjs) brings the last two minutes of Arc's transactions; the page
// replays them fast when it opens, then plays new blocks a few seconds behind the chain.
//   wallets sit on an outer halo (their place comes from their address, so a wallet always flies from the same spot);
//   contracts are stars: the ones we can name orbit their family's hub (Circle, Uniswap, ARCIRCLE, launchpads), the rest
//   lie along the spiral arms; a transaction is a light flying from its wallet to what it called, coloured by kind.
// ?src=<same-origin path> reads a saved feed instead (tests / screenshots of a real snapshot); ?demo=1 makes a
// clearly-labelled made-up feed for trying the page without the chain.
import * as THREE from "/vendor/three/three-0.186.1.module.min.js";

const Q = new URLSearchParams(location.search);
const PHONE = matchMedia("(max-width: 760px)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const LOW = PHONE && (navigator.hardwareConcurrency || 4) <= 4;
// GX4: ?net=testnet reads Arc's testnet; /embed/galaxy (or ?embed=1) a compact view for other sites; ?obs=1 no UI at all (streams, screens)
const NET = Q.get("net") === "testnet" || Q.get("net") === "robinhood" ? Q.get("net") : "mainnet";
const RH = NET === "robinhood"; // GXR: Robinhood Chain (4663) through the same engine — ETH priced live, no CCTP
const CHAIN_NAME = RH ? "Robinhood Chain" : NET === "testnet" ? "Arc testnet" : "Arc";
const EMBED = location.pathname.startsWith("/embed/") || Q.get("embed") === "1", OBS = Q.get("obs") === "1";
const EXPLORER = NET === "testnet" ? "https://explorer.testnet.arc.io" : RH ? "https://robinhoodchain.blockscout.com" : "https://arc.etherscan.io";
const FEED = (() => { const s = Q.get("src"); return s && /^\/[\w\-./]+$/.test(s) ? s : "/api/social?arc=galaxy" + (NET !== "mainnet" ? "&net=" + NET : ""); })();
const DEMO = Q.get("demo") === "1";
const POLL_MS = 2000, LAG_MS = 4500, REPLAY_S = 12;

// ---------------------------------------------------------------- words (en / ko / zh / tr)
const W = {
  ko: { views: "회 조회", records: "기록", recUsd: "가장 큰 USDC 이동", recBlock: "가장 바쁜 블록", recTps: "최고 초당 트랜잭션 (1분)", today: "오늘", ever: "역대", recSee: "역대 최대 이동 보기", recHint: "‘역대’ = ARC GALAXY가 지켜본 뒤로", newRec: "새 기록!", mileIn: "다음: 블록 #{n}까지 {t}", mileNow: "Arc가 블록 #{n}에 도달했어요!", shareStar: "이 별 공유", copiedLink: "링크 복사됨", claim: "내 컨트랙트 이름 짓기", rename: "이름 바꾸기", claimedBy: "컨트랙트 주인이 지은 이름", claimHint: "내 컨트랙트인가요? owner()가 가리키는 지갑으로 서명하면 별에 이름이 붙어요.", claimName: "이름 (2–28자)", claimBtn: "지갑으로 서명하고 저장", noWallet: "서명하려면 지갑 브라우저(MetaMask, Rabby 등)에서 이 페이지를 여세요.", claimOk: "이름이 붙었어요! 곧 모두에게 보여요.", feeAvg: "평균 수수료 (USDC)", fee10: "낸 수수료 · 10분", auth10: "서명 결제", authK: "서명 결제 (EIP-3009)", blockTime: "블록 시간 · 즉시 확정", tabKinds: "종류", tabContracts: "컨트랙트", tabWallets: "지갑", tabTokens: "토큰", tabNew: "신규", tabLive: "실시간", noNew: "아직 새 컨트랙트가 없어요", day24: "최근 24시간", peak: "가장 바쁜 1분", play: "ARCIRCLE 플레이", saved: "스냅샷 저장 완료 — #ArcGalaxy 와 함께 올려 보세요", openFull: "ARC GALAXY 크게 보기", warming: "피드를 깨우는 중 — 저장된 최근 기록부터 보여줍니다…", reading: "Arc의 최신 블록을 읽는 중…", finding: "Arc에서 그 트랜잭션을 찾는 중…", noTx: "Arc에 그런 트랜잭션이 (아직) 없어요.", block: "블록", from: "보낸 곳", to: "받는 곳", when: "시각", tag: "Arc의 모든 트랜잭션을 실시간 3D로", by: "커뮤니티 제작:", notOfficial: "Arc 공식 사이트가 아닙니다", connecting: "Arc에 연결하는 중…", live: "LIVE", replay: "지난 2분 되감기", quiet: "Arc가 조용한 순간 — 지난 2분을 다시 보여줍니다", tps: "초당 트랜잭션", usd10: "USDC 이동 · 10분", txs10: "트랜잭션 · 10분", okRate: "성공률", wallets: "활동 지갑", kinds: "날아가는 것들", kindsHint: "종류를 눌러 숨기거나 보이세요.", busiest: "가장 바쁜 컨트랙트 · 10분", follow: "지갑·컨트랙트 따라가기 또는 트랜잭션 찾기 — 0x… 붙여넣기", followBtn: "따라가기", share: "공유", src: "데이터: Arc 공개 RPC · 2초마다 갱신", usdc: "USDC 전송", swap: "스왑", bridge: "브리지 (CCTP)", token: "토큰 전송", nft: "NFT", deploy: "새 컨트랙트", approve: "승인", call: "컨트랙트 호출", failed: "실패", txsSeen: "본 트랜잭션", lastMin: "최근 2분", kindsOf: "종류", openExp: "탐색기에서 보기", copy: "주소 복사", copied: "복사됨", following: "따라가는 중", waiting: "이 주소의 다음 트랜잭션을 기다리는 중…", bad: "Arc RPC가 응답하지 않아요 — 다시 시도 중", demo: "DEMO — 만들어낸 데이터입니다 (실제 Arc 아님)", top: "Top", none: "아직 없음", contract: "컨트랙트", wallet: "지갑", noWebgl: "이 브라우저는 WebGL을 쓸 수 없어 3D를 그릴 수 없어요.", badAddr: "0x로 시작하는 40자리 주소를 넣어 주세요." },
  zh: { views: "次浏览", records: "纪录", recUsd: "最大一笔 USDC 流动", recBlock: "最繁忙的区块", recTps: "最高每秒交易（1 分钟）", today: "今天", ever: "历史", recSee: "查看历史最大一笔", recHint: "“历史” = 自 ARC GALAXY 开始观测以来", newRec: "新纪录！", mileIn: "下一个：区块 #{n}，还有 {t}", mileNow: "Arc 已到达区块 #{n}！", shareStar: "分享这颗星", copiedLink: "链接已复制", claim: "为我的合约命名", rename: "改名", claimedBy: "由合约所有者命名", claimHint: "这是你的合约吗？用 owner() 返回的钱包签名即可为这颗星命名。", claimName: "名称（2–28 个字符）", claimBtn: "用钱包签名并保存", noWallet: "请在钱包浏览器（MetaMask、Rabby 等）中打开此页面以签名。", claimOk: "已命名！稍后所有人都能看到。", feeAvg: "平均手续费（USDC）", fee10: "已付手续费 · 10 分钟", auth10: "签名支付", authK: "签名支付（EIP-3009）", blockTime: "出块时间 · 即刻确定", tabKinds: "类型", tabContracts: "合约", tabWallets: "钱包", tabTokens: "代币", tabNew: "新", tabLive: "实时", noNew: "暂无新合约", day24: "最近 24 小时", peak: "最忙的一分钟", play: "玩 ARCIRCLE", saved: "快照已保存 — 带上 #ArcGalaxy 分享吧", openFull: "打开 ARC GALAXY", warming: "正在唤醒数据 — 先显示保存的最近记录…", reading: "正在读取 Arc 最新区块…", finding: "正在 Arc 上查找该交易…", noTx: "Arc 上（还）没有这笔交易。", block: "区块", from: "发送方", to: "接收方", when: "时间", tag: "Arc 上的每一笔交易，实时 3D 呈现", by: "社区制作：", notOfficial: "非 Arc 官方网站", connecting: "正在连接 Arc…", live: "实时", replay: "回放最近 2 分钟", quiet: "Arc 此刻很安静 — 回放最近 2 分钟", tps: "每秒交易", usd10: "USDC 流动 · 10 分钟", txs10: "交易 · 10 分钟", okRate: "成功率", wallets: "活跃钱包", kinds: "正在飞的", kindsHint: "点按类型以隐藏或显示。", busiest: "最繁忙合约 · 10 分钟", follow: "关注钱包/合约，或查找交易 — 粘贴 0x…", followBtn: "关注", share: "分享", src: "数据：Arc 公共 RPC · 每 2 秒更新", usdc: "USDC 转账", swap: "兑换", bridge: "跨链桥 (CCTP)", token: "代币转账", nft: "NFT", deploy: "新合约", approve: "授权", call: "合约调用", failed: "失败", txsSeen: "看到的交易", lastMin: "最近 2 分钟", kindsOf: "类型", openExp: "在浏览器中查看", copy: "复制地址", copied: "已复制", following: "正在关注", waiting: "等待此地址的下一笔交易…", bad: "Arc RPC 未响应 — 正在重试", demo: "DEMO — 虚构数据（不是真实的 Arc）", top: "排行", none: "暂无", contract: "合约", wallet: "钱包", noWebgl: "此浏览器无法使用 WebGL，无法绘制 3D。", badAddr: "请输入以 0x 开头的 40 位地址。" },
  tr: { views: "görüntülenme", records: "Rekorlar", recUsd: "En büyük USDC hareketi", recBlock: "En yoğun blok", recTps: "En yüksek işlem/sn (1 dk)", today: "bugün", ever: "tüm zamanlar", recSee: "En büyük hareketi gör", recHint: "“tüm zamanlar” = ARC GALAXY izlemeye başladığından beri", newRec: "Yeni rekor!", mileIn: "Sıradaki: blok #{n}, {t} sonra", mileNow: "Arc #{n}. bloğa ulaştı!", shareStar: "Bu yıldızı paylaş", copiedLink: "Bağlantı kopyalandı", claim: "Kontratıma ad ver", rename: "Yeniden adlandır", claimedBy: "kontratın sahibi adlandırdı", claimHint: "Kontrat senin mi? owner() hangi cüzdanı gösteriyorsa onunla imzala, yıldız adını alsın.", claimName: "Ad (2–28 karakter)", claimBtn: "Cüzdanla imzala ve kaydet", noWallet: "İmzalamak için bu sayfayı bir cüzdan tarayıcısında (MetaMask, Rabby …) aç.", claimOk: "Adlandırıldı! Birazdan herkes görecek.", feeAvg: "ort. ücret (USDC)", fee10: "ödenen ücret · 10 dk", auth10: "imzalı ödemeler", authK: "İmzalı ödeme (EIP-3009)", blockTime: "blok süresi · kesin", tabKinds: "Türler", tabContracts: "Kontratlar", tabWallets: "Cüzdanlar", tabTokens: "Tokenler", tabNew: "Yeni", tabLive: "Canlı", noNew: "Henüz yeni kontrat yok", day24: "Son 24 saat", peak: "en yoğun dakika", play: "ARCIRCLE oyna", saved: "Görüntü kaydedildi — #ArcGalaxy ile paylaş", openFull: "ARC GALAXY'yi aç", warming: "Akış uyanıyor — kayıtlı son dakikalar gösteriliyor…", reading: "Arc'ın son blokları okunuyor…", finding: "Bu işlem Arc'ta aranıyor…", noTx: "Arc'ta böyle bir işlem (henüz) yok.", block: "Blok", from: "Gönderen", to: "Alan", when: "Zaman", tag: "Arc'taki her işlem, canlı 3D", by: "Topluluk yapımı:", notOfficial: "resmi Arc sitesi değildir", connecting: "Arc'a bağlanılıyor…", live: "CANLI", replay: "Son 2 dakika geri sarılıyor", quiet: "Arc'ta sakin bir an — son 2 dakika tekrar", tps: "işlem / saniye", usd10: "taşınan USDC · 10 dk", txs10: "işlem · 10 dk", okRate: "başarılı", wallets: "aktif cüzdan", kinds: "Uçanlar", kindsHint: "Gizlemek / göstermek için bir türe dokunun.", busiest: "En yoğun kontratlar · 10 dk", follow: "Cüzdan / kontrat izle ya da işlem bul — 0x… yapıştır", followBtn: "İzle", share: "Paylaş", src: "Veri: Arc'ın açık RPC'si · 2 sn'de bir", usdc: "USDC transferi", swap: "Takas", bridge: "Köprü (CCTP)", token: "Token transferi", nft: "NFT", deploy: "Yeni kontrat", approve: "Onay", call: "Kontrat çağrısı", failed: "başarısız", txsSeen: "görülen işlem", lastMin: "son 2 dk", kindsOf: "türler", openExp: "Gezginde aç", copy: "Adresi kopyala", copied: "Kopyalandı", following: "İzleniyor", waiting: "Bu adresin bir sonraki işlemi bekleniyor…", bad: "Arc RPC yanıt vermedi — yeniden deneniyor", demo: "DEMO — uydurma veri (gerçek Arc değil)", top: "Top", none: "henüz yok", contract: "kontrat", wallet: "cüzdan", noWebgl: "Bu tarayıcı WebGL kullanamıyor; 3D çizilemez.", badAddr: "0x ile başlayan 40 haneli bir adres girin." },
};
const EN = { views: "views", records: "Records", recUsd: "Biggest USDC move", recBlock: "Busiest block", recTps: "Peak tx/s (1 min)", today: "today", ever: "ever", recSee: "See the biggest move ever", recHint: "“ever” = since ARC GALAXY began watching", newRec: "New record!", mileIn: "Next: block #{n} in {t}", mileNow: "Arc reached block #{n}!", shareStar: "Share this star", copiedLink: "Link copied", claim: "Name my contract", rename: "Rename", claimedBy: "named by its contract's owner", claimHint: "Your contract? Sign with the wallet its owner() returns and the star gets your name.", claimName: "Name (2–28 characters)", claimBtn: "Sign with wallet & save", noWallet: "Open this page in a wallet browser (MetaMask, Rabby …) to sign.", claimOk: "Named! Everyone sees it in a moment.", feeAvg: "avg fee in USDC", fee10: "fees paid · 10 min", auth10: "signed payments", authK: "Signed payment (EIP-3009)", tabKinds: "Kinds", tabContracts: "Contracts", tabWallets: "Wallets", tabTokens: "Tokens", tabNew: "New", tabLive: "Live", noNew: "No new contracts yet", day24: "Last 24 h", peak: "busiest minute", play: "Play ARCIRCLE", saved: "Snapshot saved — post it with #ArcGalaxy", openFull: "Open ARC GALAXY", warming: "Waking up the feed — showing the last saved minutes…", reading: "Reading Arc's latest blocks…", finding: "Looking for that transaction on Arc…", noTx: "No such transaction on Arc (yet).", block: "Block", from: "From", to: "To", when: "When", tag: "Every transaction on Arc, live in 3D", tps: "tx / second", blockTime: "block time · final", usd10: "USDC moved · 10 min", txs10: "transactions · 10 min", okRate: "succeeded", wallets: "active wallets", kinds: "What's flying", busiest: "Busiest contracts · 10 min", follow: "Follow a wallet / contract, or find a tx — paste 0x…", followBtn: "Follow", share: "Share", live: "LIVE", replay: "Replaying the last 2 minutes", quiet: "A quiet moment on Arc — replaying the last 2 minutes", usdc: "USDC transfer", swap: "Swap", bridge: "Bridge (CCTP)", token: "Token transfer", nft: "NFT", deploy: "New contract", approve: "Approval", call: "Contract call", failed: "failed", txsSeen: "transactions seen", lastMin: "last 2 min", kindsOf: "kinds", openExp: "Open in explorer", copy: "Copy address", copied: "Copied", following: "Following", waiting: "Waiting for this address's next transaction…", bad: "Arc's RPC didn't answer — retrying", demo: "DEMO — made-up data (not the real Arc)", top: "Top", none: "none yet", contract: "contract", wallet: "wallet", noWebgl: "This browser can't use WebGL, so the 3D can't be drawn.", badAddr: "Paste a 40-character address that starts with 0x.", connecting: "Connecting to Arc…" };
let LANG = (() => { try { const s = localStorage.getItem("arc.galaxy.lang") || localStorage.getItem("arcircle.lang"); if (s && (s === "en" || W[s])) return s; } catch {} const n = (navigator.language || "en").slice(0, 2); return W[n] ? n : "en"; })();
// GXR: the words that change on Robinhood Chain (its money is ETH, it has no CCTP, finality isn't Arc's)
const RHW = {
  en: { tag: "Every transaction on Robinhood Chain, live in 3D", usd10: "value moved · 10 min", feeAvg: "avg fee in USD", blockTime: "block time", usdc: "ETH / USDG transfer", bridge: "Bridge", connecting: "Connecting to Robinhood Chain…", reading: "Reading Robinhood Chain's latest blocks…", finding: "Looking for that transaction on Robinhood Chain…", noTx: "No such transaction on Robinhood Chain (yet).", bad: "Robinhood Chain's RPC didn't answer — retrying", quiet: "A quiet moment on Robinhood Chain — replaying the last 2 minutes", src: "Data: Robinhood Chain's public RPC · ETH priced live", notOfficial: "not an official Robinhood site", recUsd: "Biggest move", openFull: "Open the galaxy" },
  ko: { tag: "Robinhood Chain의 모든 트랜잭션을 실시간 3D로", usd10: "이동한 가치 · 10분", feeAvg: "평균 수수료 (USD)", blockTime: "블록 시간", usdc: "ETH / USDG 전송", bridge: "브리지", connecting: "Robinhood Chain에 연결하는 중…", reading: "Robinhood Chain의 최신 블록을 읽는 중…", finding: "Robinhood Chain에서 그 트랜잭션을 찾는 중…", noTx: "Robinhood Chain에 그런 트랜잭션이 (아직) 없어요.", bad: "Robinhood Chain RPC가 응답하지 않아요 — 다시 시도 중", quiet: "Robinhood Chain이 조용한 순간 — 지난 2분을 다시 보여줍니다", src: "데이터: Robinhood Chain 공개 RPC · ETH 실시간 가격", notOfficial: "Robinhood 공식 사이트가 아닙니다", recUsd: "가장 큰 이동", openFull: "갤럭시 크게 보기" },
  zh: { tag: "Robinhood Chain 上的每一笔交易，实时 3D 呈现", usd10: "转移价值 · 10 分钟", feeAvg: "平均手续费（美元）", blockTime: "出块时间", usdc: "ETH / USDG 转账", bridge: "跨链桥", connecting: "正在连接 Robinhood Chain…", reading: "正在读取 Robinhood Chain 最新区块…", finding: "正在 Robinhood Chain 上查找该交易…", noTx: "Robinhood Chain 上（还）没有这笔交易。", bad: "Robinhood Chain RPC 未响应 — 正在重试", quiet: "Robinhood Chain 此刻很安静 — 回放最近 2 分钟", src: "数据：Robinhood Chain 公共 RPC · ETH 实时价格", notOfficial: "非 Robinhood 官方网站", recUsd: "最大一笔", openFull: "打开星系" },
  tr: { tag: "Robinhood Chain'deki her işlem, canlı 3D", usd10: "taşınan değer · 10 dk", feeAvg: "ort. ücret (USD)", blockTime: "blok süresi", usdc: "ETH / USDG transferi", bridge: "Köprü", connecting: "Robinhood Chain'e bağlanılıyor…", reading: "Robinhood Chain'in son blokları okunuyor…", finding: "Bu işlem Robinhood Chain'de aranıyor…", noTx: "Robinhood Chain'de böyle bir işlem (henüz) yok.", bad: "Robinhood Chain RPC yanıt vermedi — yeniden deneniyor", quiet: "Robinhood Chain'de sakin bir an — son 2 dakika tekrar", src: "Veri: Robinhood Chain açık RPC · ETH canlı fiyat", notOfficial: "resmi Robinhood sitesi değildir", recUsd: "En büyük hareket", openFull: "Galaksiyi aç" },
};
const t = (k) => (RH && ((RHW[LANG] && RHW[LANG][k]) || RHW.en[k])) || (LANG !== "en" && W[LANG] && W[LANG][k]) || EN[k] || k;
function paintWords() {
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-i]").forEach((el) => { const k = el.dataset.i; if (!el.dataset.en) el.dataset.en = el.textContent; if (RH && RHW.en[k]) el.textContent = t(k); else if (LANG === "en") el.textContent = el.dataset.en; else if (W[LANG][k]) el.textContent = W[LANG][k]; });
  document.querySelectorAll("[data-iph]").forEach((el) => { if (!el.dataset.en) el.dataset.en = el.placeholder; el.placeholder = LANG === "en" ? el.dataset.en : W[LANG][el.dataset.iph] || el.dataset.en; });
  const sel = document.getElementById("gx-lang"); if (sel) sel.value = LANG;
  paintLegend(); paintTop();
}

// ---------------------------------------------------------------- kinds
const KINDS = ["usdc", "swap", "bridge", "token", "nft", "deploy", "approve", "call"];
const KCOL = [0xffd166, 0x3ce6ff, 0x4dffb0, 0xa98bff, 0xff6fd8, 0xffffff, 0x7fa3c8, 0x5b8cff];
const RED = new THREE.Color(0xff4d5e);
const kcss = (k) => "#" + KCOL[k].toString(16).padStart(6, "0");
const AUTHC = 0xff9a3c; // GX7: signed (EIP-3009) USDC payments — x402 / AI agents — fly orange
const hidden = new Set();

// ---------------------------------------------------------------- helpers
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const short = (a) => (a && a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a || "");
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || "");
function hash(s, seed = 0) { let h = 2166136261 ^ seed; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; }
const fmtUsd = (cents) => { const d = cents / 100; if (d >= 1e9) return "$" + (d / 1e9).toFixed(2) + "B"; if (d >= 1e6) return "$" + (d / 1e6).toFixed(2) + "M"; if (d >= 1e4) return "$" + (d / 1e3).toFixed(1) + "K"; if (d >= 100) return "$" + Math.round(d).toLocaleString("en-US"); return "$" + d.toFixed(2); };
const fmtN = (n) => (n == null ? "–" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Math.round(n).toLocaleString("en-US"));

// ---------------------------------------------------------------- the scene
const canvas = $("gx-c");
let R;
try { R = new THREE.WebGLRenderer({ canvas, antialias: !PHONE, powerPreference: "high-performance" }); }
catch (e) { note(t("noWebgl"), true); throw e; }
const DPR = Math.min(window.devicePixelRatio || 1, PHONE ? 1.5 : 2);
R.setPixelRatio(DPR); R.setSize(innerWidth, innerHeight); R.setClearColor(0x02040c, 1);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02040c, 0.0016);
const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 4000);
const world = new THREE.Group(); scene.add(world);

// one soft-point material for stars, dust, contracts and flying transactions
function pointsMat(scale = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: innerHeight * DPR * 0.5 * scale }, uTime: { value: 0 }, uTw: { value: 0 } },
    vertexShader: "attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale; uniform float uTime; uniform float uTw;" +
      "void main(){ vC=color; vA=alpha*(1.0-uTw*0.45*(0.5+0.5*sin(uTime*1.7+position.x*0.37+position.z*0.21))); vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(size*uScale/-mv.z,0.0,96.0); gl_Position=projectionMatrix*mv; }",
    fragmentShader: "varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=dot(d,d)*4.0; if(r>1.0) discard; float a=exp(-r*3.2)*vA + smoothstep(0.18,0.0,r)*vA*0.9; gl_FragColor=vec4(vC*a, a); }",
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
}
function cloud(n, fill, scale = 1) {
  const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n), a = new Float32Array(n);
  for (let i = 0; i < n; i++) fill(i, p, c, s, a);
  g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  g.setAttribute("size", new THREE.BufferAttribute(s, 1)); g.setAttribute("alpha", new THREE.BufferAttribute(a, 1));
  const m = new THREE.Points(g, pointsMat(scale)); m.frustumCulled = false; return m;
}
const tmpC = new THREE.Color();
// far stars (they twinkle)
const starCloud = world.add(cloud(PHONE ? 1400 : 3200, (i, p, c, s, a) => {
  const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 900 + Math.random() * 900, q = Math.sqrt(1 - u * u);
  p[i * 3] = r * q * Math.cos(th); p[i * 3 + 1] = r * u; p[i * 3 + 2] = r * q * Math.sin(th);
  tmpC.setHSL(0.55 + Math.random() * 0.15, 0.4, 0.75 + Math.random() * 0.25); c.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  s[i] = 2 + Math.random() * 4; a[i] = 0.35 + Math.random() * 0.5;
})).children.at(-1);
starCloud.material.uniforms.uTw.value = 1;
// the galaxy's disc: three arms of faint dust round the core
const ARMS = 3, armTh = (r, arm, jitter) => arm * (Math.PI * 2 / ARMS) + r * 0.032 + jitter;
const disc = cloud(LOW ? 3500 : PHONE ? 6000 : 14000, (i, p, c, s, a) => {
  const r = Math.pow(Math.random(), 0.7) * 175 + 6, arm = i % ARMS, j = (Math.random() - 0.5) * (0.9 - r / 400) * 1.2;
  const th = armTh(r, arm, j), y = (Math.random() - 0.5) * (10 - r / 25) * (Math.random() < 0.8 ? 0.6 : 1.6);
  p[i * 3] = Math.cos(th) * r; p[i * 3 + 1] = y; p[i * 3 + 2] = Math.sin(th) * r;
  const hue = 0.53 + (r / 175) * 0.2 + (Math.random() - 0.5) * 0.06; tmpC.setHSL(hue, 0.75, 0.55 + Math.random() * 0.2); c.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  s[i] = 1.2 + Math.random() * 2.2; a[i] = (0.14 + Math.random() * 0.28) * (1.25 - r / 250);
});
world.add(disc);
// the core: a bright heart + a soft halo (canvas textures; Meshy's glow replaces the halo when it's there)
function glowTex(stops) { const cv = document.createElement("canvas"); cv.width = cv.height = 256; const x = cv.getContext("2d"); const g = x.createRadialGradient(128, 128, 0, 128, 128, 128); stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, 256, 256); const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return tx; }
const coreMat = new THREE.SpriteMaterial({ map: glowTex([[0, "rgba(255,255,255,1)"], [0.08, "rgba(190,250,255,0.95)"], [0.25, "rgba(60,200,255,0.45)"], [0.6, "rgba(40,80,200,0.12)"], [1, "rgba(0,0,0,0)"]]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
const core = new THREE.Sprite(coreMat); core.scale.setScalar(70); world.add(core);
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex([[0, "rgba(80,160,255,0.35)"], [0.5, "rgba(60,90,220,0.1)"], [1, "rgba(0,0,0,0)"]]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
halo.scale.setScalar(420); world.add(halo);
const texLoad = new THREE.TextureLoader();
const tryTex = (url, fn) => texLoad.load(url, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; fn(tx); }, undefined, () => {});
tryTex("/images/galaxy/core-glow.webp", (tx) => { coreMat.map = tx; coreMat.needsUpdate = true; });
tryTex(PHONE ? "/images/galaxy/sky-1024.webp" : "/images/galaxy/sky.webp", (tx) => {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 24), new THREE.MeshBasicMaterial({ map: tx, side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0.85 }));
  sky.renderOrder = -1; scene.add(sky);
});

// block pulses: a ring out of the core for each block
const ringMat = new THREE.MeshBasicMaterial({ color: 0x5fe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
tryTex("/images/galaxy/ring.webp", (tx) => { ringMat.map = tx; ringMat.color.set(0xffffff); ringMat.needsUpdate = true; });
const rings = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128), ringMat.clone()); m.rotation.x = -Math.PI / 2; m.visible = false; m.userData.t = 9; world.add(m); return m; });
let ringNext = 0;
function pulse(big) { const m = rings[ringNext++ % rings.length]; m.userData.t = 0; m.userData.big = big; m.visible = true; }

// ---------------------------------------------------------------- hubs & contracts
const GROUPS = { circle: { name: "Circle", hue: 0.52, glow: "cyan" }, uniswap: { name: "Uniswap", hue: 0.88, glow: "violet" }, arcircle: { name: "ARCIRCLE", hue: 0.47, glow: "mint" }, launch: { name: "Launchpads", hue: 0.12, glow: "gold" }, infra: { name: "Smart accounts", hue: 0.62, glow: "cyan" }, token: { name: "Tokens", hue: 0.08, glow: "gold" }, other: { name: "Other contracts", hue: 0.72 } };
const HUBS = {}; ["circle", "uniswap", "arcircle", "launch", "infra", "token"].forEach((g, i) => { const th = i * (Math.PI * 2 / 6) + 0.6, r = 82; HUBS[g] = new THREE.Vector3(Math.cos(th) * r, 4, Math.sin(th) * r); });
let LABELS = {};
const CLAIMED = new Set(); // GX8: stars named by their own contract's owner
const NODE_MAX = PHONE ? 400 : 900;
const nodes = new Map(); // addr → { i, pos, g, count, heat, name }
const nodeCloud = cloud(NODE_MAX, (i, p, c, s, a) => { s[i] = 0; a[i] = 0; }, 1);
world.add(nodeCloud);
const nAttr = nodeCloud.geometry.attributes;
function nodePos(addr, g) {
  if (HUBS[g]) { const r = 7 + hash(addr, 1) * 13, th = hash(addr, 2) * Math.PI * 2; return HUBS[g].clone().add(new THREE.Vector3(Math.cos(th) * r, (hash(addr, 3) - 0.5) * 6, Math.sin(th) * r)); }
  const r = 26 + Math.pow(hash(addr, 1), 0.8) * 140, arm = Math.floor(hash(addr, 2) * ARMS), th = armTh(r, arm, (hash(addr, 3) - 0.5) * 0.5);
  return new THREE.Vector3(Math.cos(th) * r, (hash(addr, 4) - 0.5) * 5, Math.sin(th) * r);
}
function nodeOf(addr) {
  let n = nodes.get(addr);
  if (n) return n;
  if (nodes.size >= NODE_MAX) { // let the quietest go
    let q = null; for (const x of nodes.values()) if (!q || x.count + x.heat < q.count + q.heat) q = x;
    nodes.delete(q.addr); nAttr.size.array[q.i] = 0; n = { i: q.i };
  } else n = { i: nodes.size };
  const L = LABELS[addr], g = L ? L[1] : "other";
  Object.assign(n, { addr, g, name: L ? L[0] : null, pos: nodePos(addr, g), count: 0, heat: 0 });
  const col = new THREE.Color().setHSL((GROUPS[g] || GROUPS.other).hue, g === "other" ? 0.35 : 0.85, g === "other" ? 0.78 : 0.66);
  nAttr.position.setXYZ(n.i, n.pos.x, n.pos.y, n.pos.z); nAttr.color.setXYZ(n.i, col.r, col.g, col.b);
  nAttr.position.needsUpdate = nAttr.color.needsUpdate = true;
  nodes.set(addr, n); return n;
}
// hub glows
const hubSprites = {};
for (const [g, v] of Object.entries(HUBS)) {
  const col = new THREE.Color().setHSL(GROUPS[g].hue, 0.9, 0.6);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex([[0, "rgba(255,255,255,0.9)"], [0.15, `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.55)`], [1, "rgba(0,0,0,0)"]]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sp.position.copy(v); sp.scale.setScalar(26); world.add(sp); hubSprites[g] = sp;
  tryTex(`/images/galaxy/glow-${GROUPS[g].glow}.webp`, (tx) => { sp.material.map = tx; sp.material.needsUpdate = true; sp.scale.setScalar(34); });
}

// GX10: Meshy's art in the scene — a slowly turning sigil behind each family's hub, the stargate ring on every CCTP
// gate, and one-shot effects (a supernova where a contract is born, a wormhole opening at a gate when USDC crosses it)
const FXT = {}; const fxLoad = (k) => FXT[k] !== undefined ? FXT[k] : (FXT[k] = null, tryTex(`/images/galaxy/fx/${k}.webp`, (tx) => { FXT[k] = tx; }), null);
const EMBLEM = { circle: "em-payments", uniswap: "em-swap", launch: "em-launchpad", infra: "em-accounts", token: "em-tokens", other: "em-infra" };
const emblems = [];
if (!LOW) for (const [g, v] of Object.entries(HUBS)) {
  const k = EMBLEM[g]; if (!k) continue;
  tryTex(`/images/galaxy/fx/${k}.webp`, (tx) => {
    const col = new THREE.Color().setHSL(GROUPS[g].hue, 0.7, 0.42);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.2 }));
    sp.position.copy(v); sp.scale.setScalar(PHONE ? 50 : 60); world.add(sp); emblems.push({ sp, spin: (0.05 + Math.random() * 0.05) * (Math.random() < 0.5 ? -1 : 1), base: 0.2 });
  });
}
const fxs = []; let novaT = 0;
function fx(k, pos, s0, s1, life, col, spin = 0) {
  const tx = FXT[k] || fxLoad(k); if (!tx || REDUCED) return;
  if (fxs.length > (PHONE ? 6 : 14)) { const o = fxs.shift(); world.remove(o.sp); o.sp.material.dispose(); }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, color: col || 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  sp.position.copy(pos); sp.scale.setScalar(s0); world.add(sp); fxs.push({ sp, s0, s1, life, t: 0, spin, peak: k === "supernova" ? 0.55 : 0.8 });
}
function stepFx(dt) {
  for (const e of emblems) { e.sp.material.rotation += e.spin * dt; }
  for (let i = fxs.length - 1; i >= 0; i--) { const f = fxs[i]; f.t += dt; const u = Math.min(1, f.t / f.life);
    f.sp.scale.setScalar(f.s0 + (f.s1 - f.s0) * (1 - Math.pow(1 - u, 3))); f.sp.material.opacity = (u < 0.2 ? u / 0.2 : (1 - u) / 0.8) * f.peak; f.sp.material.rotation += f.spin * dt;
    if (u >= 1) { world.remove(f.sp); f.sp.material.dispose(); fxs.splice(i, 1); } }
}
["supernova", "wormhole", "gate"].forEach(fxLoad);
// ---------------------------------------------------------------- CCTP gates (GX2): the chains USDC comes from / goes to
// CCTP domains (config-arc.js BRIDGE + Solana); a gate sits on a far ring, lights up when USDC crosses it
const DOMAINS = { 0: ["Ethereum", 0x8a92b2], 1: ["Avalanche", 0xe84142], 2: ["OP Mainnet", 0xff0420], 3: ["Arbitrum", 0x28a0f0], 5: ["Solana", 0x9945ff], 6: ["Base", 0x3b82f6], 7: ["Polygon", 0x8247e5], 10: ["Unichain", 0xf50db4], 11: ["Linea", 0x61dfff], 13: ["Sonic", 0xfe9a4c], 14: ["World Chain", 0xc9ccd6], 15: ["Monad", 0x836ef9], 16: ["Sei", 0xc1272d], 19: ["HyperEVM", 0x50d2c1], 21: ["Ink", 0x7132f5] };
const gates = new Map();
function gateOf(d) {
  let g = gates.get(d); if (g) return g;
  const keys = Object.keys(DOMAINS).map(Number), i = Math.max(0, keys.indexOf(d)), th = (i / keys.length) * Math.PI * 2 + 0.3, r = 330;
  const info = DOMAINS[d] || ["Domain " + d, 0x9fb4d8], col = new THREE.Color(info[1]);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex([[0, "rgba(255,255,255,0.95)"], [0.18, `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.6)`], [1, "rgba(0,0,0,0)"]]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 }));
  const pos = new THREE.Vector3(Math.cos(th) * r, 26 + Math.sin(th * 3) * 18, Math.sin(th) * r);
  sp.position.copy(pos); sp.scale.setScalar(30); world.add(sp);
  g = { d, name: info[0], col, pos, sp, heat: 0, el: label("⇄ " + info[0], "gate") };
  const ring = () => { if (!FXT.gate) return false; const rs = new THREE.Sprite(new THREE.SpriteMaterial({ map: FXT.gate, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 })); rs.position.copy(pos); rs.scale.setScalar(44); world.add(rs); g.ring = rs; return true; };
  if (!LOW && !ring()) { const w = setInterval(() => { if (ring()) clearInterval(w); }, 800); setTimeout(() => clearInterval(w), 15000); }
  gates.set(d, g); return g;
}
// "+$1.2K" over a star when a transfer lands, and the whale banner
const pops = [];
function pop(text, pos, col) {
  if (pops.length > (PHONE ? 4 : 8)) { const o = pops.shift(); o.el.remove(); }
  const el = label(text, "pop"); el.style.color = "#" + col.getHexString(); pops.push({ el, pos: pos.clone(), t: 0 });
}
let shake = 0;
// GX10: a whale pulls the camera along for a moment (only while nobody is looking at something else), then home
let whaleCamT = 0;
function whaleCam(dest) {
  if (REDUCED || OBS || cardOf || follow || ptrs.size || orbit.idle < 6 || Date.now() - whaleCamT < 25000 || !dest) return;
  whaleCamT = Date.now(); orbit.want = { tgt: dest.clone(), d: 150 };
  setTimeout(() => { if (!cardOf && !follow) goHome(); }, 6500);
}
// the core's colour follows how busy Arc is against its ten-minute average: calm blue → busy magenta
let busyK = 0, busyWant = 0;
const CORE_CALM = new THREE.Color(0xbfe9ff), CORE_BUSY = new THREE.Color(0xff9ce8);
function busyTint(dt) { busyK += (busyWant - busyK) * Math.min(1, dt * 0.6); core.material.color.copy(CORE_CALM).lerp(CORE_BUSY, busyK); }
function whale(row, gate) {
  const el = $("gx-whale") || (() => { const d = document.createElement("div"); d.id = "gx-whale"; d.className = "gx-whale"; document.body.appendChild(d); return d; })();
  const k = row[4], where = gate ? (row[9][0] === "i" ? ` · ${t("from")} ${gate.name}` : ` · ${t("to")} ${gate.name}`) : "";
  el.innerHTML = `<b>🐋 ${fmtUsd(row[5])}${RH ? "" : " USDC"}</b><span>${esc(t(KINDS[k]))}${esc(where)}</span>`;
  el.className = "gx-whale"; void el.offsetWidth; el.classList.add("on"); document.body.classList.add("whaling");
  clearTimeout(el._t); clearTimeout(el._m);
  if (PHONE) el._m = setTimeout(() => el.classList.add("mini"), 2600); // GX6: on a phone it folds to a chip so the galaxy shows
  el._t = setTimeout(() => { el.classList.remove("on", "mini"); document.body.classList.remove("whaling"); }, 5200);
  shake = Math.max(shake, 0.9);
}

// ---------------------------------------------------------------- flying transactions
const TRAIL = LOW ? 5 : PHONE ? 8 : 12, CAP = LOW ? 500 : PHONE ? 900 : 2200;
const flyCloud = cloud(CAP * TRAIL, (i, p, c, s, a) => { s[i] = 0; a[i] = 0; }, 1);
world.add(flyCloud);
const fA = flyCloud.geometry.attributes;
const flies = []; const freeSlots = Array.from({ length: CAP }, (_, i) => CAP - 1 - i);
// comet streaks: one line segment between each pair of trail samples, all flies in ONE LineSegments (additive: black = gone)
const SEG = TRAIL - 1;
const streakGeo = new THREE.BufferGeometry(); streakGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(CAP * SEG * 6), 3)); streakGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(CAP * SEG * 6), 3));
const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); streaks.frustumCulled = false; world.add(streaks);
const sP = streakGeo.attributes.position, sC = streakGeo.attributes.color;
// short-lived links (a swap's route, a hovered star's wallets)
const LINKS = PHONE ? 120 : 360;
const linkGeo = new THREE.BufferGeometry(); linkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(LINKS * 6), 3)); linkGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(LINKS * 6), 3));
const linkMesh = new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); linkMesh.frustumCulled = false; world.add(linkMesh);
const links = []; let linkNext = 0;
function link(a, b, col, life = 1.4) { const i = linkNext++ % LINKS; links[i] = { a: a.clone(), b: b.clone(), col: col.clone(), t: 0, life }; }
function stepLinks(dt) {
  const P = linkGeo.attributes.position.array, Cc = linkGeo.attributes.color.array;
  for (let i = 0; i < LINKS; i++) { const l = links[i]; const o = i * 6; if (!l) { Cc[o] = Cc[o + 1] = Cc[o + 2] = Cc[o + 3] = Cc[o + 4] = Cc[o + 5] = 0; continue; }
    l.t += dt; const u = l.t / l.life; if (u >= 1) { links[i] = null; Cc.fill(0, o, o + 6); continue; }
    const k = Math.sin(Math.min(1, u * 3) * Math.PI / 2) * (1 - u) * 0.5;
    P[o] = l.a.x; P[o + 1] = l.a.y; P[o + 2] = l.a.z; P[o + 3] = l.b.x; P[o + 4] = l.b.y; P[o + 5] = l.b.z;
    Cc[o] = l.col.r * k; Cc[o + 1] = l.col.g * k; Cc[o + 2] = l.col.b * k; Cc[o + 3] = l.col.r * k * 0.4; Cc[o + 4] = l.col.g * k * 0.4; Cc[o + 5] = l.col.b * k * 0.4; }
  linkGeo.attributes.position.needsUpdate = linkGeo.attributes.color.needsUpdate = true;
}
const flash = cloud(PHONE ? 200 : 500, (i, p, c, s, a) => { s[i] = 0; a[i] = 0; }, 1); world.add(flash);
const flA = flash.geometry.attributes; let flashNext = 0; const flashes = [];
function walletPos(addr) {
  const u = hash(addr, 7) * 2 - 1, th = hash(addr, 8) * Math.PI * 2, r = 185 + hash(addr, 9) * 60, q = Math.sqrt(1 - u * u);
  return new THREE.Vector3(r * q * Math.cos(th), r * u * 0.32, r * q * Math.sin(th));
}
const WAL_MAX = LOW ? 600 : PHONE ? 1200 : 3000;
const walCloud = cloud(WAL_MAX, (i, p, c, s, a) => { s[i] = 0; a[i] = 0; }, 1); world.add(walCloud);
const wA = walCloud.geometry.attributes, wals = new Map(); let walNext = 0;
function walletSeen(addr, me) {
  let i = wals.get(addr);
  if (i == null) { i = walNext++ % WAL_MAX; for (const [a, j] of wals) if (j === i) { wals.delete(a); break; } wals.set(addr, i); const p = walletPos(addr); wA.position.setXYZ(i, p.x, p.y, p.z); tmpC.setHSL(0.55 + hash(addr, 12) * 0.12, 0.5, 0.8); wA.color.setXYZ(i, tmpC.r, tmpC.g, tmpC.b); wA.position.needsUpdate = wA.color.needsUpdate = true; }
  wA.size.array[i] = me ? 9 : 2.2; wA.alpha.array[i] = me ? 1 : 0.55; wA.size.needsUpdate = wA.alpha.needsUpdate = true;
}
function spark(pos, col, size, life) { const i = flashNext++ % flA.size.count; flA.position.setXYZ(i, pos.x, pos.y, pos.z); flA.color.setXYZ(i, col.r, col.g, col.b); flashes[i] = { t: 0, life, size }; flA.position.needsUpdate = flA.color.needsUpdate = true; }
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
function launch(row, speed = 1) {
  const [hash_, , from, to, k, usd, ok] = row;
  if (hidden.has(k) || !freeSlots.length) return false;
  let p0 = walletPos(from); walletSeen(from, from === follow);
  let p2, node = null, gate = null;
  const br = row[9];
  if (k === 2 && br) {                                                    // CCTP: from / to another chain's gate
    gate = gateOf(Number(br.slice(1)));
    gate.heat = 1;
    if (br[0] === "i") { p0 = gate.pos; node = nodeOf(to || "0x81d40f21f12a8f0e3252bccb954d722d4c464b64"); p2 = node.pos; }
    else p2 = gate.pos;
  }
  else if (!to) p2 = new THREE.Vector3(0, 0, 0);                         // a deployment flies into the core and a new star is born
  else if (k === 0 && !LABELS[to]) p2 = walletPos(to);                    // USDC between wallets: halo to halo, past the core
  else { node = nodeOf(to); p2 = node.pos; }
  const mid = tmpV.copy(p0).add(p2).multiplyScalar(0.5);
  const pull = node || !to ? 0.55 : 0.75;
  const p1 = mid.clone().multiplyScalar(1 - pull).add(new THREE.Vector3(0, 18 + hash(hash_, 5) * 30, 0));
  const big = usd >= 1e6; // ≥ $10,000
  const col = new THREE.Color(ok === 0 ? RED : row[11] ? AUTHC : KCOL[k]);
  const f = { slot: freeSlots.pop(), p0, p1, p2, t: 0, dur: (1.7 + hash(hash_, 6) * 1.1) / speed, col, size: (2.6 + Math.min(4.5, Math.log10(1 + usd / 100) * 1.1)) * (big ? 1.6 : 1) * (follow && (row[2] === follow || row[3] === follow) ? 1.8 : 1), node, row, big, me: follow && (row[2] === follow || row[3] === follow) };
  if (gate) { f.dur *= 1.6; f.size *= 1.3; f.gate = gate; fx("wormhole", gate.pos, 12, usd >= 1e7 ? 110 : 64, 1.8, gate.col, 2.4); }
  flies.push(f);
  spark(p0, col, f.size * (gate ? 3 : 1.4), gate ? 1.6 : 1.2);
  if (usd >= 1e7 && speed >= 1) { whale(row, gate); whaleCam(f.p2); }   // ≥ $100,000
  if (f.me || (big && flies.filter((x) => x.lb).length < (PHONE ? 2 : 5))) bigLabel(f);
  return true;
}
const bez = (out, a, b, c, u) => { const v = 1 - u; return out.set(v * v * a.x + 2 * v * u * b.x + u * u * c.x, v * v * a.y + 2 * v * u * b.y + u * u * c.y, v * v * a.z + 2 * v * u * b.z + u * u * c.z); };
function stepFlies(dt) {
  for (let j = flies.length - 1; j >= 0; j--) {
    const f = flies[j]; f.t += dt / f.dur;
    const base = f.slot * TRAIL;
    if (f.t >= 1) {
      for (let q = 0; q < TRAIL; q++) fA.alpha.array[base + q] = 0;
      sC.array.fill(0, f.slot * SEG * 6, (f.slot + 1) * SEG * 6);
      arrive(f);
      if (f.node) { f.node.heat = Math.min(6, f.node.heat + 1.2); } else if (!f.row[3]) pulseCore(0.6);
      spark(f.p2, f.col, f.size * (f.big ? 3 : 1.8), f.big ? 1.6 : 0.8);
      if (f.row[5] >= 1e5) pop("+" + fmtUsd(f.row[5]), f.p2, f.col);           // ≥ $1,000 lands with its amount
      if (f.row[5] >= 1e7) { spark(f.p2, new THREE.Color(0xffe08a), 60, 2.2); pulse(true); }
      if (f.gate) f.gate.heat = 1;
      freeSlots.push(f.slot); flies.splice(j, 1); if (f.lb) f.lb.remove(); continue;
    }
    const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 2) / 2;
    for (let q = 0; q < TRAIL; q++) {
      const u = Math.max(0, e - q * 0.022);
      bez(tmpV2, f.p0, f.p1, f.p2, u);
      fA.position.setXYZ(base + q, tmpV2.x, tmpV2.y, tmpV2.z);
      const fade = 1 - q / TRAIL;
      fA.color.setXYZ(base + q, f.col.r, f.col.g, f.col.b);
      fA.size.array[base + q] = f.size * (q === 0 ? 1.25 : 0.55 + 0.45 * fade);
      fA.alpha.array[base + q] = (q === 0 ? 1 : 0.55 * fade) * (e > 0.92 ? (1 - e) / 0.08 : 1);
    }
    if (f.lb) { f.lbPos = f.lbPos || new THREE.Vector3(); bez(f.lbPos, f.p0, f.p1, f.p2, e); }
    // the streak: segment q joins sample q and q+1, fading down the tail
    const so = f.slot * SEG * 6;
    for (let q = 0; q < SEG; q++) {
      const o = so + q * 6, i0 = (base + q) * 3, i1 = (base + q + 1) * 3, A = fA.position.array, fa = fA.alpha.array[base + q] * 0.9, fb = fA.alpha.array[base + q + 1] * 0.9;
      sP.array[o] = A[i0]; sP.array[o + 1] = A[i0 + 1]; sP.array[o + 2] = A[i0 + 2]; sP.array[o + 3] = A[i1]; sP.array[o + 4] = A[i1 + 1]; sP.array[o + 5] = A[i1 + 2];
      sC.array[o] = f.col.r * fa; sC.array[o + 1] = f.col.g * fa; sC.array[o + 2] = f.col.b * fa; sC.array[o + 3] = f.col.r * fb; sC.array[o + 4] = f.col.g * fb; sC.array[o + 5] = f.col.b * fb;
    }
  }
  sP.needsUpdate = sC.needsUpdate = true;
  fA.position.needsUpdate = fA.color.needsUpdate = fA.size.needsUpdate = fA.alpha.needsUpdate = true;
  for (let i = 0; i < flashes.length; i++) { const s = flashes[i]; if (!s) continue; s.t += dt; const u = s.t / s.life; if (u >= 1) { flA.alpha.array[i] = 0; flashes[i] = null; continue; } flA.size.array[i] = s.size * (1 + u * 1.5); flA.alpha.array[i] = (1 - u) * 0.9; }
  flA.size.needsUpdate = flA.alpha.needsUpdate = true;
  // contracts: size from their activity, a flare when something lands
  for (const n of nodes.values()) { if (n.born) continue; n.heat = Math.max(0, n.heat - dt * 1.5); nAttr.size.array[n.i] = 3 + Math.min(14, Math.sqrt(n.count) * 1.6) + n.heat * 2.2 + (n.addr === follow ? 6 : 0); nAttr.alpha.array[n.i] = 0.75 + Math.min(0.25, n.heat * 0.1); }
  nAttr.size.needsUpdate = nAttr.alpha.needsUpdate = true;
  const fi = follow ? wals.get(follow) : -1;
  for (let i = 0; i < WAL_MAX; i++) if (i !== fi && wA.alpha.array[i] > 0.16) wA.alpha.array[i] = Math.max(0.16, wA.alpha.array[i] - dt * 0.05);
  wA.alpha.needsUpdate = true;
}
// what happens where a transaction lands (GX3)
function arrive(f) {
  const r = f.row;
  if (r[6] === 0) { for (let i = 0; i < 6; i++) spark(tmpV.copy(f.p2).add(new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9)), RED, 2 + Math.random() * 2, 0.5 + Math.random() * 0.5); }
  if (r[4] === 5 && typeof r[10] === "string" && r[10][0] === "c") birth(r[10].slice(1));
  if (r[4] === 1 && Array.isArray(r[10]) && f.node && (r[5] >= 1e5 || f.me)) for (const a of r[10]) { const n = nodeOf(a); n.heat = Math.min(6, n.heat + 0.3); link(f.node.pos, n.pos, f.col, 1.3); }
  if (f.node && f.node.g === "arcircle") { spark(f.p2, new THREE.Color(0x4dffb0), 9, 1.1); f.node.heat = Math.min(6, f.node.heat + 1); }
  sound(r[4], r[6] === 0, r[5]);
}
// a new contract: a star condenses out of the core's light and flies to its place
const births = [];
function birth(addr) {
  const n = nodeOf(addr); n.count++; n.heat = 0; n.born = 0.001;
  births.push({ n, t: 0 }); bornList.push({ a: addr, at: Date.now() }); if (bornList.length > 30) bornList.shift();
  pulse(true); pop("✦ NEW " + short(addr), n.pos, new THREE.Color(0xffffff)); if (Date.now() - novaT > 1500) { novaT = Date.now(); fx("supernova", n.pos, 4, PHONE ? 30 : 40, 1.6, 0xbfe9ff, 0.6); }
}
function stepBirths(dt) {
  for (let i = births.length - 1; i >= 0; i--) { const b = births[i]; b.t += dt; const u = Math.min(1, b.t / 1.8);
    nAttr.size.array[b.n.i] = (3 + Math.sin(u * Math.PI) * 18) * u; nAttr.alpha.array[b.n.i] = u;
    if (Math.random() < 0.5) spark(tmpV.copy(b.n.pos).add(new THREE.Vector3((Math.random() - 0.5) * 24 * (1 - u), (Math.random() - 0.5) * 12 * (1 - u), (Math.random() - 0.5) * 24 * (1 - u))), new THREE.Color(0xffffff), 2.5, 0.4);
    if (u >= 1) { b.n.born = 0; births.splice(i, 1); } }
}
let coreKick = 0; const pulseCore = (k) => { coreKick = Math.min(1.5, coreKick + k); };

// ---------------------------------------------------------------- camera: orbit, zoom, fly to
const orbit = { th: 0.6, ph: 1.05, d: PHONE ? 470 : 340, tgt: new THREE.Vector3(), want: null, spin: true, idle: 0 };
const HOME = { th: 0.6, ph: 1.05, d: PHONE ? 470 : 340 };
function placeCam() { const s = Math.sin(orbit.ph); cam.position.set(orbit.tgt.x + orbit.d * s * Math.cos(orbit.th), orbit.tgt.y + orbit.d * Math.cos(orbit.ph), orbit.tgt.z + orbit.d * s * Math.sin(orbit.th)); cam.lookAt(orbit.tgt); }
const ptrs = new Map(); let pinch0 = 0, d0 = 0, moved = 0;
canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; orbit.idle = 0; orbit.want = null; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); d0 = orbit.d; } });
canvas.addEventListener("pointermove", (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  if (ptrs.size === 1) { const dx = e.clientX - p.x, dy = e.clientY - p.y; moved += Math.abs(dx) + Math.abs(dy); orbit.th += dx * 0.005; orbit.ph = Math.min(1.5, Math.max(0.18, orbit.ph - dy * 0.004)); }
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) orbit.d = Math.min(900, Math.max(40, d0 * pinch0 / d)); moved = 99; }
});
const up = (e) => { const was = ptrs.size; ptrs.delete(e.pointerId); if (was === 1 && moved < 6) pick(e.clientX, e.clientY); };
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", (e) => ptrs.delete(e.pointerId));
canvas.addEventListener("wheel", (e) => { e.preventDefault(); orbit.idle = 0; orbit.d = Math.min(900, Math.max(40, orbit.d * Math.exp(e.deltaY * 0.001))); }, { passive: false });
function flyTo(pos, d) { orbit.want = { tgt: pos.clone(), d }; }
function goHome() { orbit.want = { tgt: new THREE.Vector3(), d: HOME.d }; }
// tap a star → its card
function pick(x, y) {
  let best = null, bd = 28 * 28;
  for (const n of nodes.values()) { tmpV.copy(n.pos).applyMatrix4(world.matrixWorld).project(cam); if (tmpV.z > 1) continue; const sx = (tmpV.x + 1) / 2 * innerWidth, sy = (1 - tmpV.y) / 2 * innerHeight, d = (sx - x) ** 2 + (sy - y) ** 2; if (d < bd) { bd = d; best = n; } }
  if (best) showContract(best.addr);
}

// ---------------------------------------------------------------- HTML labels over the 3D
const LB = $("gx-labels"); const lbs = [];
function label(text, cls) { const el = document.createElement("div"); el.className = "gx-lb " + (cls || ""); el.textContent = text; LB.appendChild(el); return el; }
const hubLabels = Object.keys(HUBS).map((g) => ({ el: label(GROUPS[g].name, "hub"), pos: HUBS[g] }));
let topLabels = [];
function bigLabel(f) { f.lb = label(f.me ? "● " + (f.row[5] ? fmtUsd(f.row[5]) : t(KINDS[f.row[4]])) : fmtUsd(f.row[5]) + (RH ? "" : " USDC"), f.me ? "me" : "big"); }
function placeLabel(el, pos, must) {
  tmpV.copy(pos).applyMatrix4(world.matrixWorld).project(cam);
  if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1) { el.style.display = "none"; return; }
  const x = ((tmpV.x + 1) / 2 * innerWidth) | 0, y = ((1 - tmpV.y) / 2 * innerHeight) | 0, w = (el._w || (el._w = el.offsetWidth || 80)) / 2 + 4;
  if (!must && taken.some((q) => Math.abs(q[0] - x) < q[2] + w && Math.abs(q[1] - y) < 16)) { el.style.display = "none"; return; }
  taken.push([x, y, w]);
  el.style.display = ""; el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -140%)`;
}
let taken = [];
function paintLabels() {
  taken = [];
  for (const h of hubLabels) placeLabel(h.el, h.pos, 1);
  for (const f of flies) if (f.lb && f.lbPos) placeLabel(f.lb, f.lbPos, f.me ? 1 : 0);
  for (const g of gates.values()) { if (g.heat > 0.05) placeLabel(g.el, g.pos, 1); else g.el.style.display = "none"; }
  for (const p of pops) { tmpV2.copy(p.pos); tmpV2.y += p.t * 14; placeLabel(p.el, tmpV2, 0); p.el.style.opacity = String(Math.max(0, 1 - p.t / 1.6)); }
  const far = orbit.d > 300; topLabels.forEach((l, i) => { if (far && i >= (PHONE ? 2 : 4)) { l.el.style.display = "none"; return; } placeLabel(l.el, l.n.pos, 0); });
}

// ---------------------------------------------------------------- the feed
const seen = new Set(); const queue = []; let skew = 0, lastStats = null, lastTop = [], head = 0, mode = "connect", replayUntil = 0, failN = 0;
const recent = []; // rows already played (for the card, the follow list and the quiet replays)
let follow = null;
async function poll() {
  let j;
  try {
    if (DEMO) j = demoFeed();
    else { const r = await fetch(FEED, { cache: "no-store" }); if (!r.ok) throw new Error("http " + r.status); j = await r.json(); }
    if (!j || !Array.isArray(j.rows)) throw new Error("bad feed");
    failN = 0; take(j);
  } catch (e) {
    failN++; setLive(false);
    if (failN >= 2) note(t("bad"));
  }
  setTimeout(poll, document.hidden ? 8000 : failN ? Math.min(15000, 2000 * 2 ** failN) : POLL_MS);
}
function relabel() {
  for (const n of nodes.values()) {
    const L = LABELS[n.addr]; if (!L || (n.name === L[0] && n.g === L[1])) continue;
    n.name = L[0];
    if (n.g !== L[1]) { n.g = L[1]; n.pos = nodePos(n.addr, n.g); nAttr.position.setXYZ(n.i, n.pos.x, n.pos.y, n.pos.z); const col = new THREE.Color().setHSL((GROUPS[n.g] || GROUPS.other).hue, 0.85, 0.66); nAttr.color.setXYZ(n.i, col.r, col.g, col.b); nAttr.position.needsUpdate = nAttr.color.needsUpdate = true; }
  }
}
// GX9: records (today / ever, as ARC GALAXY has seen them), a new one gets the banner; the next million-block milestone
let lastRec = null, headSeen = 0;
function banner(html, cls, ms = 5200) {
  const el = $("gx-whale") || (() => { const d = document.createElement("div"); d.id = "gx-whale"; d.className = "gx-whale"; document.body.appendChild(d); return d; })();
  el.className = "gx-whale " + (cls || ""); el.innerHTML = html;
  void el.offsetWidth; el.classList.add("on"); document.body.classList.add("whaling");
  clearTimeout(el._t); clearTimeout(el._m); el._t = setTimeout(() => { el.classList.remove("on"); document.body.classList.remove("whaling"); }, ms);
}
function paintRecords(r) {
  if (!r || !r.ever) return;
  let el = $("gx-rec"); if (!el) { el = document.createElement("div"); el.id = "gx-rec"; el.className = "gx-rec"; $("gx-legend").appendChild(el); }
  const fmtTps = (v) => (v / 100).toFixed(1), td = r.today || {}, ev = r.ever || {};
  const line = (k, lab, f) => ev[k] ? `<dt>${esc(t(lab))}</dt><dd>${td[k] ? `<b>${f(td[k][0])}</b> ${esc(t("today"))} · ` : ""}${f(ev[k][0])} ${esc(t("ever"))}</dd>` : "";
  el.innerHTML = `<h2>🏆 ${esc(t("records"))}</h2><dl>${line("usd", "recUsd", (v) => fmtUsd(v))}${line("block", "recBlock", (v) => fmtN(v) + " tx")}${line("tps", "recTps", fmtTps)}</dl>${ev.usd ? `<button type="button" class="gx-recgo" data-tx="${ev.usd[1]}">↗ ${esc(t("recSee"))}</button>` : ""}<p class="gx-hint">${esc(t("recHint"))}</p>`;
  if (lastRec && lastRec.ever) {
    for (const [k, lab, f] of [["usd", "recUsd", (v) => fmtUsd(v) + (RH ? "" : " USDC")], ["block", "recBlock", (v) => fmtN(v) + " tx"], ["tps", "recTps", (v) => (v / 100).toFixed(1) + " tx/s"]]) {
      const a = lastRec.ever[k], b = ev[k];
      if (b && (!a || b[0] > a[0]) && a) { banner(`<b>🏆 ${esc(t("newRec"))}</b><span>${esc(t(lab))}: ${esc(f(b[0]))}</span>`, "rec"); shake = Math.max(shake, 0.7); spark(core.position, new THREE.Color(0xffd166), 90, 1.8); break; }
    }
  }
  lastRec = JSON.parse(JSON.stringify(r));
}
$("gx-legend").addEventListener("click", (e) => { const b = e.target.closest("[data-tx]"); if (b) findTx(b.dataset.tx); });
function milestone(head, bt) {
  if (!head) return;
  const next = Math.ceil((head + 1) / 1e6) * 1e6, left = next - head, prev = next - 1e6;
  if (headSeen && headSeen < prev && head >= prev) {
    let done = ""; try { done = localStorage.getItem("arc.galaxy.mile") || ""; } catch {}
    if (done !== String(prev)) {
      try { localStorage.setItem("arc.galaxy.mile", String(prev)); } catch {}
      banner(`<b>🎉 ${esc(t("mileNow").replace("{n}", prev.toLocaleString("en-US")))}</b><span>arcircle.app/galaxy</span>`, "mile", 9000);
      shake = 1.2; for (let i = 0; i < 6; i++) setTimeout(() => spark(core.position, new THREE.Color().setHSL(Math.random(), 0.9, 0.65), 120 + i * 30, 2.2), i * 180);
      try { sound(5, false, 1e7); } catch {}
    }
  }
  headSeen = head;
  let el = $("gx-mile");
  if (left > 2e6) { if (el) el.remove(); return; }
  const secs = left * (bt || 0.5), hh = Math.floor(secs / 3600), mm = Math.floor((secs % 3600) / 60), ss = Math.floor(secs % 60);
  const eta = hh ? `${hh} h ${mm} m` : mm ? `${mm} m ${ss} s` : `${ss} s`;
  if (!el) { el = document.createElement("div"); el.id = "gx-mile"; el.className = "gx-mile"; $("gx-legend").prepend(el); }
  el.classList.toggle("soon", secs < 600);
  el.innerHTML = `🎯 ${esc(t("mileIn").replace("{n}", next.toLocaleString("en-US")).replace("{t}", eta))}`;
  document.body.classList.toggle("milesoon", secs < 120);
}
function take(j) {
  if (j.labels) { Object.assign(LABELS, j.labels); relabel(); }
  if (j.records) paintRecords(j.records);
  if (j.head) milestone(j.head, j.stats && j.stats.blockTime);
  if (Array.isArray(j.claimed)) for (const a of j.claimed) CLAIMED.add(a);
  if (j.warming && mode === "connect") splashSay(t("warming"));
  skew = (j.at || Date.now()) - Date.now();
  const first = mode === "connect";
  const rows = j.rows.filter((r) => !seen.has(r[0]));
  // a block's time: its timestamp, with blocks inside one second spread by the block time
  const bt = (j.stats && j.stats.blockTime) || 0.5, perSec = new Map();
  rows.sort((a, b) => a[1] - b[1]);
  for (const r of rows) {
    seen.add(r[0]);
    const k = r[8] + "", s = perSec.get(k) || { n0: r[1] }; perSec.set(k, s);
    r.when = r[8] + Math.min(950, (r[1] - s.n0) * bt * 1000) + (hash(r[0], 11) * 0.35 * bt * 1000);
    queue.push(r);
  }
  if (seen.size > 40000) { const keep = new Set(queue.map((r) => r[0])); seen.clear(); keep.forEach((h) => seen.add(h)); }
  queue.sort((a, b) => a.when - b.when);
  if (first) {
    // open with the last two minutes, fast
    mode = "replay"; replayUntil = performance.now() + REPLAY_S * 1000;
    const span = queue.length ? queue[queue.length - 1].when - queue[0].when : 0, t0 = queue.length ? queue[0].when : 0, nowS = performance.now();
    replayPlan = queue.splice(0).map((r) => ({ r, at: nowS + (span > 0 ? ((r.when - t0) / span) * REPLAY_S * 1000 : 0) }));
    if (!DEMO) note(t("replay"), false, REPLAY_S * 1000);
  }
  if (j.head && j.head !== head) {
    pulse(rows.length > 40); head = j.head; beat();
    const bEl = $("gx-block"); bEl.textContent = "#" + head.toLocaleString("en-US"); bEl.classList.remove("roll"); void bEl.offsetWidth; bEl.classList.add("roll");
    // the busiest stars breathe with each block, even when it brought nothing
    (j.top || []).slice(0, 4).forEach(([a], i) => { const n = nodes.get(a); if (n) setTimeout(() => { n.heat = Math.min(6, n.heat + 0.5); }, 120 * i); });
  }
  lastStats = j.stats; lastTop = j.top || []; lastBlocks = j.blocks || lastBlocks;
  setLive(!j.stale); paintStats(); paintTop(); paintLegend();
  if (j.sampled) $("gx-live-t").title = "busy: a sample of the transactions is drawn";
}
let replayPlan = [];
// GX12: how many times ARC GALAXY has been opened, all told — this page counts once when it opens (a reload counts
// again; api/_arc-galaxy.mjs makeViews), and the total is read again every VIEWS_POLL; automated browsers don't count
// (unless ?viewtest), nor a saved feed (?src)
const VIEWS_POLL = 60e3;
let viewsN = 0;
function paintViews(n) {
  const el = $("gx-views"); if (!el || !(n >= 1)) return;
  el.hidden = false; $("gx-views-n").textContent = n.toLocaleString("en-US"); el.title = n.toLocaleString("en-US") + " " + t("views");
  if (n !== viewsN && viewsN) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
  viewsN = n;
}
const viewsReal = !(navigator.webdriver && !Q.has("viewtest")) && !Q.get("src");
async function viewsHit() {
  try { const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "arc-galaxy-view" }) }); const j = r.ok ? await r.json() : null; if (j && j.views != null) paintViews(j.views); } catch {}
}
async function viewsRead() {
  if (document.hidden) return;
  try { const r = await fetch("/api/social?arc=galaxy-lite"); const j = r.ok ? await r.json() : null; if (j && j.views != null) paintViews(j.views); } catch {}
}
if (viewsReal) setTimeout(viewsHit, 1200); else setTimeout(viewsRead, 1200);
setInterval(viewsRead, VIEWS_POLL);
window.__gxViews = paintViews; // tests
function setLive(on) { const el = $("gx-live"); el.classList.toggle("on", on); el.classList.toggle("bad", !on && mode !== "connect"); if (on) $("gx-live-t").textContent = mode === "replay" ? t("replay") : t("live"); }

let lastLaunch = performance.now(), quietPlan = [];
function feedTick(now) {
  if (mode === "replay") {
    while (replayPlan.length && replayPlan[0].at <= now) { const { r } = replayPlan.shift(); played(r); launch(r, 1.6); }
    if (!replayPlan.length && now >= replayUntil) { mode = "live"; setLive(true); }
    return;
  }
  const tNow = Date.now() + skew - LAG_MS;
  let n = 0;
  while (queue.length && queue[0].when <= tNow) { const r = queue.shift(); played(r); launch(r); lastLaunch = now; if (++n > 120) break; }
  if (queue.length > 4000) queue.splice(0, queue.length - 4000);
  // a quiet chain: replay what we saw, labelled, so the galaxy doesn't stand still
  if (now - lastLaunch > 9000 && recent.length > 5) {
    if (!quietPlan.length) { quietPlan = recent.slice(-80).map((r, i) => ({ r, at: now + i * 250 })); if (!DEMO) note(t("quiet"), false, 6000); }
  }
  while (quietPlan.length && quietPlan[0].at <= now) { const { r } = quietPlan.shift(); launch(r, 0.8); if (!quietPlan.length) lastLaunch = now; }
  if (queue.length && queue[0].when <= tNow + 200) quietPlan = [];
}
function played(r) {
  recent.push(r); if (recent.length > 3000) recent.splice(0, 1000);
  if (r[3] && !(r[4] === 0 && !LABELS[r[3]])) { const n = nodeOf(r[3]); n.count++; }
  tapeAdd(r);
  if (follow && (r[2] === follow || r[3] === follow)) {
    if (cardOf === follow) showFollow(follow, true);
    try { if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification("ARC GALAXY", { body: `${short(follow)}: ${t(KINDS[r[4]])}${r[5] ? " · " + fmtUsd(r[5]) : ""}`, icon: "/images/brand/favicon-v2-32.png", tag: "gx-" + r[0] }); } catch {}
  }
}

// ---------------------------------------------------------------- panels
// GX5: numbers roll to their new value; tx/s, USDC and txs get a sparkline of the last ten minutes; tx/s shows ▲▼ vs the 10-min average
let lastBlocks = [];
function roll(el, v, fmt) {
  if (v == null || !isFinite(v)) { el.textContent = "–"; return; }
  const from = el._v == null ? v : el._v, t0 = performance.now(); el._v = v; cancelAnimationFrame(el._raf);
  const step = (now) => { const u = Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - u, 3); el.textContent = fmt(from + (v - from) * e); if (u < 1) el._raf = requestAnimationFrame(step); };
  el._raf = requestAnimationFrame(step);
}
function sparkline(id, vals, col) {
  const box = $(id).parentElement; let sv = box.querySelector("svg.sp");
  if (!sv) { sv = document.createElementNS("http://www.w3.org/2000/svg", "svg"); sv.setAttribute("class", "sp"); sv.setAttribute("viewBox", "0 0 100 24"); sv.setAttribute("preserveAspectRatio", "none"); box.appendChild(sv); box.classList.add("sp"); }
  if (vals.length < 2) { sv.innerHTML = ""; return; }
  const mx = Math.max(...vals, 1e-9), pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 100},${22 - (v / mx) * 20}`).join(" ");
  sv.innerHTML = `<polyline points="0,24 ${pts} 100,24" fill="${col}22" stroke="none"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
}
function buckets(n, col) {
  const b = lastBlocks; if (b.length < 4) return [];
  const t0 = b[0][1], t1 = b[b.length - 1][1], w = Math.max(1, (t1 - t0) / n), out = new Array(n).fill(0);
  for (const x of b) out[Math.min(n - 1, Math.floor((x[1] - t0) / w))] += x[col];
  return out;
}
function paintStats() {
  const s = lastStats; if (!s) return;
  const tps = s.tps1m != null ? s.tps1m : s.tps;
  if (s.tps1m != null && s.tps) busyWant = Math.max(0, Math.min(1, (s.tps1m / s.tps - 1) * 1.5));
  roll($("s-tps"), tps, (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1)));
  if (s.tps1m != null && s.tps) { const d = (s.tps1m / s.tps - 1) * 100, lab = $("s-tps").nextElementSibling; let em = lab.querySelector("em"); if (!em) { em = document.createElement("em"); lab.appendChild(em); } em.className = d >= 0 ? "up" : "dn"; em.textContent = ` ${d >= 0 ? "▲" : "▼"}${Math.abs(d).toFixed(0)}%`; }
  roll($("s-usd"), (s.usd10m || 0), (v) => fmtUsd(v));
  roll($("s-txs"), s.txs, (v) => fmtN(v));
  sparkline("s-tps", buckets(20, 2), "#3ce6ff"); sparkline("s-usd", buckets(20, 4), "#ffd166"); sparkline("s-txs", buckets(20, 2), "#4dffb0");
  $("s-bt").textContent = s.blockTime != null ? (s.blockTime < 1 ? Math.round(s.blockTime * 1000) + " ms" : s.blockTime.toFixed(1) + " s") : "–";
  $("s-ok").textContent = s.failRate != null ? ((1 - s.failRate) * 100).toFixed(1) + "%" : "–";
  $("s-w").textContent = fmtN(s.wallets);
  if (!PHONE) { const lg = $("gx-legend"), sb = $("gx-stats").getBoundingClientRect().bottom; if (lg && sb > 0) { lg.style.top = Math.round(sb + 12) + "px"; lg.style.maxHeight = Math.max(160, innerHeight - sb - 12 - 118) + "px"; lg.style.overflowY = "auto"; } }
  // GX7: fees are paid in USDC on Arc (millionths of a dollar from the server); signed EIP-3009 payments (x402 / agents)
  const fmtFee = (m) => m == null ? "–" : m >= 1e6 ? "$" + (m / 1e6).toFixed(2) : m >= 1e4 ? "$" + (m / 1e6).toFixed(3) : "$" + (m / 1e6).toFixed(4);
  if ($("s-fee")) { roll($("s-fee"), s.feeTxs ? s.fee10m / s.feeTxs : null, fmtFee); roll($("s-fees"), s.feeTxs ? s.fee10m : null, fmtFee); roll($("s-auth"), s.auth10m != null ? s.auth10m : null, (v) => fmtN(Math.round(v))); }
}
function paintLegend() {
  const ul = $("gx-kinds"), k = (lastStats && lastStats.kinds) || [];
  ul.innerHTML = KINDS.map((name, i) => `<li class="${hidden.has(i) ? "off" : ""}"><button type="button" data-k="${i}" style="color:${kcss(i)}"><i></i><span style="color:var(--ink)">${esc(t(name))}</span><em>${fmtN(k[i] || 0)}</em></button></li>`).join("");
}
$("gx-kinds").addEventListener("click", (e) => { const b = e.target.closest("button[data-k]"); if (!b) return; const k = +b.dataset.k; hidden.has(k) ? hidden.delete(k) : hidden.add(k); paintLegend(); });
function nameOf(a) { return (LABELS[a] && LABELS[a][0]) || short(a); }
let rankTab = "c";
function rankRows() {
  if (rankTab === "w") { const m = new Map(); for (const r of recent) m.set(r[2], (m.get(r[2]) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a, c]) => [a, c, "w"]); }
  if (rankTab === "t") return [...nodes.values()].filter((n) => n.g === "token").sort((a, b) => b.count - a.count).slice(0, 10).map((n) => [n.addr, n.count, "c"]);
  if (rankTab === "n") return births.concat(bornList).slice(-10).reverse().map((b) => [b.n ? b.n.addr : b.a, 1, "c", true]);
  return lastTop.slice(0, 10).map(([a, c]) => [a, c, "c"]);
}
const bornList = [];
function paintTop() {
  const ol = $("gx-top"); if (!ol) return;
  if (rankTab !== "c") {
    const rs = rankRows();
    if (!rs.length) { ol.innerHTML = `<li class="gx-empty">${esc(t(rankTab === "n" ? "noNew" : "none"))}</li>`; return; }
    const mx = Math.max(...rs.map((r) => r[1]), 1);
    ol.innerHTML = rs.map(([a, c, kind, isNew]) => `<li class="${a === cardOf ? "sel" : ""}"><button type="button" data-${kind === "w" ? "w" : "a"}="${a}"><span class="n">${esc(kind === "w" ? short(a) : nameOf(a))}${!isNew && LABELS[a] ? `<small>${short(a)}</small>` : ""}</span><span class="c">${isNew ? "✦" : fmtN(c)}</span><span class="bar" style="width:${Math.max(4, (c / mx) * 100)}%"></span></button></li>`).join("");
    return;
  }
  if (!lastTop.length) { ol.innerHTML = `<li class="gx-empty">${esc(t("none"))}</li>`; return; }
  const max = lastTop[0][1];
  ol.innerHTML = lastTop.slice(0, 10).map(([a, c]) => `<li class="${a === cardOf ? "sel" : ""}"><button type="button" data-a="${a}"><span class="n">${esc(nameOf(a))}${LABELS[a] ? `<small>${short(a)}</small>` : ""}</span><span class="c">${fmtN(c)}</span><span class="bar" style="width:${Math.max(4, (c / max) * 100)}%"></span></button></li>`).join("");
  // the top 8 named in the 3D too
  topLabels.forEach((l) => l.el.remove());
  topLabels = lastTop.slice(0, PHONE ? 4 : 8).map(([a]) => ({ el: label(nameOf(a)), n: nodeOf(a) }));
}
$("gx-top").addEventListener("click", (e) => { const w = e.target.closest("button[data-w]"); if (w) { $("gx-q").value = w.dataset.w; doFollow(); return; } const b = e.target.closest("button[data-a]"); if (b) { $("gx-topc").classList.remove("open"); document.body.classList.remove("topopen"); showContract(b.dataset.a); } });

const tape = $("gx-tape"); let tapeBuf = [];
// the tape shows one transaction every 0.4 s at most: the most interesting of what flew since (big USDC, bridges,
// new contracts, failures, the followed address), so it stays readable on a busy chain
const tapeScore = (r) => (follow && (r[2] === follow || r[3] === follow) ? 1e15 : 0) + r[5] + [0, 2e4, 6e4, 0, 3e4, 8e4, 0, 0][r[4]] + (r[6] === 0 ? 4e4 : 0) + (r[11] ? 5e4 : 0) + Math.random();
function tapeAdd(r) { tapeBuf.push(r); if (tapeBuf.length > 400) tapeBuf.splice(0, 200); }
setInterval(() => { if (!tapeBuf.length || document.hidden) return; let b = tapeBuf[0]; for (const r of tapeBuf) if (tapeScore(r) > tapeScore(b)) b = r; tapeBuf = []; tapeShow(b); }, 900);
function tapeShow(r) {
  const [h, , from, to, k, usd, ok] = r;
  const a = document.createElement("a");
  a.className = "gx-tx" + (ok === 0 ? " fail" : "") + (follow && (from === follow || to === follow) ? " me" : "");
  a.href = `${EXPLORER}/tx/${h}`; a.target = "_blank"; a.rel = "noopener";
  const br = r[9], gname = br && DOMAINS[Number(br.slice(1))] ? DOMAINS[Number(br.slice(1))][0] : null;
  const path = gname ? (br[0] === "i" ? `${gname} → Arc · ${short(to || from)}` : `${short(from)} → ${gname}`) : `${short(from)} → ${to ? nameOf(to) : t("deploy")}`;
  if (r[11]) a.classList.add("auth");
  a.innerHTML = `<span class="k" style="color:${r[11] ? "#ff9a3c" : kcss(k)}"><i></i>${esc(r[11] ? t("authK") : t(KINDS[k]))}${ok === 0 ? " · " + esc(t("failed")) : ""}${usd ? `<em>${fmtUsd(usd)}</em>` : ""}</span><span class="p">${esc(path)}</span>`;
  if (usd >= 1e7) a.classList.add("whale");
  tape.prepend(a);
  while (tape.children.length > 28) tape.lastChild.remove();
}

// the card: a contract, or a followed wallet
let cardOf = null;
const card = $("gx-card");
function closeCard() { card.hidden = true; cardOf = null; document.body.classList.remove("carded"); paintTop(); }
function cardShell(title, addr, body, link) {
  if (PHONE && !document.body.classList.contains("pt-live")) { const lt = document.querySelector("[data-pt=live]"); if (lt) lt.click(); }
  card.innerHTML = `<button class="x" type="button" aria-label="Close">×</button><h3>${esc(title)}</h3><div class="ad">${esc(addr)}</div>${body}<div class="ln"><a href="${link || `${EXPLORER}/address/${addr}`}" target="_blank" rel="noopener">${esc(t("openExp"))} ↗</a><a href="#" data-copy="${addr}">${esc(t("copy"))}</a></div>`;
  card.hidden = false; document.body.classList.add("carded");
}
card.addEventListener("click", (e) => {
  if (e.target.closest(".x")) { e.preventDefault(); closeCard(); if (follow) { follow = null; } goHome(); return; }
  const c = e.target.closest("[data-copy]"); if (c) { e.preventDefault(); navigator.clipboard && navigator.clipboard.writeText(c.dataset.copy).then(() => { c.textContent = t("copied"); }); }
  const sh = e.target.closest("[data-share]"); if (sh) { e.preventDefault(); shareStar(sh.dataset.share, sh); }
  const cl = e.target.closest("[data-claim]"); if (cl) { e.preventDefault(); claimForm(cl.dataset.claim); }
});
function rowsOf(a) { return recent.filter((r) => r[2] === a || r[3] === a); }
function kindsHtml(rs) { const n = new Array(KINDS.length).fill(0); rs.forEach((r) => n[r[4]]++); return n.map((c, i) => (c ? `<li style="color:${kcss(i)}"><i></i><span style="color:var(--ink)">${esc(t(KINDS[i]))} · ${c}</span></li>` : "")).join(""); }
function showContract(a) {
  const n = nodeOf(a), rs = rowsOf(a), usd = rs.reduce((s, r) => s + (r[5] || 0), 0), top = lastTop.find((x) => x[0] === a);
  cardOf = a;
  const c10 = top ? top[1] : n.count, cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const now2 = Date.now() + skew, bars = new Array(12).fill(0); for (const r of rs) { const i = 11 - Math.floor((now2 - r[8]) / 10000); if (i >= 0 && i < 12) bars[i]++; }
  const bm = Math.max(...bars, 1), chart = `<div class="gx-mini">${bars.map((v) => `<i style="height:${Math.max(6, (v / bm) * 100)}%"></i>`).join("")}</div>`;
  cardShell(nameOf(a) === short(a) ? cap(t("contract")) + " " + short(a) : nameOf(a), a, chart + `<dl><dt>${esc(t("txs10"))}</dt><dd>${fmtN(c10)}</dd>${rs.length !== c10 ? `<dt>${esc(t("txsSeen"))} · ${esc(t("lastMin"))}</dt><dd>${fmtN(rs.length)}</dd>` : ""}${usd ? `<dt>USDC · ${esc(t("lastMin"))}</dt><dd>${fmtUsd(usd)}</dd>` : ""}</dl><ul>${kindsHtml(rs)}</ul>`);
  card.insertAdjacentHTML("beforeend", `${CLAIMED.has(a) ? `<p class="gx-claimed">✓ ${esc(t("claimedBy"))}</p>` : ""}<div class="gx-cact"><button type="button" data-share="${a}">🔗 ${esc(t("shareStar"))}</button>${RH || (LABELS[a] && !CLAIMED.has(a) && LABELS[a][1] !== "other" && LABELS[a][1] !== "token") ? "" : `<button type="button" data-claim="${a}">✎ ${esc(t(CLAIMED.has(a) ? "rename" : "claim"))}</button>`}</div>`);
  flyTo(n.pos, 70); paintTop();
}
// GX8: share a star (its own page /galaxy/c/<address>, with its own link card), and name it as its owner
function shareStar(a, btn) {
  const url = `${location.origin}/galaxy/c/${a}`, text = `${nameOf(a)} on ARC GALAXY — live on @Arc`;
  if (navigator.share && PHONE) { navigator.share({ title: "ARC GALAXY", text, url }).catch(() => {}); return; }
  try { navigator.clipboard.writeText(url); } catch {}
  btn.textContent = "✓ " + t("copiedLink");
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
}
function claimForm(a) {
  const box = document.createElement("form"); box.className = "gx-claimf";
  box.innerHTML = `<p>${esc(t("claimHint"))}</p><input name="n" maxlength="28" placeholder="${esc(t("claimName"))}" value="${esc(CLAIMED.has(a) ? nameOf(a) : "")}"><button type="submit">${esc(t("claimBtn"))}</button><p class="gx-claimst" aria-live="polite"></p>`;
  const old = card.querySelector(".gx-claimf"); if (old) old.remove();
  card.querySelector(".gx-cact").after(box); box.querySelector("input").focus();
  box.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = box.querySelector("input").value.trim(), st = box.querySelector(".gx-claimst"), eth = window.ethereum;
    if (name.length < 2) { st.textContent = t("claimName"); return; }
    if (!eth || !eth.request) { st.textContent = t("noWallet"); return; }
    try {
      st.textContent = "…";
      const [acct] = await eth.request({ method: "eth_requestAccounts" });
      const issued = new Date().toISOString();
      const msg = `ARC GALAXY — name a star\nContract: ${a}\nName: ${name}\nIssued: ${issued}`;
      const hexMsg = "0x" + Array.from(new TextEncoder().encode(msg), (b) => b.toString(16).padStart(2, "0")).join("");
      const sig = await eth.request({ method: "personal_sign", params: [hexMsg, acct] });
      const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "arc-galaxy-claim", addr: a, name, issued, sig, net: NET }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { st.textContent = j.error || "error " + r.status; return; }
      LABELS[a] = [j.name, (LABELS[a] && LABELS[a][1]) || "other"]; CLAIMED.add(a); relabel(); showContract(a);
      note("✓ " + t("claimOk"), false, 4000);
    } catch (err) { st.textContent = (err && err.message) || String(err); }
  });
}
function showFollow(a, quiet) {
  const rs = rowsOf(a), isNode = nodes.has(a);
  cardOf = a;
  const last = rs.slice(-6).reverse().map((r) => `<li style="color:${r[6] === 0 ? "#ff4d5e" : kcss(r[4])}"><i></i><a href="${EXPLORER}/tx/${r[0]}" target="_blank" rel="noopener" style="color:var(--ink)">${esc(t(KINDS[r[4]]))}${r[5] ? " · " + fmtUsd(r[5]) : ""} · ${esc(r[2] === a ? "→ " + (r[3] ? nameOf(r[3]) : t("deploy")) : "← " + short(r[2]))}</a></li>`).join("");
  cardShell(`${t("following")} ${short(a)}`, a, `<dl><dt>${esc(t("txsSeen"))}</dt><dd>${rs.length}</dd></dl>${rs.length ? `<ul>${last}</ul>` : `<p class="gx-hint">${esc(t("waiting"))}</p>`}`);
  walletSeen(a, true);
  if (!quiet) { if (isNode) flyTo(nodes.get(a).pos, 70); else { const w = walletPos(a); flyTo(w.clone().multiplyScalar(0.55), 260); } }
}
async function findTx(h) {
  note(t("finding"), false, 2500);
  try {
    const r = await fetch(`/api/social?arc=galaxy-tx&h=${h}${NET !== "mainnet" ? "&net=" + NET : ""}`); if (!r.ok) throw new Error(r.status);
    const j = await r.json(); if (j.labels) { Object.assign(LABELS, j.labels); relabel(); }
    const row = j.row; seen.add(row[0]); played(row); launch(row, 0.45);
    const to = row[3], usd = row[5];
    cardOf = row[0];
    cardShell(`${t(KINDS[row[4]])}${row[6] === 0 ? " · " + t("failed") : ""}`, row[0], `<dl><dt>${esc(t("block"))}</dt><dd>#${row[1].toLocaleString("en-US")}</dd><dt>${esc(t("from"))}</dt><dd>${esc(short(row[2]))}</dd><dt>${esc(t("to"))}</dt><dd>${esc(to ? nameOf(to) : (j.contract ? short(j.contract) : t("deploy")))}</dd>${usd ? `<dt>${RH ? "USD" : "USDC"}</dt><dd>${fmtUsd(usd)}</dd>` : ""}<dt>${esc(t("when"))}</dt><dd>${new Date(row[8]).toLocaleString()}</dd></dl>`, `${EXPLORER}/tx/${row[0]}`);
    flyTo(to && nodes.has(to) ? nodes.get(to).pos : walletPos(row[2]).multiplyScalar(0.6), 160);
  } catch { note(t("noTx"), false, 3500); }
}
function doFollow() {
  const v = $("gx-q").value.trim().toLowerCase();
  if (/^0x[0-9a-f]{64}$/.test(v)) { findTx(v); return; }
  if (!isAddr(v)) { note(t("badAddr"), false, 3000); return; }
  follow = v; try { const u = new URL(location.href); u.searchParams.set("follow", v); history.replaceState(null, "", u.pathname + u.search); } catch {}
  try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch {}
  if (NET === "testnet") walletHistory(v);
  if (nodes.has(v) || LABELS[v]) showContract(v); else showFollow(v);
}
$("gx-qgo").addEventListener("click", doFollow);
$("gx-q").addEventListener("keydown", (e) => { if (e.key === "Enter") doFollow(); });

// tools
$("gx-spin").addEventListener("click", () => { orbit.spin = !orbit.spin; $("gx-spin").textContent = orbit.spin ? "⏸" : "▶"; });
$("gx-home").addEventListener("click", () => { closeCard(); follow = null; goHome(); orbit.spin = true; $("gx-spin").textContent = "⏸"; });
$("gx-full").addEventListener("click", () => { const d = document; if (d.fullscreenElement) d.exitFullscreen(); else d.documentElement.requestFullscreen && d.documentElement.requestFullscreen().catch(() => {}); });
$("gx-share").addEventListener("click", () => {
  const s = lastStats || {};
  const txt = `${CHAIN_NAME} right now: ${s.tps1m != null ? s.tps1m.toFixed(1) : "–"} tx/s, ${fmtUsd(s.usd10m || 0)} ${RH ? "moved" : "USDC moved"} in 10 minutes.\n\nEvery transaction on ${RH ? "Robinhood Chain" : "@Arc"}, live in 3D 🌌`;
  open(`https://x.com/intent/post?text=${encodeURIComponent(txt)}&url=${encodeURIComponent("https://www.arcircle.app/galaxy")}`, "_blank", "noopener");
});
if (RH) { // GXR: the page dressed for Robinhood Chain
  document.body.classList.add("gx-rh");
  const au = document.getElementById("s-auth"); if (au && au.parentElement) au.parentElement.hidden = true; // EIP-3009 is Arc USDC's
  const b1 = document.querySelector(".gx-b1"); if (b1) b1.textContent = "ROBINHOOD";
  document.title = "ROBINHOOD GALAXY — every Robinhood Chain transaction, live in 3D";
  const ex = document.querySelector('.gx-src a[href*="etherscan"]'); if (ex) { ex.href = EXPLORER; ex.textContent = "Robinhood Chain explorer"; }
}
$("gx-lang").addEventListener("change", (e) => { LANG = e.target.value; try { localStorage.setItem("arc.galaxy.lang", LANG); } catch {} paintWords(); });
{ // snapshot + Play ARCIRCLE + mainnet / testnet
  const sb = document.createElement("button"); sb.type = "button"; sb.id = "gx-shot"; sb.textContent = "📸"; sb.title = "Snapshot"; sb.setAttribute("aria-label", "Snapshot");
  $("gx-share").before(sb); sb.addEventListener("click", () => shareShot());
  const pl = document.createElement("a"); pl.id = "gx-play"; pl.className = "gx-play"; pl.href = "/game"; pl.target = "_blank"; pl.rel = "noopener"; pl.innerHTML = "🎮 <span>" + esc(t("play")) + "</span>";
  $("gx-tools").prepend(pl);
  const nt = document.createElement("div"); nt.className = "gx-net"; nt.innerHTML = `<a href="?net=mainnet" class="${NET === "mainnet" ? "on" : ""}">Arc</a><a href="?net=testnet" class="${NET === "testnet" ? "on" : ""}">Testnet</a><a href="?net=robinhood" class="rh ${RH ? "on" : ""}">Robinhood</a>`;
  $("gx-live").after(nt);
}
if (EMBED) { document.body.classList.add("gx-embed"); const o = document.createElement("a"); o.className = "gx-open"; o.href = "/galaxy" + (NET === "testnet" ? "?net=testnet" : ""); o.target = "_blank"; o.rel = "noopener"; o.textContent = t("openFull") + " ↗"; document.body.appendChild(o); }
if (OBS) { document.body.classList.add("gx-obs"); orbit.idle = 20; }
{ // GXD2: the daily records — a day's report, 7 / 30-day trends, a report card (galaxy-daily.js, loaded on first open)
  if (NET === "mainnet" && !EMBED && !OBS) {
    const b = document.createElement("button"); b.type = "button"; b.id = "gx-daily"; b.textContent = "📅"; b.title = "Daily records"; b.setAttribute("aria-label", "Daily records");
    $("gx-share").before(b);
    let mod = null;
    const open = async () => { try { mod = mod || (await import("/galaxy-daily.js" + new URL(import.meta.url).search)); window.__gxDaily = mod.openDaily({ esc, fmtUsd, fmtN, KINDS, kcss, DOMAINS: Object.fromEntries(Object.entries(DOMAINS).map(([k, v]) => [k, [v[0]]])), EXPLORER, note, kindName: (i) => t(KINDS[i]), lang: () => LANG, phone: PHONE }); } catch { note("Couldn't open the daily records"); } };
    b.addEventListener("click", open);
    if (Q.get("daily") === "1") setTimeout(open, 600);
  }
}
{ // sound: off until asked
  const b = document.createElement("button"); b.type = "button"; b.id = "gx-snd"; b.textContent = "🔇"; b.title = "Sound"; b.setAttribute("aria-label", "Sound");
  $("gx-share").before(b);
  b.addEventListener("click", () => { soundOn = !soundOn; b.textContent = soundOn ? "🔊" : "🔇"; if (soundOn && !actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { soundOn = false; b.textContent = "🔇"; } } if (actx && actx.state === "suspended") actx.resume(); });
}
{ // GX5: the rankings' tabs
  const h = $("gx-topc").querySelector("h2");
  const tb = document.createElement("div"); tb.className = "gx-rtabs"; tb.innerHTML = [["c", "tabContracts"], ["w", "tabWallets"], ["t", "tabTokens"], ["n", "tabNew"]].map(([k, w]) => `<button type="button" data-rt="${k}" class="${k === rankTab ? "on" : ""}" data-i="${w}">${esc(t(w))}</button>`).join("");
  h.after(tb);
  const h2 = h;
  const titleTop = () => { if (!h2) return; if (rankTab === "c") { h2.dataset.i = "busiest"; h2.textContent = t("busiest"); } else { delete h2.dataset.i; h2.textContent = `${t("top")} · ${t({ w: "tabWallets", t: "tabTokens", n: "tabNew" }[rankTab])}`; } };
  tb.addEventListener("click", (e) => { const b = e.target.closest("[data-rt]"); if (!b) return; rankTab = b.dataset.rt; tb.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); titleTop(); paintTop(); });
  setInterval(() => { if (rankTab !== "c" && !document.hidden) paintTop(); }, 3000);
}
{ // GX5: phones — one row of tabs picks what the bottom shows (Live tape · Top · Kinds · Follow)
  if (PHONE) {
    const bar = document.createElement("div"); bar.className = "gx-ptabs"; bar.innerHTML = [["live", "tabLive"], ["top", "top"], ["kinds", "tabKinds"], ["follow", "followBtn"]].map(([k, w]) => `<button type="button" data-pt="${k}" class="${k === "live" ? "on" : ""}">${esc(t(w))}</button>`).join("");
    document.querySelector(".gx-bottom").prepend(bar);
    document.body.classList.add("pt-live");
    bar.addEventListener("click", (e) => { const b = e.target.closest("[data-pt]"); if (!b) return; ["live", "top", "kinds", "follow"].forEach((k) => document.body.classList.toggle("pt-" + k, k === b.dataset.pt)); bar.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); if (b.dataset.pt === "top") closeCard(); if (b.dataset.pt === "follow") setTimeout(() => $("gx-q").focus(), 50); });
  }
}
{ // GX5: replay the last minutes fast, focus mode, keys
  const rb = document.createElement("button"); rb.type = "button"; rb.id = "gx-replay"; rb.textContent = "⏪"; rb.title = "Replay the last minutes"; rb.setAttribute("aria-label", "Replay");
  $("gx-spin").before(rb);
  rb.addEventListener("click", () => {
    const rs = recent.slice(-600); if (rs.length < 3) return;
    const t0 = rs[0][8], span = Math.max(1, rs[rs.length - 1][8] - t0), now = performance.now();
    replayPlan = rs.map((r) => ({ r, at: now + ((r[8] - t0) / span) * 12000 })); replayUntil = now + 12000; mode = "replay"; setLive(true); note(t("replay"), false, 12000);
  });
  const fb = document.createElement("button"); fb.type = "button"; fb.id = "gx-focus"; fb.textContent = "⤢"; fb.title = "Focus (F)"; fb.setAttribute("aria-label", "Focus");
  if (!PHONE) $("gx-full").before(fb);
  const focus = (on) => document.body.classList.toggle("gx-focus", on);
  fb.addEventListener("click", () => focus(!document.body.classList.contains("gx-focus")));
  addEventListener("keydown", (e) => {
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    if (e.key === "f" || e.key === "F") focus(!document.body.classList.contains("gx-focus"));
    else if (e.key === " ") { e.preventDefault(); $("gx-spin").click(); }
    else if (e.key === "Escape") { if (!card.hidden) closeCard(); else focus(false); }
    else if (e.key === "ArrowLeft") { orbit.th -= 0.12; orbit.idle = 0; } else if (e.key === "ArrowRight") { orbit.th += 0.12; orbit.idle = 0; }
    else if (e.key === "ArrowUp") { orbit.d = Math.max(40, orbit.d * 0.9); } else if (e.key === "ArrowDown") { orbit.d = Math.min(900, orbit.d * 1.1); }
  });
}
// GX5: the last 24 hours, half an hour a bar (only the minutes the feed read)
async function paintDay() {
  try {
    const r = await fetch("/api/social?arc=galaxy-day" + (NET !== "mainnet" ? "&net=" + NET : "")); if (!r.ok) return;
    const j = await r.json(), m = j.minutes || []; if (m.length < 5) return;
    const now = Date.now(), bars = new Array(48).fill(null);
    for (const [ts, tx] of m) { const i = 47 - Math.floor((now - ts) / 1800000); if (i >= 0 && i < 48) bars[i] = (bars[i] || 0) + tx; }
    const mx = Math.max(...bars.map((v) => v || 0), 1), peak = Math.max(...m.map((x) => x[1]));
    let el = $("gx-day"); if (!el) { el = document.createElement("div"); el.id = "gx-day"; el.className = "gx-day"; $("gx-legend").appendChild(el); }
    el.innerHTML = `<h2>${esc(t("day24"))}</h2><div class="bars">${bars.map((v) => `<i class="${v == null ? "gap" : ""}" style="height:${v == null ? 4 : Math.max(6, (v / mx) * 100)}%"></i>`).join("")}</div><p class="gx-hint">${esc(t("peak"))}: ${fmtN(peak)} tx / min</p>`;
  } catch { /* the chart is a bonus */ }
}
if (!DEMO && !Q.get("src")) { setTimeout(paintDay, 3000); setInterval(() => { if (!document.hidden) paintDay(); }, 60000); }

// GX4: a followed wallet's recent past (testnet only — mainnet's explorer API is behind a bot check)
async function walletHistory(a) {
  try {
    const r = await fetch(`${EXPLORER}/api/v2/addresses/${a}/transactions`); if (!r.ok) return;
    const j = await r.json(); const items = (j.items || []).slice(0, 20).reverse();
    items.forEach((x, i) => {
      const to = x.to && x.to.hash ? x.to.hash.toLowerCase() : "", m = String(x.method || "").toLowerCase(), v = BigInt(x.value || "0");
      const k = !to ? 5 : /swap/.test(m) ? 1 : /approve|permit/.test(m) ? 6 : /deposit_?for_?burn|receive_?message/.test(m) ? 2 : v > 0n && !m ? 0 : /transfer/.test(m) ? 3 : 7;
      const row = [String(x.hash).toLowerCase(), Number(x.block_number || x.block || 0), String(x.from && x.from.hash || a).toLowerCase(), to, k, Number(v / 10n ** 16n), x.status === "ok" ? 1 : x.status === "error" ? 0 : -1, "", Date.parse(x.timestamp) || Date.now(), 0, 0];
      if (seen.has(row[0])) return; seen.add(row[0]);
      setTimeout(() => { recent.push(row); launch(row, 1.3); if (cardOf === a) showFollow(a, true); }, 300 + i * 260);
    });
  } catch { /* history is a bonus */ }
}
// GX4: a snapshot card (the scene + today's numbers) to share or save
let wantShot = null;
function snapshot() { return new Promise((res) => { wantShot = res; }); }
async function shareShot() {
  const grab = await snapshot();
  const W = 1200, H = 630, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  const img = new Image(); img.src = grab; await img.decode().catch(() => {});
  const k = Math.max(W / img.width, H / img.height); x.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
  const g = x.createLinearGradient(0, 0, W * 0.7, 0); g.addColorStop(0, "rgba(2,4,12,0.92)"); g.addColorStop(0.55, "rgba(2,4,12,0.55)"); g.addColorStop(1, "rgba(2,4,12,0)"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const s = lastStats || {};
  x.fillStyle = "#fff"; x.font = "900 76px 'Exo 2', sans-serif"; x.fillText("ARC", 60, 140);
  const gg = x.createLinearGradient(60, 0, 520, 0); gg.addColorStop(0, "#3ce6ff"); gg.addColorStop(1, "#4dffb0"); x.fillStyle = gg; x.fillText("GALAXY", 60, 220);
  x.fillStyle = "#cfe3ff"; x.font = "600 26px Sora, sans-serif"; x.fillText(CHAIN_NAME + " right now", 62, 280);
  const lines = [[s.tps1m != null ? s.tps1m.toFixed(1) : "–", t("tps")], [fmtUsd(s.usd10m || 0), t("usd10")], [fmtN(s.txs), t("txs10")]];
  lines.forEach(([v, l], i) => { x.fillStyle = i === 1 ? "#ffd166" : "#fff"; x.font = "800 46px 'Exo 2', sans-serif"; x.fillText(v, 62, 350 + i * 74); x.fillStyle = "#8fa6c8"; x.font = "500 20px Sora, sans-serif"; x.fillText(l, 64, 376 + i * 74); });
  x.fillStyle = "#8fa6c8"; x.font = "500 18px Sora, sans-serif"; x.fillText(new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC · #" + head.toLocaleString("en-US"), 62, H - 70);
  x.fillStyle = "#3ce6ff"; x.font = "800 24px Sora, sans-serif"; x.fillText("arcircle.app/galaxy", 62, H - 36);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9)); if (!blob) return;
  const file = new File([blob], "arc-galaxy.jpg", { type: "image/jpeg" });
  const text = `${CHAIN_NAME} right now: ${s.tps1m != null ? s.tps1m.toFixed(1) : "–"} tx/s, ${fmtUsd(s.usd10m || 0)} ${RH ? "moved" : "USDC"} in 10 minutes. Watch every transaction live in 3D 🌌`;
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, url: "https://www.arcircle.app/galaxy" }); return; } } catch { /* fall through */ }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "arc-galaxy.jpg"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  note(t("saved"), false, 3500);
}
let noteT = 0;
function note(text, sticky, ms = 4000) { const el = $("gx-note"); el.textContent = text; el.hidden = false; el.classList.toggle("demo", DEMO && text === t("demo")); clearTimeout(noteT); if (!sticky) noteT = setTimeout(() => { el.hidden = true; if (DEMO) note(t("demo"), true); }, ms); }

// ---------------------------------------------------------------- a clearly-labelled made-up feed (?demo=1)
let demoN = 9000000, demoT = Date.now() - 120e3;
const demoW = Array.from({ length: 300 }, (_, i) => "0x" + (hash("w" + i, 1) * 1e16).toString(16).padStart(14, "0").slice(0, 14).padEnd(40, (i % 16).toString(16)));
const demoC = [["0x3600000000000000000000000000000000000000", 0, 40], ["0x8366a39cc670b4001a1121b8f6a443a643e40951", 1, 18], ["0x28b5a0e9c621a5badaa536219b3a228c8168cf5d", 2, 6], ["0x305da1b305249072b13b73ab394e02046c865d56", 1, 5], ["0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7", 3, 5], ["0x709e1b65c529567fbe1c79de278c2abba0086ff5", 4, 2], ...Array.from({ length: 60 }, (_, i) => ["0x" + (hash("c" + i, 3) * 1e16).toString(16).slice(0, 12).padEnd(40, "c"), [3, 7, 7, 6, 1][i % 5], 1 + (i % 4)])];
const demoLab = { [demoC[6][0]]: ["PEPE · Pepe", "token"], [demoC[7][0]]: ["WETH · Wrapped Ether", "token"], [demoC[8][0]]: ["EURC", "token"], "0x3600000000000000000000000000000000000000": ["USDC", "circle"], "0x8366a39cc670b4001a1121b8f6a443a643e40951": ["Uniswap v4 PoolManager", "uniswap"], "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d": ["CCTP Token Messenger", "circle"], "0x305da1b305249072b13b73ab394e02046c865d56": ["ARCIRCLE Swap", "arcircle"], "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7": ["$ARCIRCLE", "arcircle"], "0x709e1b65c529567fbe1c79de278c2abba0086ff5": ["Crimson Celestial NFT", "arcircle"] };
let demoRows = [];
function demoFeed() {
  const now = Date.now(); const tot = demoC.reduce((s, c) => s + c[2], 0);
  while (demoT < now) {
    demoT += 500; demoN++;
    const n = Math.floor(Math.random() * 9);
    for (let i = 0; i < n; i++) {
      let x = Math.random() * tot, c = demoC[0]; for (const y of demoC) { x -= y[2]; if (x <= 0) { c = y; break; } }
      const from = demoW[Math.floor(Math.random() * demoW.length)], k = Math.random() < 0.02 ? 5 : c[1];
      const usd = k === 0 || k === 1 || k === 2 ? Math.floor(Math.pow(10, 1 + Math.random() * 4.4)) * 100 : 0;
      const dd = [0, 6, 3, 5, 2, 7, 1, 10][Math.floor(Math.random() * 8)], dbr = k === 2 ? (Math.random() < 0.6 ? "i" : "o") + dd : 0;
      demoRows.push(["0x" + (demoN * 100 + i).toString(16).padStart(64, "0"), demoN, from, k === 5 ? "" : k === 0 && Math.random() < 0.5 ? demoW[(Math.random() * demoW.length) | 0] : c[0], k, usd, Math.random() < 0.04 ? 0 : 1, "0x", Math.floor(demoT / 1000) * 1000, dbr, k === 5 ? "c0x" + (hash("new" + demoN + i, 5) * 1e16).toString(16).slice(0, 10).padEnd(40, "d") : k === 1 ? [demoC[6 + (i % 3)][0], demoC[10 + (demoN % 20)][0]] : 0, k === 0 && Math.random() < 0.18 ? 1 : 0]);
    }
  }
  demoRows = demoRows.filter((r) => r[8] > now - 120e3);
  const kinds = new Array(8).fill(0); demoRows.forEach((r) => kinds[r[4]]++);
  const top = {}; demoRows.forEach((r) => { if (r[3] && r[4] !== 0) top[r[3]] = (top[r[3]] || 0) + 1; });
  const bmap = new Map(); for (const r of demoRows) { const x = bmap.get(r[1]) || [r[1], r[8], 0, 0, 0]; x[2]++; x[4] += r[5]; if (r[6] === 0) x[3]++; bmap.set(r[1], x); }
  return { head: demoN, at: now, rows: demoRows, labels: demoLab, blocks: [...bmap.values()].sort((a, b) => a[0] - b[0]), top: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 16), stats: { tps1m: demoRows.length / 120, tps: demoRows.length / 120, blockTime: 0.5, usd10m: demoRows.reduce((s, r) => s + r[5], 0) * 5, txs: demoRows.length * 5, failRate: 0.04, kinds: kinds.map((x) => x * 5), wallets: 280, fee10m: demoRows.length * 5 * 1700, feeTxs: demoRows.length * 5, auth10m: demoRows.filter((r) => r[11]).length * 5 }, records: (() => { const big = demoRows.reduce((m, r) => (r[5] > (m ? m[5] : 0) ? r : m), null), bl = [...bmap.values()].reduce((m, x) => (x[2] > (m ? m[2] : 0) ? x : m), null); return big && bl ? { day: "demo", today: { usd: [big[5], big[0], big[8]], block: [bl[2], bl[0], bl[1]], tps: [Math.round(demoRows.length / 1.2), demoN, now] }, ever: { usd: [Math.round(big[5] * 1.6), big[0], big[8]], block: [bl[2] + 9, bl[0], bl[1]], tps: [Math.round(demoRows.length / 0.9), demoN, now] } } : null; })() };
}

// ---------------------------------------------------------------- frame
addEventListener("resize", () => { R.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); for (const m of world.children) if (m.isPoints) m.material.uniforms.uScale.value = innerHeight * DPR * 0.5; });
// GX3: bloom on computers, parallax, auto tour, hover, sound
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
let composer = null;
if (!PHONE && !LOW && Q.get("bloom") !== "0") Promise.all([import("/vendor/three/addons/EffectComposer.js"), import("/vendor/three/addons/RenderPass.js"), import("/vendor/three/addons/UnrealBloomPass.js"), import("/vendor/three/addons/OutputPass.js")]).then(([{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }]) => {
  const c = new EffectComposer(R); c.addPass(new RenderPass(scene, cam));
  const bl = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.62, 0.42, 0.62); c.addPass(bl); c.addPass(new OutputPass());
  composer = c; addEventListener("resize", () => { c.setSize(innerWidth, innerHeight); bl.resolution.set(innerWidth / 2, innerHeight / 2); });
}).catch(() => { /* plain rendering */ });
const par = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener("pointermove", (e) => { par.tx = (e.clientX / innerWidth - 0.5); par.ty = (e.clientY / innerHeight - 0.5); hoverAt = { x: e.clientX, y: e.clientY }; });
// auto tour: idle for 25 s → glide to the busiest star, stay, come back
const tourS = { t: 0, phase: 0 };
function tour(dt) {
  if (REDUCED || !orbit.spin || ptrs.size || cardOf || follow) { tourS.t = 0; tourS.phase = 0; return; }
  if (orbit.idle < (OBS ? 6 : 25)) return;
  tourS.t += dt;
  if (tourS.phase === 0) { const a = (lastTop[Math.floor(Math.random() * Math.min(4, lastTop.length))] || [])[0]; const n = a && nodes.get(a); if (n) { orbit.want = { tgt: n.pos.clone(), d: 120 }; tourS.phase = 1; tourS.t = 0; } }
  else if (tourS.phase === 1 && tourS.t > 9) { goHome(); tourS.phase = 2; tourS.t = 0; }
  else if (tourS.phase === 2 && tourS.t > 12) { tourS.phase = 0; }
}
// hover a star: its name and the wallets that touched it light up
let hoverAt = null, hoverN = null, hoverEl = null, hoverT = 0;
function hoverTick(dt) {
  hoverT += dt; if (PHONE || !hoverAt || ptrs.size || hoverT < 0.12) return; hoverT = 0;
  let best = null, bd = 18 * 18;
  for (const n of nodes.values()) { tmpV.copy(n.pos).applyMatrix4(world.matrixWorld).project(cam); if (tmpV.z > 1) continue; const sx = (tmpV.x + 1) / 2 * innerWidth, sy = (1 - tmpV.y) / 2 * innerHeight, d = (sx - hoverAt.x) ** 2 + (sy - hoverAt.y) ** 2; if (d < bd) { bd = d; best = n; } }
  if (best !== hoverN) { hoverN = best; if (hoverEl) { hoverEl.remove(); hoverEl = null; }
    if (best) { hoverEl = label(`${nameOf(best.addr)} · ${best.count}`, "hover"); const col = new THREE.Color().setHSL((GROUPS[best.g] || GROUPS.other).hue, 0.8, 0.65); recent.filter((r) => r[3] === best.addr).slice(-16).forEach((r) => link(walletPos(r[2]), best.pos, col, 2.2)); }
    canvas.style.cursor = best ? "pointer" : ""; }
  if (hoverEl && hoverN) placeLabel(hoverEl, hoverN.pos, 1);
}
// sound (off until switched on): a soft note a kind, a low beat a block
let actx = null, soundOn = false, lastSnd = 0;
const NOTE = [523.25, 659.25, 392, 587.33, 783.99, 261.63, 440, 493.88];
function sound(k, failed, usd) {
  if (!soundOn || !actx || document.hidden) return; const t0 = actx.currentTime; if (t0 - lastSnd < 0.09) return; lastSnd = t0;
  const o = actx.createOscillator(), g = actx.createGain(); o.type = failed ? "square" : "sine"; o.frequency.value = failed ? 140 : NOTE[k] * (usd >= 1e7 ? 0.5 : 1);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(failed ? 0.02 : usd >= 1e7 ? 0.09 : 0.035, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + (usd >= 1e7 ? 1.4 : 0.35));
  o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + 1.5);
}
function beat() { if (!soundOn || !actx) return; const t0 = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.25); g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3); o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + 0.32); }
let last = performance.now(), visible = true;
document.addEventListener("visibilitychange", () => { visible = !document.hidden; last = performance.now(); });
function frame(now) {
  requestAnimationFrame(frame);
  if (!visible) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  orbit.idle += dt;
  if (orbit.spin && !ptrs.size) orbit.th += dt * 0.045;
  if (orbit.want) { orbit.tgt.lerp(orbit.want.tgt, 1 - Math.exp(-dt * 3)); orbit.d += (orbit.want.d - orbit.d) * (1 - Math.exp(-dt * 3)); if (orbit.tgt.distanceTo(orbit.want.tgt) < 0.5 && Math.abs(orbit.d - orbit.want.d) < 1) orbit.want = null; }
  placeCam();
  coreKick = Math.max(0, coreKick - dt * 1.4); core.scale.setScalar(70 + Math.sin(now / 900) * 3 + coreKick * 22);
  for (const m of rings) { if (!m.visible) continue; m.userData.t += dt; const u = m.userData.t / 2.4; if (u >= 1) { m.visible = false; continue; } const s = 8 + u * (m.userData.big ? 260 : 200); m.scale.set(s, s, s); m.material.opacity = (1 - u) * (1 - u) * (m.userData.big ? 0.55 : 0.32); }
  for (const g of gates.values()) { g.heat = Math.max(0, g.heat - dt / 20); g.sp.material.opacity = 0.25 + g.heat * 0.75; g.sp.scale.setScalar(26 + g.heat * 22); if (g.ring) { g.ring.material.opacity = 0.35 + g.heat * 0.6; g.ring.material.rotation += dt * (0.15 + g.heat); g.ring.scale.setScalar(40 + g.heat * 16); } }
  stepFx(dt); busyTint(dt);
  for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += dt; if (pops[i].t > 1.6) { pops[i].el.remove(); pops.splice(i, 1); } }
  if (shake > 0) { shake = Math.max(0, shake - dt * 1.6); const a = shake * shake * 2.2; cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a; }
  feedTick(now); stepFlies(dt); stepLinks(dt); stepBirths(dt); hoverTick(dt);
  starCloud.material.uniforms.uTime.value = now / 1000;
  tour(dt);
  if (!PHONE && !REDUCED) { par.x += (par.tx - par.x) * Math.min(1, dt * 3); par.y += (par.ty - par.y) * Math.min(1, dt * 3); cam.position.x += par.x * 8; cam.position.y += par.y * 5; cam.lookAt(orbit.tgt); }
  world.updateMatrixWorld();
  if (composer) composer.render(); else R.render(scene, cam);
  if (wantShot) { const res = wantShot; wantShot = null; try { res(canvas.toDataURL("image/jpeg", 0.92)); } catch { res(""); } }
  paintLabels();
}
paintWords();
if (DEMO) note(t("demo"), true);
function splashSay(x) { const e = document.querySelector("#gx-splash span"); if (e) e.textContent = x; }
setTimeout(() => { if (mode === "connect") splashSay(t("reading")); }, 1200);
{ const sp = $("gx-splash"); if (sp && (OBS || EMBED)) sp.remove(); else if (sp) { const go = () => { sp.classList.add("out"); setTimeout(() => sp.remove(), 900); }; const w = setInterval(() => { if (mode !== "connect" || failN >= 2) { clearInterval(w); go(); } }, 200); setTimeout(() => { clearInterval(w); go(); }, 6000); } }
const f0 = Q.get("follow") || (window.__GX && window.__GX.focus); if (isAddr(f0)) { $("gx-q").value = f0; setTimeout(doFollow, 2500); }
const tx0 = Q.get("tx"); if (/^0x[0-9a-fA-F]{64}$/.test(String(tx0 || ""))) setTimeout(() => findTx(tx0.toLowerCase()), 2600);
requestAnimationFrame(frame);
poll();
window.arcGalaxy = { nodes, flies, state: () => ({ mode, queue: queue.length, flies: flies.length, nodes: nodes.size, head, recent: recent.length }) };
