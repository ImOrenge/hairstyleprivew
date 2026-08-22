import path from "node:path";
import { Font } from "@react-pdf/renderer";

let configuredFontSource: string | null = null;
let fontRegistered = false;

export function configureReportPdfFontSource(source: string) {
  if (!source.startsWith("data:font/ttf;base64,")) {
    throw new Error("INVALID_REPORT_PDF_FONT_SOURCE");
  }
  if (fontRegistered && configuredFontSource !== source) {
    throw new Error("REPORT_PDF_FONT_ALREADY_REGISTERED");
  }
  configuredFontSource = source;
}

export function registerReportPdfFont() {
  if (fontRegistered) return;
  Font.register({
    family: "NanumGothic",
    src: configuredFontSource ?? path.join(process.cwd(), "assets", "fonts", "NanumGothic-Regular.ttf"),
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontRegistered = true;
}
