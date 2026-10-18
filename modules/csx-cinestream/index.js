// Lumina Module API v1
// Independent metadata/catalog adapter inspired by CineStream's Stremio/Cinemeta catalogue usage.
// CloudStream-specific extractors are not included; metadata results alone do not guarantee playable sources.
const META="https://v3-cinemeta.strem.io";
function enc(s){return encodeURIComponent(String(s||"").trim())}
async function json(u){const r=await fetch(u,{headers:{"Accept":"application/json"}});if(!r.ok)throw new Error("CineStream catalogue request failed ("+r.status+")");return r.json()}
function mapMeta(m){return {title:m.name||m.title||"Untitled",name:m.name||m.title||"Untitled",href:m.imdb_id||m.id||"",url:m.imdb_id||m.id||"",poster:m.poster||"",image:m.poster||"",description:m.description||"",plot:m.description||"",year:m.year||"",type:m.type||"movie",genres:m.genre||[],rating:m.imdbRating||""}}
async function search(q){if(!String(q||"").trim())return [];const kinds=["movie","series"];const out=[];for(const k of kinds){try{const d=await json(META+"/catalog/"+k+"/top/search="+enc(q)+".json");for(const x of d.metas||[])out.push({...mapMeta(x),type:k})}catch(_){}}return [...new Map(out.map(x=>[x.href,x])).values()]}
async function home(){const out=[];for(const k of ["movie","series"]){try{const d=await json(META+"/catalog/"+k+"/top.json");for(const x of d.metas||[])out.push({...mapMeta(x),type:k})}catch(_){}}return out}
async function details(id){const key=String(id||"");if(!key)throw new Error("CineStream details requires a catalogue result/IMDb ID");const kind=/series|tv/i.test(key)?"series":"movie";const imdb=key.match(/tt\d+/)?.[0]||key;for(const k of [kind,"movie","series"]){try{const d=await json(META+"/meta/"+k+"/"+enc(imdb)+".json");if(d.meta)return {...mapMeta(d.meta),href:imdb,url:imdb,episodes:(d.meta.videos||[]).map(v=>({title:v.name||v.title||"Episode",name:v.name||v.title||"Episode",season:v.season,episode:v.episode,href:v.id,url:v.id,poster:v.thumbnail||""}))}}catch(_){}}throw new Error("CineStream metadata was not found")}
async function episodes(id){const d=await details(id);return d.episodes||[]}
async function stream(id){const v=String(id||"");if(/^https?:\/\//i.test(v)&&/\.(mp4|m3u8|mpd)(\?|$)/i.test(v))return {url:v,source:"CineStream"};throw new Error("CineStream's CloudStream extractor set cannot be run inside Lumina's JavaScript module runtime; this catalogue module can browse metadata but does not yet resolve playable streams.")}
globalThis.LuminaModule={apiVersion:1,contentType:"video",search,details,episodes,stream,home};
