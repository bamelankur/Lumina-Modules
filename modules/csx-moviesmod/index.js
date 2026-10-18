// Lumina Module API v1
// Port of the Moviesmod provider from SaurabhKaperwan/CSX.
// The original CSX project is a Kotlin/CloudStream plugin repository and cannot
// be installed directly by Lumina. This module reimplements the compatible
// provider surface in JavaScript; CloudStream-only extractor plugins are not
// bundled or executed here.

const DEFAULT_BASE = "https://moviesleech.rest";
const BASE_URL = DEFAULT_BASE;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function absolute(url, base = BASE_URL) {
  try { return new URL(url, base).href; } catch (_) { return ""; }
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function attr(tag, name) {
  const re = new RegExp("\\b" + name + "\\s*=\\s*([\"'])(.*?)\\1", "i");
  const m = String(tag || "").match(re);
  return m ? decodeHtml(m[2]) : "";
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

async function getText(url) {
  if (typeof fetch !== "function") throw new Error("This Lumina runtime does not expose fetch()");
  const response = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8" }
  });
  if (!response || !response.ok) throw new Error("Provider request failed" + (response ? " (" + response.status + ")" : ""));
  return await response.text();
}

function getMeta(html, property) {
  const re = /<meta\b[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const tag = match[0];
    const key = attr(tag, "property") || attr(tag, "name");
    if (key.toLowerCase() === property.toLowerCase()) return attr(tag, "content");
  }
  return "";
}

function decodeWrappedUrl(url) {
  const match = String(url || "").match(/[?&]url=([^&]+)/i);
  if (!match) return url;
  try {
    const encoded = decodeURIComponent(match[1]);
    if (typeof atob === "function") {
      const decoded = atob(encoded);
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
  } catch (_) {}
  return url;
}

function parseCards(html) {
  const results = [];
  const articles = html.match(/<article\b[\s\S]*?<\/article>/gi) || [];
  for (const article of articles) {
    const links = article.match(/<a\b[^>]*>/gi) || [];
    let linkTag = links.find(tag => attr(tag, "title") || attr(tag, "href"));
    if (!linkTag) continue;
    const href = absolute(attr(linkTag, "href"));
    if (!href) continue;
    let title = attr(linkTag, "title").replace(/^Download\s+/i, "").trim();
    if (!title) {
      const titleMatch = article.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i);
      title = stripTags(titleMatch ? titleMatch[1] : "");
    }
    if (!title) continue;
    const imageTag = article.match(/<img\b[^>]*>/i);
    const image = imageTag ? (attr(imageTag[0], "src") || attr(imageTag[0], "data-src")) : "";
    results.push({ title, href, image: absolute(image), contentType: "video" });
  }
  return results;
}

function extractAnchors(html, classPattern) {
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  return anchors.filter(tag => classPattern.test(attr(tag, "class"))).map(tag => ({
    title: stripTags(tag),
    href: absolute(decodeWrappedUrl(attr(tag, "href")))
  })).filter(item => item.href);
}

async function findFinalUrl(pageUrl) {
  const html = await getText(pageUrl);
  const candidates = extractAnchors(html, /maxbutton-1|maxbutton-5|download|play|watch/i);
  const video = html.match(/https?:\\?\/\\?\/[^\s"'<>]+\.(?:mp4|m3u8|mpd)(?:\?[^\s"'<>]*)?/i);
  if (video) return { url: video[0].replace(/\\\//g, "/"), headers: { "User-Agent": USER_AGENT, "Referer": pageUrl } };
  const direct = candidates.find(item => /\.(mp4|m3u8|mpd)(\?|$)/i.test(item.href));
  if (direct) return { url: direct.href, headers: { "User-Agent": USER_AGENT, "Referer": pageUrl } };
  // Keep the best source candidate visible to the player; host-specific CloudStream
  // extractors are Kotlin-only and are intentionally not falsely emulated here.
  if (candidates.length) return { url: candidates[0].href, headers: { "User-Agent": USER_AGENT, "Referer": pageUrl } };
  const firstExternal = (html.match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>/gi) || [])
    .map(tag => absolute(decodeWrappedUrl(attr(tag, "href")), pageUrl))
    .find(url => url && /^https?:\/\//i.test(url) && !url.includes("moviesleech.rest"));
  return firstExternal ? { url: firstExternal, headers: { "User-Agent": USER_AGENT, "Referer": pageUrl } } : null;
}

const state = new Map();

globalThis.LuminaModule = {
  apiVersion: 1,
  contentType: "video",

  async search(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    const url = absolute("/search/" + encodeURIComponent(q) + "/page/1");
    const items = parseCards(await getText(url));
    items.forEach(item => state.set(item.href, item));
    return items;
  },

  async home() {
    const items = parseCards(await getText(absolute("/page/1")));
    items.forEach(item => state.set(item.href, item));
    return items;
  },

  async details(href) {
    const url = absolute(href);
    if (!url) return null;
    const html = await getText(url);
    const title = stripTags(getMeta(html, "og:title").replace(/^Download\s+/i, "")) ||
      (state.get(url) || {}).title || "Untitled";
    const image = absolute(getMeta(html, "og:image"));
    const description = stripTags(getMeta(html, "og:description") || "");
    const item = { title, href: url, image, description, contentType: "video" };
    state.set(url, item);
    return item;
  },

  async episodes(href) {
    const url = absolute(href);
    if (!url) return [];
    const html = await getText(url);
    const isSeries = /season|episode|web.series/i.test(stripTags(html));
    const links = extractAnchors(html, /maxbutton-episode-links|maxbutton-g-drive|maxbutton-af-download|maxbutton-download-links/i);
    const unique = [];
    const seen = new Set();
    for (const link of links) {
      if (seen.has(link.href)) continue;
      seen.add(link.href);
      unique.push({
        title: link.title || (isSeries ? "Episode / source " : "Source ") + (unique.length + 1),
        href: link.href,
        season: "1"
      });
    }
    if (unique.length) return unique;
    return [{ title: "Open source page", href: url, season: "1" }];
  },

  async stream(episodeHref) {
    const url = absolute(episodeHref);
    if (!url) return null;
    return await findFinalUrl(url);
  }
};
