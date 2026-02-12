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
