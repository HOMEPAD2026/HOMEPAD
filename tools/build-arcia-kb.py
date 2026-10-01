#!/usr/bin/env python3
"""tools/build-arcia-kb.py — ARCIA's knowledge of the site, rebuilt from the pages themselves.

Reads the public pages (whitepaper, docs, ArcPad, CirclePad, $ARCIRCLE, Reward, the small
pages), keeps only what a visitor sees in the current state (drops "not live", old-curve,
loading and empty-state copy), splits it by heading, and writes api/_arcia-kb.mjs.
Also adds the contract list (arc-footer.js) and the utilities (arcircle-hub.js).

Run after changing any page copy:   python3 tools/build-arcia-kb.py
"""
import html, json, os, re
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = [  # file, title, url
    ("whitepaper.html", "Whitepaper", "/whitepaper"),
    ("arcircle.html", "$ARCIRCLE page", "/arcircle"),
    ("circlepad.html", "CirclePad", "/circle"),
    ("arcpad.html", "ArcPad and utilities", "/arc"),
    ("reward.html", "Reward", "/reward"),
    ("docs.html", "Docs", "/docs"),
    ("index.html", "Home", "/"),
    ("start.html", "Get started", "/start"),
    ("roadmap.html", "Roadmap", "/roadmap"),
    ("brand.html", "Brand kit", "/brand"),
]
# the site is live, on a Uniswap v4 pool (not the retired foci curve): these never show
SKIP_CLASS = {"arc-nl-only", "arc-curve-only", "ax-ca-nl", "ac2-notlive", "arc-nl-badge", "wp-toc", "toc", "sr-only"}
SKIP_TAG = {"script", "style", "svg", "noscript", "template", "head", "nav", "footer", "button", "select", "input", "textarea"}
VOID = {"br", "img", "hr", "meta", "link", "input", "source", "wbr", "area", "base", "col", "embed", "param", "track"}
BLOCK = {"p", "li", "h1", "h2", "h3", "h4", "div", "section", "article", "dt", "dd", "tr", "td", "th", "blockquote", "figcaption", "summary", "details", "ol", "ul", "table", "header", "main", "aside", "figure"}
NOISE = re.compile(r"^(—|–|-|·|\.\.\.|…|↗|→|\d{1,2}|\d{2} / \d{2}|loading.*|copy|max|arc)$", re.I)
STALE = re.compile(r"isn't a real one yet|no project has launched through circlepad yet|no contributors yet|nothing to vote on yet|no round is open|"
                   r"loading round|loading live|loading the round|relaunching soon|there isn't one yet|not yet\. join the launch|hasn't gone live with real funds|"
                   r"this page switches from preview", re.I)


class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.skip, self.out, self.buf = [], 0, [], []

    def flush(self):
        t = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        self.buf = []
        if t:
            self.out.append(t)

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            if tag == "br":
                self.buf.append(" ")
            return
        a = dict(attrs)
        cls = set((a.get("class") or "").split())
        hide = tag in SKIP_TAG or bool(cls & SKIP_CLASS) or "hidden" in a or a.get("aria-hidden") == "true"
        self.stack.append((tag, hide))
        if hide:
            self.skip += 1
        if tag in BLOCK and not self.skip:
            self.flush()
            if tag in ("h1", "h2", "h3"):
                self.out.append("\x00" + tag)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        while self.stack:
            t, hide = self.stack.pop()
            if hide:
                self.skip -= 1
            if t == tag:
                break
        if tag in BLOCK and not self.skip:
            self.flush()

    def handle_data(self, d):
        if not self.skip:
            self.buf.append(d)


def sections(path, title, url):
    p = Text()
    p.feed(open(os.path.join(ROOT, path), encoding="utf-8").read())
    p.flush()
    secs, cur, head, mark = [], [], title, False
    for line in p.out:
        if line.startswith("\x00"):
            mark = True
            continue
        if mark:  # the text right after an h2/h3 is its heading
            if cur:
                secs.append((head, cur))
            head, cur, mark = line, [], False
            continue
        if NOISE.match(line) or STALE.search(line) or len(line) < 3:
            continue
        if cur and cur[-1] == line:
            continue
        cur.append(line)
    if cur:
        secs.append((head, cur))
    out = []
    for h, lines in secs:
        body = " ".join(lines)
        body = re.sub(r"\s+([.,;:!?)])", r"\1", body)
        if len(body) < 40:
            continue
        out.append({"page": title, "title": re.sub(r"^\d+(\.\d+)?\s*·?\s*", "", h)[:120], "url": url, "text": body[:6000]})
    return out


def contracts():
    s = open(os.path.join(ROOT, "arc-footer.js"), encoding="utf-8").read()
    rows = re.findall(r'\["([^"]+)",\s*"(0x[0-9a-fA-F]{40})"\]', s)
    if not rows:
        return []
    tok = re.search(r'ARCIRCLE_TOKEN = "(0x[0-9a-fA-F]{40})"', open(os.path.join(ROOT, "api", "_arcircle.mjs"), encoding="utf-8").read())
    if tok and not any(a.lower() == tok.group(1).lower() for _, a in rows):
        rows.insert(0, ("$ARCIRCLE token", tok.group(1)))
    text = "Contracts on Arc mainnet (chain 5042), listed at the bottom of every page with an explorer link: " + "; ".join(f"{n}: {a}" for n, a in rows) + "."
    return [{"page": "Contracts", "title": "Contract addresses", "url": "/arcircle", "text": text}]


def utilities():
    s = open(os.path.join(ROOT, "arcircle-hub.js"), encoding="utf-8").read()
    rows = re.findall(r'id: "([a-z-]+)", name: "([^"]+)", sub: "([^"]+)"[^}]*?href: "([^"]+)"', s)
    if not rows:
        return []
    text = "ARCIRCLE PAD utilities (free, open from the ∞+ button on any page): " + "; ".join(f"{n} — {sub} ({h})" for _, n, sub, h in rows) + ". ARCIRCLE OMNI (one $ARCIRCLE across Arc, Solana and Robinhood Chain) is in preview: its contracts are not deployed yet. ARCIRCLE Staking (staking for $ARCIRCLE) is only being planned: its tile on page 4 opens a coming-soon card, there is nothing to stake yet, and how it works, what it pays and when it opens haven't been announced. One more utility is in development."
    return [{"page": "Utilities", "title": "Utilities", "url": "/arc", "text": text}]


def main():
    kb = []
    for f, t, u in PAGES:
        if os.path.exists(os.path.join(ROOT, f)):
            kb += sections(f, t, u)
    kb += contracts() + utilities()
    seen, uniq = set(), []
    for k in kb:
        key = k["text"][:200]
        if key in seen:
            continue
        seen.add(key)
        uniq.append(k)
    total = sum(len(k["text"]) for k in uniq)
    src = ("// api/_arcia-kb.mjs — GENERATED by tools/build-arcia-kb.py from the site's pages. Do not edit by hand;\n"
           "// change the page copy and run:  python3 tools/build-arcia-kb.py\n"
           f"// {len(uniq)} sections, {total} characters.\n"
           "export const KB = " + json.dumps(uniq, ensure_ascii=False, indent=0) + ";\n")
    open(os.path.join(ROOT, "api", "_arcia-kb.mjs"), "w", encoding="utf-8").write(src)
    print(f"api/_arcia-kb.mjs: {len(uniq)} sections, {total} chars")


if __name__ == "__main__":
    main()
