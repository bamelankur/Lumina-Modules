// Lumina Module API v1 — playback diagnostic provider.
// The public Big Buck Bunny sample is used only to verify the playback pipeline.
const sample = {
  title: "Big Buck Bunny — Lumina Playback Test",
  href: "lumina-demo-big-buck-bunny",
  image: "https://peach.blender.org/wp-content/uploads/title_anouncement.jpg?x11217",
  year: "2008",
  description: "Public sample video used to test Lumina playback."
};

globalThis.LuminaModule = {
  apiVersion: 1,
  contentType: "video",

  search(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q || sample.title.toLowerCase().includes(q) || "big buck bunny playback test".includes(q)) {
      return [sample];
    }
    return [];
  },

  details(href) {
    if (href !== sample.href) return null;
    return { ...sample, description: "Lumina diagnostic item. Select the episode to test playback." };
  },

  episodes(href) {
    if (href !== sample.href) return [];
    return [{
      title: "Sample video",
      href: "lumina-demo-big-buck-bunny-episode-1",
      season: "1"
    }];
  },

  stream(episodeHref) {
    if (episodeHref !== "lumina-demo-big-buck-bunny-episode-1") return null;
    return {
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      headers: {}
    };
  },

  home() {
    return [sample];
  }
};
