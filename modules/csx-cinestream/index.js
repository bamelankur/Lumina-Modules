// Lumina Module API v1
// Independent metadata/catalog adapter inspired by CineStream's Stremio/Cinemeta catalogue usage.
// CloudStream-specific extractors are not included; metadata results alone do not guarantee playable sources.
const META="https://v3-cinemeta.strem.io";
function enc(s){return encodeURIComponent(String(s||"").trim())}
async function json(u){const r=await fetch(u,{headers:{"Accept":"application/json"}});if(!r.ok)throw new Error("CineStream catalogue request failed ("+r.status+")");return r.json()}
function mapMeta(m){return {title:m.name||m.title||"Untitled",name:m.name||m.title||"Untitled",href:m.imdb_id||m.id||"",url:m.imdb_id||m.id||"",poster:m.poster||"",image:m.poster||"",description:m.description||"",plot:m.description||"",year:m.year||"",type:m.type||"movie",genres:m.genre||[],rating:m.imdbRating||""}}
async function search(q){if(!String(q||"").trim())return [];const kinds=["movie","series"];const out=[];for(const k of kinds){try{const d=await json(META+"/catalog/"+k+"/top/search="+enc(q)+".json");for(const x of d.metas||[])out.push({...mapMeta(x),type:k})}catch(_){}}return [...new Map(out.map(x=>[x.href,x])).values()]}
async function home(){const out=[];for(const k of ["movie","series"]){try{const d=await json(META+"/catalog/"+k+"/top.json");for(const x of d.metas||[])out.push({...mapMeta(x),type:k})}catch(_){}}return out}
async function details(id){const raw=(id&&typeof id==="object")?(id.href||id.url||id.id||id.title||""):id;const key=String(raw||"").trim();if(!key)throw new Error("CineStream details requires a catalogue result, IMDb ID, or title");const imdbMatch=key.match(/tt\d+/);if(!imdbMatch&&!/^\w+:[^\s]+$/.test(key)){const found=await search(key);const exact=found.find(x=>String(x.title||"").trim().toLowerCase()===key.toLowerCase())||found[0];if(exact&&exact.href&&exact.href!==key)return await details(exact.href)}const imdb=imdbMatch?imdbMatch[0]:key;const preferred=/series|tv/i.test(String((id&&id.type)||""))?"series":"movie";for(const k of [preferred,preferred==="movie"?"series":"movie"]){try{const d=await json(META+"/meta/"+k+"/"+enc(imdb)+".json");if(d.meta){const item=mapMeta(d.meta);const videos=Array.isArray(d.meta.videos)?d.meta.videos:[];return {...item,href:imdb,url:imdb,episodes:videos.map(v=>({title:v.name||v.title||"Episode",name:v.name||v.title||"Episode",season:v.season,episode:v.episode,href:v.id,url:v.id,poster:v.thumbnail||""}))}}}catch(_){}}throw new Error("CineStream metadata was not found for "+key)}
async function episodes(id){let d;try{d=await details(id)}catch(e){const title=(id&&typeof id==="object")?(id.title||id.name||"Movie"):String(id||"Movie");return [{title,name:title,href:String((id&&typeof id==="object")?(id.href||id.url||id.id||title):id||title),url:String((id&&typeof id==="object")?(id.href||id.url||id.id||title):id||title),season:1,episode:1,metadataOnly:true}]}const list=Array.isArray(d.episodes)?d.episodes:[];if(list.length)return list;if(String(d.type||"").toLowerCase()==="movie"||String(d.type||"").toLowerCase()==="film"||! /series|tv/i.test(String(d.type||""))){const href=d.href||d.url||String(id||"");return [{title:d.title||"Movie",name:d.title||"Movie",href,url:href,season:1,episode:1,metadataOnly:true}]}return []}
async function stream(id){const v=String(id||"");if(/^https?:\/\//i.test(v)&&/\.(mp4|m3u8|mpd)(\?|$)/i.test(v))return {url:v,headers:{},source:"CineStream"};throw new Error("CineStream metadata does not contain a playable media URL. A direct authorized media URL or a compatible provider source resolver is required.")}
globalThis.LuminaModule={apiVersion:1,contentType:"video",search,details,episodes,stream,home};

 
// Lumina Player compatibility bridge.
// Lumina Player calls these handler names directly on globalThis.
(function installLuminaPlayerHandlers() {
  const api = globalThis.LuminaModule;
  if (!api || typeof api !== "object") return;
  globalThis.searchResults = function (query) {
    return typeof api.search === "function" ? api.search(query) : [];
  };
  globalThis.extractDetails = function (href) {
    return typeof api.details === "function" ? api.details(href) : null;
  };
  globalThis.extractEpisodes = function (href) {
    return typeof api.episodes === "function" ? api.episodes(href) : [];
  };
  globalThis.extractStreamUrl = function (episodeHref, audio, preferDub) {
    return typeof api.stream === "function" ? api.stream(episodeHref, audio, preferDub) : null;
  };
  globalThis.extractHome = function () {
    return typeof api.home === "function" ? api.home() : [];
  };
  globalThis.discoveryHome = function () {
    return typeof api.home === "function" ? api.home() : [];
  };
})();
