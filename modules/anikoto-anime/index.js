// Isolate this module's declarations so it can be evaluated after other modules in a shared JS context.
(function () {
// AniKoto Anime — Lumina Module API v1 compatibility draft.
// Upstream reference: https://github.com/KSHITIJ8473/raghav/tree/master/AniKotoAnime
// Upstream is GPL-3.0-or-later. This adapter is a draft; playback is best-effort and unverified.

const BASE = "https://anikototv.to";
const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const BROWSER_HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5"
};

function absolute(url, base) {
  const s = String(url || "").trim();
  if (!s) return "";
  try { return new URL(s, base || BASE).href; } catch (_) { return ""; }
}
function decodeHtml(s) {
  return String(s || "").replace(/&amp;/g,"&").replace(/&quot;/g,'"')
    .replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&nbsp;/g," ").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}
function strip(s) {
  return decodeHtml(String(s || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," "))
    .replace(/\s+/g," ").trim();
}
function attr(tag, key) {
  const re = new RegExp("\\b"+key+"\\s*=\\s*([\"'])(.*?)\\1","i");
  const m = String(tag || "").match(re);
  return m ? decodeHtml(m[2]) : "";
}
async function request(url, headers, method) {
  if (typeof fetch !== "function") throw new Error("Lumina JavaScript runtime does not expose fetch()");
  const response = await fetch(url, { method: method || "GET", headers: headers || BROWSER_HEADERS });
  const body = await response.text();
  return { ok: !!response.ok, status: Number(response.status || 0), body: body };
}
async function get(url, headers) {
  const r = await request(url, headers || BROWSER_HEADERS);
  if (!r.ok) throw new Error("AniKoto request failed: HTTP " + r.status + " for " + url);
  return r.body;
}
function jsonResult(json) {
  try {
    const o = JSON.parse(json);
    return Number(o.status) === 200 ? o.result : null;
  } catch (_) { return null; }
}
function htmlCards(html) {
  const out = [], seen = new Set();
  // AniKoto cards use div.ani.items > div.item. Require an anime-name link
  // instead of accepting the first link in an arbitrary item/pagination block.
  const source = String(html || "");
  const items = source.match(/<div\\b[^>]*class=["'][^"']*\\bitem\\b[^"']*["'][^>]*>[\\s\\S]*?(?=<div\\b[^>]*class=["'][^"']*\\bitem\\b|$)/gi) || [];
  for (const item of items) {
    const anchors = [];
    const re = /<a\\b([^>]*)>([\\s\\S]*?)<\\/a>/gi;
    let m;
    while ((m = re.exec(item))) anchors.push({tag:"<a " + m[1] + ">", inner:m[2]});
    // Prefer the exact selector used by the upstream provider: a.name.d-title.
    let link = anchors.find(x => /\\bname\\b/i.test(attr(x.tag,"class")) && /\\bd-title\\b/i.test(attr(x.tag,"class")));
    if (!link) link = anchors.find(x => /\\/watch\\//i.test(attr(x.tag,"href")) && !/page|next|prev|pagination/i.test(attr(x.tag,"class")));
    if (!link) continue;
    const href = absolute(attr(link.tag,"href"));
    const title = strip(attr(link.tag,"title") || attr(link.tag,"data-title") || link.inner);
    // Never expose pagination labels as media cards.
    if (!href || !title || /^page\\s*\\d+$/i.test(title) || /(?:^|\\/)page(?:=|\\/|$)/i.test(href) || seen.has(href)) continue;
    const img = (item.match(/<img\\b[^>]*>/i)||[])[0] || "";
    const image = attr(img,"data-src") || attr(img,"data-original") || attr(img,"data-lazy-src") || attr(img,"src");
    // Reject navigation links to the listing itself; only keep title/watch pages.
    if (href.replace(/\\/$/,"") === BASE.replace(/\\/$/,"")) continue;
    seen.add(href);
    out.push({title, href, url:href, image:absolute(image), poster:absolute(image), contentType:"video"});
  }
  return out;
}
function firstMatch(html, patterns) {
  for (const p of patterns) { const m = String(html || "").match(p); if (m && m[1]) return strip(m[1]); }
  return "";
}
function findAttr(html, selectors) {
  for (const selector of selectors) {
    const re = new RegExp("<([a-z0-9]+)\\b([^>]*"+selector+"[^>]*)>","i");
    const m = String(html || "").match(re);
    if (m) return m[2];
  }
  return "";
}
function getAttrFromTag(tag, key) { return attr(tag, key); }
function listFromAnchors(html, pathPart) {
  const out = [], re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const href = absolute(decodeHtml(m[1]));
    if (href.includes(pathPart)) {
      const value = strip(m[2]);
      if (value && !out.includes(value)) out.push(value);
    }
  }
  return out;
}
function parseEpisodes(html, titleUrl, audio) {
  const out = [], seen = new Set();
  const re = /<a\b([^>]*\bdata-ids=["'][^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const tag = m[1], ids = attr("<a "+tag+">","data-ids");
    const n = parseInt(attr("<a "+tag+">","data-num"),10);
    const sub = attr("<a "+tag+">","data-sub") === "1";
    const dub = attr("<a "+tag+">","data-dub") === "1";
    if (!ids || (audio === "dub" ? !dub : !(sub || !dub))) continue;
    const epName = firstMatch(m[2], [/<span\b[^>]*class=["'][^"']*d-title[^"']*["'][^>]*>([\s\S]*?)<\/span>/i]) ||
      attr("<div "+(m[1]||"")+">","title") || ("Episode " + (Number.isFinite(n) ? n : out.length+1));
    const key = ids + "|" + audio;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({title: epName, name: epName, href: "anikoto|" + titleUrl + "|" + ids + "|" + audio,
      url: "anikoto|" + titleUrl + "|" + ids + "|" + audio,
      episode: Number.isFinite(n) ? n : out.length+1, number: Number.isFinite(n) ? n : out.length+1,
      season:"1", audio, contentType:"video"});
  }
  return out;
}
async function searchResults(query, page) {
  const q = String(query || "").trim();
  if (!q) return homeResults(page);
  const url = BASE + "/filter?keyword=" + encodeURIComponent(q);
  return htmlCards(await get(url));
}
async function homeResults(page) {
  const p = Math.max(1, parseInt(page,10) || 1);
  const paths = [
    ["/latest-updated","Latest Updated"],
    ["/most-viewed","Most Popular"],
    ["/status/currently-airing","Ongoing"],
    ["/type/movie","Movies"]
  ];
  const results = [];
  for (const item of paths) {
    try {
      const html = await get(BASE + item[0] + "?page=" + p);
      for (const card of htmlCards(html)) {
        card.category = item[1];
        if (!results.some(x=>x.href===card.href)) results.push(card);
      }
    } catch (_) {}
  }
  return results;
}
async function extractDetails(href) {
  const url = absolute(href);
  if (!url || !/^https?:\\/\\//i.test(url)) throw new Error("AniKoto title URL is invalid.");
  const html = await get(url);
  // Match the upstream provider's title selectors, in priority order.
  let title = firstMatch(html, [
    /<div\\b[^>]*id=["']w-info["'][^>]*>[\\s\\S]*?<h1\\b[^>]*class=["'][^"']*\\btitle\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/h1>/i,
    /<h1\\b[^>]*itemprop=["']name["'][^>]*>([\\s\\S]*?)<\\/h1>/i,
    /<[^>]+class=["'][^"']*\\btitle\\b[^"']*["'][^>]*itemprop=["']name["'][^>]*>([\\s\\S]*?)<\\/[^>]+>/i,
    /<h1\\b[^>]*class=["'][^"']*\\btitle\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/h1>/i
  ]);
  if (!title || /^page\\s*\\d+$/i.test(title)) {
    // Some templates put the title attribute on the anime heading.
    const heading = html.match(/<h1\\b[^>]*>([\\s\\S]*?)<\\/h1>/i);
    const candidate = heading ? strip(heading[1]) : "";
    if (candidate && !/^page\\s*\\d+$/i.test(candidate)) title = candidate;
  }
  if (!title || /^page\\s*\\d+$/i.test(title)) {
    throw new Error("AniKoto title page did not contain a readable anime title. The selected link may be a pagination page.");
  }
  const imgTag = (html.match(/<(?:img|meta)\b[^>]*(?:itemprop=["']image["']|property=["']og:image["']|class=["'][^"']*poster[^"']*)[^>]*>/i)||[])[0] || "";
  const image = attr(imgTag,"content") || attr(imgTag,"data-src") || attr(imgTag,"src");
  const description = firstMatch(html, [
    /<div\b[^>]*class=["'][^"']*synopsis[^"']*["'][^>]*>[\s\S]*?<div\b[^>]*class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div\b[^>]*class=["'][^"']*synopsis[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  ]);
  const genres = listFromAnchors(html,"/genre/");
  const idMatch = html.match(/data-id=["'](\d+)["']/i);
  const animeId = idMatch ? idMatch[1] : "";
  let subEpisodes = [], dubEpisodes = [];
  if (animeId) {
    try {
      const headers = { "User-Agent":UA, "X-Requested-With":"XMLHttpRequest",
        "Accept":"application/json, text/javascript, */*; q=0.01", "Referer":url };
      const json = await get(BASE + "/ajax/episode/list/" + animeId, headers);
      const episodeHtml = jsonResult(json);
      if (typeof episodeHtml === "string") {
        subEpisodes = parseEpisodes(episodeHtml,url,"sub");
        dubEpisodes = parseEpisodes(episodeHtml,url,"dub");
      }
    } catch (_) {}
  }
  if (!subEpisodes.length && !dubEpisodes.length) {
    const re = /<a\b([^>]*href=["'][^"']*\/ep-[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
    let m, i=0;
    while ((m=re.exec(html))) {
      const epUrl = absolute(attr("<a "+m[1]+">","href"),url);
      if (!epUrl) continue;
      i++;
      subEpisodes.push({title:strip(m[2]) || "Episode "+i, href:epUrl, url:epUrl, episode:i, number:i, season:"1"});
    }
  }
  return {title, href:url, url, image:absolute(image,url), poster:absolute(image,url), description,
    plot:description, genres, tags:genres, contentType:"video", episodes:subEpisodes, dubbedEpisodes:dubEpisodes};
}
async function extractEpisodes(href) {
  const details = await extractDetails(href);
  const all = details.episodes.concat(details.dubbedEpisodes);
  all.sort((a,b)=>(a.episode||0)-(b.episode||0));
  return all;
}
async function resolveEpisode(episodeHref, audio) {
  const raw = String(episodeHref || "");
  const parts = raw.split("|");
  if (parts[0] !== "anikoto" || parts.length < 4) {
    if (/^https?:/i.test(raw)) return {url:raw, headers:{Referer:raw}};
    throw new Error("AniKoto episode reference is not supported.");
  }
  const referer = parts[1], ids = parts[2], type = (audio === "dub" || parts[3] === "dub") ? "dub" : "sub";
  const headers = { "User-Agent":UA, "X-Requested-With":"XMLHttpRequest",
    "Accept":"application/json, text/javascript, */*; q=0.01", "Referer":referer };
  const serverList = jsonResult(await get(BASE + "/ajax/server/list?servers=" + encodeURIComponent(ids),headers));
  if (typeof serverList !== "string") throw new Error("AniKoto did not return a server list.");
  const groups = serverList.match(/<div\b[^>]*class=["'][^"']*type[^"']*["'][^>]*>[\s\S]*?<\/div>/gi) || [];
  let entries = [];
  for (const group of groups) {
    const gType = attr((group.match(/<div\b[^>]*>/i)||[])[0]||"","data-type");
    if (type === "dub" ? gType === "dub" : (gType === "sub" || gType === "hsub")) {
      const li = group.match(/<li\b[^>]*data-link-id=["'][^"']+["'][^>]*>/gi) || [];
      for (const tag of li) entries.push({id:attr(tag,"data-link-id"),name:strip(tag)});
    }
  }
  if (!entries.length) {
    const li = serverList.match(/<li\b[^>]*data-link-id=["'][^"']+["'][^>]*>/gi) || [];
    entries = li.map(tag=>({id:attr(tag,"data-link-id"),name:strip(tag)}));
  }
  for (const entry of entries) {
    try {
      const res = jsonResult(await get(BASE + "/ajax/server?get=" + encodeURIComponent(entry.id),headers));
      let embed = res && typeof res === "object" ? res.url : "";
      if (!embed) continue;
      embed = absolute(embed,BASE);
      if (type === "dub" && /\/sub(?:[/?#]|$)/.test(embed)) embed=embed.replace("/sub","/dub");
      if (type === "sub" && /\/dub(?:[/?#]|$)/.test(embed)) embed=embed.replace("/dub","/sub");
      const stream = await resolveEmbed(embed,referer,type);
      if (stream) return {url:stream.url,headers:stream.headers||{Referer:embed}, subtitles:stream.subtitles||[], title:entry.name};
    } catch (_) {}
  }
  throw new Error("AniKoto server list was found, but no playable stream could be resolved. This host may need a dedicated extractor.");
}
async function resolveEmbed(embed, referer, audio) {
  const html = await get(embed,{"User-Agent":UA,"Accept":"text/html,*/*","Referer":referer});
  const hash = embed.split("#")[1] || "";
  if (hash) {
    try {
      const decoded = typeof atob === "function" ? atob(hash) : "";
      const m = decoded.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
      if (m) return {url:m[0].replace(/\\\//g,"/"),headers:{Referer:embed,Origin:"https://mewcdn.online"}};
    } catch (_) {}
  }
  const direct = html.match(/https?:\\?\/\\?\/[^\s"'<>]+\.(?:m3u8|mp4)(?:\?[^\s"'<>]*)?/i);
  if (direct) return {url:direct[0].replace(/\\\//g,"/"),headers:{Referer:embed}};
  const dataId = (html.match(/data-(?:real)?id=["'](\d+)["']/i)||[])[1] ||
    (embed.match(/\/stream\/s-\d+\/(\d+)\//)||[])[1];
  if (dataId && /megaplay|vidwish|vidtube/i.test(embed)) {
    const host = new URL(embed).origin;
    const ajax = {"User-Agent":UA,"Accept":"*/*","X-Requested-With":"XMLHttpRequest","Origin":host,"Referer":embed};
    for (const endpoint of ["getSourcesNew","getSources"]) {
      try {
        const data = await get(host+"/stream/"+endpoint+"?id="+encodeURIComponent(dataId)+"&type="+audio,ajax);
        const obj = JSON.parse(data);
        const sources = obj.sources;
        const file = (sources && !Array.isArray(sources) && sources.file) ||
          (Array.isArray(sources) && sources[0] && sources[0].file);
        if (file) return {url:absolute(file,host),headers:{Referer:embed}};
      } catch (_) {}
    }
  }
  return null;
}
const api = {
  apiVersion:1, contentType:"video",
  search:searchResults, home:homeResults, details:extractDetails, episodes:extractEpisodes,
  stream:resolveEpisode
};
globalThis.LuminaModule = api;
// Lumina Player legacy handler aliases
globalThis.searchResults = (query,page) => api.search(query,page);
globalThis.discoveryHome = (page) => api.home(page);
globalThis.extractHome = (page) => api.home(page);
globalThis.extractDetails = (href) => api.details(href);
globalThis.extractEpisodes = (href) => api.episodes(href);
globalThis.extractStreamUrl = (href,audio,preferDub) => api.stream(href,audio,preferDub ? "dub" : audio);

})();
