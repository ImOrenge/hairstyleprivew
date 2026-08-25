type SharpFactory = typeof import("sharp")["default"];

let sharpFactoryPromise: Promise<SharpFactory> | null = null;

export function loadSharp(): Promise<SharpFactory> {
  sharpFactoryPromise ??= import("sharp").then((module) => module.default);
  return sharpFactoryPromise;
}
