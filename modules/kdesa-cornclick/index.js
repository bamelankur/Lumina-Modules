// SPDX-License-Identifier: GPL-3.0-or-later
// Lumina Module API v1 — first, deliberately narrow port from KSHITIJ8473/raghav/Kdesa.
// Upstream project: https://github.com/KSHITIJ8473/raghav (GPL-3.0-or-later).
// Catalog logic is reimplemented against TMDB; source discovery uses the upstream
// KDesa provider's CornClick JSON endpoint only. No Cloudflare, DRM, login, or
// access-control bypass code is included.
// TMDB attribution: metadata/images are from The Movie Database (TMDB); not endorsed by TMDB.

const TMDB_API = "https://api.themoviedb.org/3";
function tmdbApiKey() {
  const config = globalThis.LuminaModuleConfig;
  const key = config && typeof config.tmdbApiKey === "string" ? config.tmdbApiKey.trim() : "";
  if (!key) throw new Error("TMDB API key is not configured for this module.");
  return key;
}
const TMDB_IMAGE = "https://image.tmdb.org/t/p/w500";
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/original";
const CORNCLICK = "https://cornclick.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const itemCache = new Map();

function str(value) { return value == null ? "" : String(value); }
function img(path, size = TMDB_IMAGE) { return path ? size + path : ""; }
function encode(value) { return encodeURIComponent(str(value)); }
function parseHref(href) {
  const parts = str(href).split("|");
  if (parts.length < 3 || !["movie", "tv"].includes(parts[0])) return null;
  const id = Number(parts[1]);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (parts[0] === "movie") return { type: "movie", id, title: parts.slice(2).join("|") };
  if (parts.length >= 5 && /^\d+$/.test(parts[2]) && /^\d+$/.test(parts[3])) {
    return { type: "tv", id, season: Number(parts[2]), episode: Number(parts[3]), title: parts.slice(4).join("|") };
  }
  return { type: "tv", id, title: parts.slice(2).join("|") };
}
async function requestJson(url, options = {}) {
  if (typeof fetch !== "function") throw new Error("Lumina runtime does not expose fetch()");
  const response = await fetch(url, { ...options, method: options.method || "GET", headers: { "User-Agent": UA, "Accept": "application/json,*/*;q=0.8", ...(options.headers || {}) } });
  if (!response || !response.ok) throw new Error("Request failed (" + (response ? response.status : "no response") + ")");
  return response.json();
}
async function tmdb(path) {
  const sep = path.includes("?") ? "&" : "?";
  return await requestJson(TMDB_API + path + sep + "api_key=" + encode(tmdbApiKey()) + "&language=en-US");
}
function mapResult(row, defaultType) {
  const type = row.media_type || defaultType;
  if (!row.id || !["movie", "tv"].includes(type)) return null;
  const title = type === "movie" ? (row.title || row.name) : (row.name || row.title);
  if (!title) return null;
  const href = type + "|" + row.id + "|" + title;
  const result = {
    title, href, image: img(row.poster_path),
    year: str(row.release_date || row.first_air_date).slice(0, 4),
    description: str(row.overview), contentType: "video",
    mediaType: type, source: "TMDB"
  };
  itemCache.set(href, result);
  return result;
}
function titleOf(detail, type, fallback) { return str(type === "movie" ? (detail.title || detail.name || fallback) : (detail.name || detail.title || fallback)); }

