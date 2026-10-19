// Demo scaffold only; not a real content source.
globalThis.LuminaModule = {
  apiVersion: 1, contentType: "video",
  async search(query) { return []; },
  async details(href) { return {}; },
  async episodes(href) { return []; },
  async stream(episodeHref, language) { return {}; },
  async home() { return []; }
};
