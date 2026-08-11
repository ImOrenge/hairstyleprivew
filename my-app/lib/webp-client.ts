import type { PhotoCropTransform } from "@hairfit/shared";

const DEFAULT_WEBP_QUALITY = 0.9;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (isHttpUrl(src)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

export async function convertImageSrcToWebpDataUrl(
  src: string,
  quality = DEFAULT_WEBP_QUALITY,
): Promise<string | null> {
  const normalizedSrc = src.trim();
  if (!normalizedSrc) {
    return null;
  }

  if (normalizedSrc.startsWith("data:image/webp")) {
    return normalizedSrc;
  }

  if (!isBrowser()) {
    return null;
  }

  try {
    const img = await loadImage(normalizedSrc);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.drawImage(img, 0, 0, width, height);
    const webpDataUrl = canvas.toDataURL("image/webp", quality);
    if (!webpDataUrl.startsWith("data:image/webp")) {
      return null;
    }

    return webpDataUrl;
  } catch {
    return null;
  }
}

export async function convertImageFileToWebp(
  file: File,
  quality = DEFAULT_WEBP_QUALITY,
): Promise<File> {
  if (file.type === "image/webp") {
    return file;
  }

  if (!isBrowser()) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const webpDataUrl = await convertImageSrcToWebpDataUrl(objectUrl, quality);
    if (!webpDataUrl) {
      return file;
    }

    const response = await fetch(webpDataUrl);
    if (!response.ok) {
      return file;
    }

    const webpBlob = await response.blob();
    if (webpBlob.type !== "image/webp") {
      return file;
    }

    const baseName = file.name.replace(/\.[^/.]+$/, "") || "image";
    return new File([webpBlob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function cropImageFileToWebp(
  file: File,
  crop: PhotoCropTransform,
  quality = DEFAULT_WEBP_QUALITY,
): Promise<File> {
  if (!isBrowser()) return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error("image_size_invalid");
    const sourceX = Math.round(crop.x * sourceWidth);
    const sourceY = Math.round(crop.y * sourceHeight);
    const croppedWidth = Math.max(1, Math.min(sourceWidth - sourceX, Math.round(crop.width * sourceWidth)));
    const croppedHeight = Math.max(1, Math.min(sourceHeight - sourceY, Math.round(crop.height * sourceHeight)));
    const canvas = document.createElement("canvas");
    canvas.width = crop.outputWidth;
    canvas.height = crop.outputHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_unavailable");
    context.drawImage(image, sourceX, sourceY, croppedWidth, croppedHeight, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("image_encode_failed")),
      "image/webp",
      quality,
    ));
    const baseName = file.name.replace(/\.[^/.]+$/, "") || "consultation-photo";
    return new File([blob], `${baseName}-crop.webp`, { type: "image/webp", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