const api = {
  apiVersion: 1,
  contentType: "video",

  async search(query) {
    const q = str(query).trim();
    if (!q) return [];
    const data = await tmdb("/search/multi?query=" + encode(q) + "&page=1&include_adult=false");
    return (data.results || []).map(row => mapResult(row)).filter(Boolean);
  },

  async home() {
    const data = await tmdb("/trending/all/day?page=1");
    return (data.results || []).map(row => mapResult(row)).filter(Boolean);
  },

  async details(href) {
    const ref = parseHref(href);
    if (!ref) return null;
    const data = await tmdb("/" + ref.type + "/" + ref.id);
    const title = titleOf(data, ref.type, ref.title);
    const genres = Array.isArray(data.genres) ? data.genres.map(x => x.name).filter(Boolean) : [];
    const detail = {
      title, href: ref.type + "|" + ref.id + "|" + title,
      image: img(data.poster_path), background: img(data.backdrop_path, TMDB_BACKDROP),
      year: str(data.release_date || data.first_air_date).slice(0, 4),
      description: str(data.overview), genres, rating: data.vote_average == null ? null : data.vote_average,
      contentType: "video", mediaType: ref.type, source: "TMDB"
    };
    itemCache.set(detail.href, detail);
    return detail;
  },

  async episodes(href) {
    const ref = parseHref(href);
    if (!ref) return [];
    if (ref.type === "movie") {
      return [{ title: ref.title || (itemCache.get(href) || {}).title || "Movie", href: "movie|" + ref.id + "|" + (ref.title || "Movie"), season: "1", episode: 1, languages: ["Original"] }];
    }
    const detail = await tmdb("/tv/" + ref.id);
    const title = titleOf(detail, "tv", ref.title);
    const seasons = (detail.seasons || []).filter(s => Number(s.season_number) > 0 && Number(s.episode_count) > 0);
    const out = [];
    for (const season of seasons) {
      try {
        const seasonData = await tmdb("/tv/" + ref.id + "/season/" + season.season_number);
        for (const ep of (seasonData.episodes || [])) {
          out.push({
            title: str(ep.name) || ("Episode " + ep.episode_number),
            href: "tv|" + ref.id + "|" + ep.season_number + "|" + ep.episode_number + "|" + title,
            season: str(ep.season_number), episode: Number(ep.episode_number),
            image: img(ep.still_path), description: str(ep.overview),
            year: str(ep.air_date).slice(0, 4), languages: ["Original"]
          });
        }
      } catch (_) { /* keep other seasons if one season endpoint fails */ }
    }
    return out;
  },

  async stream(episodeHref, language) {
    const ref = parseHref(episodeHref);
    if (!ref) return null;
    const isEpisode = ref.type === "tv" && Number.isInteger(ref.season) && Number.isInteger(ref.episode);
    if (ref.type === "tv" && !isEpisode) throw new Error("Select a specific TV episode before playback.");
    const path = isEpisode
      ? "/player/tv/" + ref.id + "/" + ref.season + "/" + ref.episode
      : "/player/movie/" + ref.id;
    const data = await requestJson(CORNCLICK + path, {
      headers: { "Accept": "application/json", "Origin": CORNCLICK, "Referer": CORNCLICK + "/" }
    });
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const streams = sources.filter(s => /^https?:\/\//i.test(str(s.url))).map(s => ({
      url: str(s.url),
      label: [str(s.provider && s.provider.id || "CornClick"), str(s.quality || "")].filter(Boolean).join(" "),
      headers: { "User-Agent": UA, "Origin": CORNCLICK, "Referer": CORNCLICK + "/" },
      type: /^hls$/i.test(str(s.type)) || /\.m3u8(?:\?|$)/i.test(str(s.url)) ? "hls" : "video",
      language: str(language || "Original")
    }));
    const subtitles = Array.isArray(data.subtitles) ? data.subtitles.filter(s => /^https?:\/\//i.test(str(s.url)) && !/\.gz(?:\?|$)/i.test(str(s.url))).map(s => ({ label: str(s.label || s.lang || "Subtitle"), url: str(s.url) })) : [];
    streams.forEach(s => { s.subtitles = subtitles; });
    if (!streams.length) throw new Error("CornClick returned no direct media sources for this title/episode.");
    return { streams };
  }
};

globalThis.LuminaModule = api;

// Legacy Lumina Player handler bridge used by existing native modules.
globalThis.searchResults = (query) => api.search(query);
globalThis.extractDetails = (href) => api.details(href);
globalThis.extractEpisodes = (href) => api.episodes(href);
globalThis.extractStreamUrl = (href, audio, preferDub) => api.stream(href, audio || (preferDub ? "English" : "Original"));
globalThis.extractHome = () => api.home();
globalThis.discoveryHome = () => api.home();
