const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const requests = [];
const context = {
  URL, Map, Number, String, Array, Object, Math, encodeURIComponent, decodeURIComponent,
  fetch: async (url, options) => {
    requests.push({ url, options });
    let data;
    if (url.includes("/player/movie/11")) {
      data = { sources: [{ url: "https://cdn.example.test/video.m3u8", provider: { id: "sample" }, quality: "1080p", type: "hls" }], subtitles: [{ url: "https://cdn.example.test/sub.vtt", label: "English" }] };
    } else if (url.includes("/player/tv/22/1/1")) {
      data = { sources: [{ url: "https://cdn.example.test/ep.m3u8", provider: { id: "sample" }, type: "hls" }] };
    } else if (url.includes("/search/multi")) {
      data = { results: [{ id: 11, media_type: "movie", title: "Test Movie", poster_path: "/p.jpg", overview: "desc", release_date: "2020-01-01" }] };
    } else if (url.includes("/tv/22/season/1")) {
      data = { episodes: [{ id: 100, season_number: 1, episode_number: 1, name: "Pilot", still_path: "/ep.jpg", overview: "first" }] };
    } else if (url.includes("/tv/22")) {
      data = { id: 22, name: "Test Show", seasons: [{ season_number: 1, episode_count: 1 }], overview: "show" };
    } else if (url.includes("/movie/11")) {
      data = { id: 11, title: "Test Movie", overview: "details", poster_path: "/p.jpg", backdrop_path: "/b.jpg", genres: [{ name: "Drama" }], vote_average: 8, release_date: "2020-01-01" };
    } else {
      throw new Error("Unexpected URL: " + url);
    }
    return { ok: true, status: 200, json: async () => data };
  }
};
context.globalThis = context;
vm.runInNewContext(fs.readFileSync("modules/kdesa-cornclick/index.js", "utf8"), context);

(async () => {
  const api = context.LuminaModule;
  assert.strictEqual(api.apiVersion, 1);
  const results = await api.search("Test");
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].title, "Test Movie");
  const details = await api.details(results[0].href);
  assert.strictEqual(details.title, "Test Movie");
  assert.deepStrictEqual(Array.from(details.genres), ["Drama"]);
  const movieEpisodes = await api.episodes(results[0].href);
  assert.strictEqual(movieEpisodes.length, 1);
  const movieStream = await api.stream(movieEpisodes[0].href, "Original");
  assert.strictEqual(movieStream.streams[0].url, "https://cdn.example.test/video.m3u8");
  assert.strictEqual(movieStream.streams[0].subtitles.length, 1);
  const tvEpisodes = await api.episodes("tv|22|Test Show");
  assert.strictEqual(tvEpisodes.length, 1);
  assert.strictEqual(tvEpisodes[0].episode, 1);
  const tvStream = await api.stream(tvEpisodes[0].href, "English");
  assert.strictEqual(tvStream.streams[0].url, "https://cdn.example.test/ep.m3u8");
  console.log("PASS: Lumina contract, search, details, movie episode, TV episodes, and movie/TV stream mapping");
  console.log("Mocked requests:", requests.length);
})().catch(error => { console.error(error); process.exit(1); });
