// build-feed.js
// Reads the What's New JSON and writes _site/feed.xml (RSS 2.0) and _site/index.html (landing page).
// Run locally:  SOURCE=./export.json node build-feed.js
// In GitHub Actions SOURCE defaults to the public Firebase REST endpoint.

const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const SOURCE = process.env.SOURCE || "https://scim-whats-new.firebaseio.com/updates.json";
const OUT_DIR = process.env.OUT_DIR || "_site";

const FEED = {
  title: "What's new in Workiro",
  link: "https://app.workiro.com/settings/whatsnew",                  // human-facing page (set this)
  self: "https://workiro.github.io/whats-new/feed.xml",    // this feed's URL
  site: "https://workiro.github.io/whats-new/",            // landing page (index.html)
  description: "Product updates from Workiro",
  maxItems: 50,   // items in feed.xml
  pageItems: 12,  // items shown on the landing page
};

const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const cdata = (s = "") => `<![CDATA[${String(s).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

// Keys are mostly YYYY-MM-DD, but at least one is unpadded (e.g. "2025-05-8").
function parseDateKey(key) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(key);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 9, 0, 0)) : null;
}

// First Markdown link in the body (usually "Learn more"), percent-encoded.
function firstLink(md = "") {
  const m = /\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/.exec(md);
  return m ? encodeURI(decodeURI(m[1])) : null;
}

function buildItems(updates) {
  const items = [];
  for (const [key, day] of Object.entries(updates || {})) {
    const date = parseDateKey(key);
    if (!date) continue;
    const list = Array.isArray(day?.items) ? day.items : Object.values(day?.items || {});
    const isoDay = date.toISOString().slice(0, 10);
    list.forEach((entry, i) => {
      if (!entry || !entry.title) return;
      items.push({
        // No stable id in the data: date + position. Don't reorder items within a published day.
        guid: `whats-new-${isoDay}-${i}`,
        title: entry.title,
        link: firstLink(entry.body) || `${FEED.link}#${isoDay}`,
        html: marked.parse(entry.body || ""),
        date,
        order: i,
      });
    });
  }
  return items.sort((a, b) => b.date - a.date || a.order - b.order).slice(0, FEED.maxItems);
}

function buildFeed(items) {
  const itemXml = items
    .map(
      (i) => `  <item>
    <title>${esc(i.title)}</title>
    <link>${esc(i.link)}</link>
    <guid isPermaLink="false">${esc(i.guid)}</guid>
    <pubDate>${i.date.toUTCString()}</pubDate>
    <description>${cdata(i.html)}</description>
  </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(FEED.title)}</title>
  <link>${esc(FEED.link)}</link>
  <description>${esc(FEED.description)}</description>
  <language>en-gb</language>
  <atom:link href="${esc(FEED.self)}" rel="self" type="application/rss+xml"/>
  <lastBuildDate>${(items[0]?.date || new Date()).toUTCString()}</lastBuildDate>
${itemXml}
</channel>
</rss>
`;
}

const fmtDate = (d) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// Brand assets, downloaded at build time and served from this site, so visitors
// make no requests to third parties. If a download fails the page still builds:
// the logo falls back to a text wordmark and the favicon is omitted.
const BRAND = {
  logoUrl: "https://cdn.prod.website-files.com/6512a8b117cf6f7907ce200e/696d1021e260324cfce27841_Group%20290637.svg",
  iconUrl: "https://cdn.prod.website-files.com/652d1737a649f74737889bff/6564855d8efe08d77c2e3eed_Full%20Colour%20Icon.png",
  home: "https://www.workiro.com/",
  help: "https://help.workiro.com/hc/en-gb",
  // Set to Workiro's web font once confirmed, e.g. '"Font Name", system-ui, sans-serif'.
  // If it comes from Google Fonts, also set fontCssUrl to the stylesheet URL.
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontCssUrl: "",
};

async function download(url, dest) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch (err) {
    console.warn(`Asset not downloaded (${url}): ${err.message}`);
    return false;
  }
}

