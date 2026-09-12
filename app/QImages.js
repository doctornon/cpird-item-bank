"use client";
// Shared safe image renderers for question stems and options.
// Images are structured data (no HTML injection): {url, align, width%}.
export function StemImages({ images }) {
  if (!images || !images.length) return null;
  return (
    <div className="q-images">
      {images.map((im, i) => (
        <div key={i} style={{ textAlign: im.align || "center", margin: "8px 0" }}>
          <img src={im.url} alt="" loading="lazy" style={{ width: (im.width || 60) + "%", maxWidth: "100%", borderRadius: 8, verticalAlign: "middle" }} />
        </div>
      ))}
    </div>
  );
}
export function OptImage({ url, width }) {
  if (!url) return null;
  return <div style={{ marginTop: 6 }}><img src={url} alt="" loading="lazy" style={{ width: (width || 50) + "%", maxWidth: "100%", borderRadius: 6 }} /></div>;
}
