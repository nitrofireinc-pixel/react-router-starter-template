/** Site Studio video blocks: one source, then a check that a video file is there. */

export const VIDEO_MAX_BYTES = 80 * 1024 * 1024;
export const ASSET_VIDEO_PATHS = ["/assets/efhs-gallery-collage.mp4"];

const ASSET_SRC = /^\/assets\/[a-z0-9._/-]+\.(mp4|webm|ogg|mov)$/i;
const UPLOAD_SRC = /^\/uploads\/studio\/[a-z0-9-]+\/[a-z0-9-]+\.(mp4|webm|ogg)$/;

export function sniffVideoType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "video/mp4";
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (b.length >= 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return "video/ogg";
  return "";
}

export function isBlockedVideoHost(host = "") {
  const h = String(host || "").toLowerCase().replace(/\.+$/, "");
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal" || h === "169.254.169.254") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** https video address, or a site path under /assets or /uploads/studio. */
export function safeVideoSrc(value = "") {
  const src = String(value || "").trim();
  if (!src || src.length > 2000 || /[\s<>"']/.test(src)) return "";
  if (ASSET_SRC.test(src) || UPLOAD_SRC.test(src)) return src;
  if (!/^https:\/\//i.test(src)) return "";
  try {
    const url = new URL(src);
    if (url.username || url.password || isBlockedVideoHost(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

/** Exactly one of upload, asset, or address. */
export function chosenVideoSource({ fileName = "", asset = "", url = "" } = {}) {
  const file = String(fileName || "").trim();
  const picked = String(asset || "").trim();
  const link = String(url || "").trim();
  const filled = [file && "upload", picked && "asset", link && "url"].filter(Boolean);
  if (filled.length !== 1) {
    return { ok: false, detail: filled.length ? "Choose only one video." : "Choose one video." };
  }
  if (file) return { ok: true, kind: "upload", name: file };
  if (picked) return { ok: true, kind: "asset", src: picked };
  return { ok: true, kind: "url", src: link };
}

export function videoPropsError(src, { draft = false } = {}) {
  const value = String(src || "").trim();
  if (!value) return draft ? "" : "video block needs a video";
  if (!safeVideoSrc(value)) return "video needs a safe file address";
  return "";
}

async function readPrefix(response, max = 64) {
  if (!response?.body?.getReader) {
    const buf = new Uint8Array(await response.arrayBuffer());
    return buf.slice(0, max);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let got = 0;
  while (got < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(got);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.slice(0, max);
}

/** Follow a few https redirects and require a video file, not an HTML page. */
export async function verifyRemoteVideo(src, fetchImpl = fetch) {
  let url = safeVideoSrc(src);
  if (!url || url.startsWith("/")) return { ok: false, detail: "Use an https address to a video file." };
  for (let hop = 0; hop < 4; hop += 1) {
    const res = await fetchImpl(url, { method: "GET", headers: { Range: "bytes=0-63" }, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location") || "";
      let next = "";
      try { next = new URL(loc, url).toString(); } catch { next = ""; }
      if (!next || !safeVideoSrc(next) || next.startsWith("/")) {
        return { ok: false, detail: "That address did not return a video file." };
      }
      url = next;
      continue;
    }
    if (!(res.ok || res.status === 206)) return { ok: false, detail: "That address did not return a video file." };
    const type = String(res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (type.startsWith("text/html") || type.startsWith("application/xhtml")) {
      await readPrefix(res, 1);
      return { ok: false, detail: "That address is a web page, not a video file." };
    }
    const bytes = await readPrefix(res, 64);
    const sniffed = sniffVideoType(bytes);
    if (sniffed || type.startsWith("video/") || type === "application/mp4") {
      return { ok: true, src: url, mime: sniffed || (type.startsWith("video/") ? type : "video/mp4") };
    }
    return { ok: false, detail: "That address did not return a video file." };
  }
  return { ok: false, detail: "That address did not return a video file." };
}

/** Pixel box for a video block. Column span sets the width; row span sets the height. */
export function videoFrameStyle(block, { columns = 12, rowUnit = 40, gap = 16, includeWidth = true } = {}) {
  const rows = Math.max(1, Number(block?.h) || 1);
  const cols = Math.max(1, Math.min(columns, Number(block?.w) || columns));
  const height = rows * rowUnit + Math.max(0, rows - 1) * gap;
  const box = `height:${height}px;min-height:0;overflow:hidden;align-self:start`;
  if (!includeWidth) return box;
  const width = +((cols / columns) * 100).toFixed(3);
  return `width:${width}%;max-width:100%;${box}`;
}

export function renderVideoInner(props = {}, { annotate = false, escapeHtml = (v) => String(v ?? "") } = {}) {
  const src = safeVideoSrc(props.src);
  if (!src) {
    if (!annotate) return "";
    return '<div class="studio-video-empty" style="box-sizing:border-box;width:100%;height:100%;min-height:160px;display:flex;align-items:center;justify-content:center;border:2px dashed #2f7de1;border-radius:12px;background:#f3f8ff;color:#0b2a5b;font:700 16px/1.3 system-ui,sans-serif">Choose a video</div>';
  }
  const title = escapeHtml(props.title || "Video");
  return `<video src="${escapeHtml(src)}" controls playsinline preload="metadata" title="${title}"></video>`;
}
