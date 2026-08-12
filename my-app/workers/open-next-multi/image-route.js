export function resolveLocalImageAssetUrl(requestUrl) {
  const optimizerUrl = new URL(requestUrl);
  const source = optimizerUrl.searchParams.get("url");

  if (!source || !source.startsWith("/") || source.startsWith("//")) {
    return null;
  }

  let decodedSource;
  try {
    decodedSource = decodeURIComponent(source);
  } catch {
    return null;
  }

  if (
    !decodedSource.startsWith("/") ||
    decodedSource.startsWith("//") ||
    decodedSource.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(decodedSource)
  ) {
    return null;
  }

  const assetUrl = new URL(decodedSource, optimizerUrl.origin);
  if (
    assetUrl.origin !== optimizerUrl.origin ||
    assetUrl.pathname === "/_next/image"
  ) {
    return null;
  }

  return assetUrl;
}
