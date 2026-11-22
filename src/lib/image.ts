const MAX_EDGE = 1600;

/**
 * Shrinks an uploaded photo before it is stored or sent: long edge capped, flattened onto white
 * (so transparent PNGs don't turn black) and re-encoded as JPEG. Keeps requests small and fast.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.92));
}

/** Flatten an image onto pure white for factory use. */
export async function onWhite(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return blob;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? blob), "image/png"));
}

export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}

export async function downloadZip(files: { blob: Blob; name: string }[], zipName: string, white: boolean) {
  const { default: JSZip } = await import("jszip"); // loaded on demand, keeps the first page load small
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, await (white ? await onWhite(f.blob) : f.blob).arrayBuffer());
  saveBlob(await zip.generateAsync({ type: "blob" }), zipName);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "style";