// Landing page at the site root: RSS auto-discovery, a copy-the-feed-URL button,
// and the latest updates grouped by release date. Styled to Workiro's brand:
// Green #00B1B2 for fills, a darker green #007A7B for link text (5.2:1 on white),
// Purple #7E49E7 for focus and hover.
function buildIndex(items, assets) {
  const recent = items.slice(0, FEED.pageItems);
  const days = [];
  for (const i of recent) {
    const last = days[days.length - 1];
    if (last && last.date.getTime() === i.date.getTime()) last.items.push(i);
    else days.push({ date: i.date, items: [i] });
  }

  const dayHtml = days
    .map(
      (d, n) => `
      <li class="day">
        <div class="when">
          <time datetime="${d.date.toISOString().slice(0, 10)}">${fmtDate(d.date)}</time>${n === 0 ? `
          <span class="latest">Latest</span>` : ""}
        </div>
        <div class="entries">${d.items
          .map(
            (i) => `
          <article>
            <h3><a href="${esc(i.link)}">${esc(i.title)}</a></h3>
            <div class="body">${i.html}</div>
          </article>`
          )
          .join("")}
        </div>
      </li>`
    )
    .join("");

  const brandMark = assets.logo
    ? `<img src="logo.svg" alt="Workiro" width="132" height="32">`
    : `<span class="wordmark">Workiro</span>`;

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(FEED.title)}</title>
<meta name="description" content="${esc(FEED.description)}. Subscribe with any RSS reader.">
<meta name="theme-color" content="#00B1B2">
<link rel="alternate" type="application/rss+xml" title="${esc(FEED.title)}" href="${esc(FEED.self)}">${assets.icon ? `
<link rel="icon" type="image/png" href="favicon.png">` : ""}${BRAND.fontCssUrl ? `
<link rel="stylesheet" href="${esc(BRAND.fontCssUrl)}">` : ""}
<style>
  :root {
    --green: #00b1b2;
    --green-text: #007a7b;
    --green-wash: #e6f7f7;
    --purple: #7e49e7;
    --ink: #14232c;
    --muted: #5a6472;
    --rule: #e3e8ec;
    --paper: #ffffff;
    color-scheme: light;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font: 400 1.0625rem/1.6 ${BRAND.fontFamily};
  }
  .bar { border-bottom: 1px solid var(--rule); }
  .bar-inner, main { max-width: 48rem; margin: 0 auto; padding-left: 1.5rem; padding-right: 1.5rem; }
  .bar-inner { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 4.5rem; }
  .bar img { display: block; height: 32px; width: auto; }
  .wordmark { font-weight: 700; font-size: 1.5rem; letter-spacing: -0.02em; color: var(--ink); }
  .bar a.home { text-decoration: none; }
  .bar nav a { color: var(--muted); text-decoration: none; font-size: 0.95rem; }
  .bar nav a:hover { color: var(--purple); }
  main { padding-top: 3.5rem; padding-bottom: 5rem; }
  h1 { font-size: clamp(2.25rem, 6vw, 3.25rem); line-height: 1.05; font-weight: 700; letter-spacing: -0.025em; margin: 0 0 1rem; }
  .lede { color: var(--muted); max-width: 34rem; margin: 0 0 2rem; }
  .subscribe {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem;
    padding: 1rem 1rem 1rem 1.25rem; background: var(--green-wash);
    border-left: 4px solid var(--green); border-radius: 0 10px 10px 0;
  }
  .subscribe code { flex: 1 1 16rem; min-width: 0; overflow-wrap: anywhere; font: 500 0.95rem/1.4 ${BRAND.fontFamily}; }
  button, .button {
    font: 600 0.95rem/1 ${BRAND.fontFamily};
    padding: 0.75rem 1.1rem; border-radius: 999px; cursor: pointer; text-decoration: none;
    border: 2px solid var(--green); background: var(--green); color: var(--ink);
  }
  button:hover { background: #00c4c5; border-color: #00c4c5; }
  .button.secondary { background: var(--paper); color: var(--ink); }
  .button.secondary:hover { border-color: var(--purple); color: var(--purple); }
  :focus-visible { outline: 3px solid var(--purple); outline-offset: 3px; }
  .hint { color: var(--muted); font-size: 0.9rem; margin: 0.75rem 0 0; }
  h2 { font-size: 1.25rem; margin: 4rem 0 1.5rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  .day { display: grid; grid-template-columns: 9.5rem 1fr; gap: 1.5rem; padding: 1.75rem 0; border-top: 1px solid var(--rule); }
  .when { display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; padding-top: 0.2rem; }
  .when time { color: var(--muted); font-size: 0.95rem; font-variant-numeric: tabular-nums; }
  .latest { font-size: 0.8rem; font-weight: 600; padding: 0.15rem 0.6rem; border-radius: 999px; background: var(--green-wash); color: var(--green-text); }
  article + article { margin-top: 1.75rem; }
  h3 { font-size: 1.125rem; line-height: 1.35; margin: 0 0 0.4rem; }
  h3 a { color: var(--ink); text-decoration-color: var(--rule); text-underline-offset: 3px; }
  h3 a:hover { color: var(--purple); text-decoration-color: var(--purple); }
  .body p { margin: 0 0 0.6rem; }
  .body ul { margin: 0 0 0.6rem; padding-left: 1.2rem; }
  .body a { color: var(--green-text); font-weight: 500; }
  .body a:hover { color: var(--purple); }
  footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--rule); color: var(--muted); font-size: 0.95rem; display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; }
  footer a { color: var(--green-text); font-weight: 500; }
  footer a:hover { color: var(--purple); }
  @media (max-width: 36rem) {
    main { padding-top: 2.5rem; }
    .day { grid-template-columns: 1fr; gap: 0.5rem; }
    .when { flex-direction: row; align-items: center; }
  }
