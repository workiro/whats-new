// build-feed.js
// Reads the What's New JSON and writes an RSS 2.0 feed to _site/feed.xml.
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
  self: "https://workiro.github.io/whats-new/feed.xml",  // this feed's URL (set this)
  description: "Product updates from Workiro",
  maxItems: 50,
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
  console.log(`Wrote ${items.length} items, newest ${items[0].date.toISOString().slice(0, 10)}`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