</style>
</head>
<body>
<header class="bar">
  <div class="bar-inner">
    <a class="home" href="${esc(BRAND.home)}">${brandMark}</a>
    <nav><a href="${esc(BRAND.help)}">Help centre</a></nav>
  </div>
</header>
<main>
  <h1>What's new</h1>
  <p class="lede">Get new Workiro features and improvements as they ship. Add the feed below to Slack or any RSS reader.</p>

  <div class="subscribe">
    <code id="feed-url">${esc(FEED.self)}</code>
    <button type="button" id="copy">Copy feed URL</button>
    <a class="button secondary" href="${esc(FEED.self)}">Open feed</a>
  </div>
  <p class="hint" id="status" role="status" aria-live="polite">Updated within an hour of each release.</p>

  <h2>Latest updates</h2>
  <ol>${dayHtml}
  </ol>

  <footer>
    <a href="${esc(FEED.link)}">See every update on the What's new page</a>
    <a href="${esc(BRAND.home)}">workiro.com</a>
  </footer>
</main>
<script>
  document.getElementById("copy").addEventListener("click", async () => {
    const status = document.getElementById("status");
    const url = document.getElementById("feed-url").textContent;
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = "Feed URL copied. Paste it into your reader to subscribe.";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById("feed-url"));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      status.textContent = "Press Ctrl+C or Cmd+C to copy the selected URL.";
    }
  });
</script>
</body>
</html>
`;
}

async function loadUpdates() {
  if (/^https?:\/\//.test(SOURCE)) {
    const res = await fetch(SOURCE);
    if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status} ${await res.text()}`);
    return res.json();
  }
  const raw = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  return raw.updates ?? raw; // accept a full export or just the /updates node
}

(async () => {
  const updates = await loadUpdates();
  const items = buildItems(updates);
  // Fail loudly rather than publish an empty feed. Pages keeps the last good version.
  if (!items.length) throw new Error("No items found. Check SOURCE and database rules.");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "feed.xml"), buildFeed(items));
  const assets = {
    logo: await download(BRAND.logoUrl, path.join(OUT_DIR, "logo.svg")),
    icon: await download(BRAND.iconUrl, path.join(OUT_DIR, "favicon.png")),
  };
  fs.writeFileSync(path.join(OUT_DIR, "index.html"), buildIndex(items, assets));
  console.log(`Wrote ${items.length} items, newest ${items[0].date.toISOString().slice(0, 10)}`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
