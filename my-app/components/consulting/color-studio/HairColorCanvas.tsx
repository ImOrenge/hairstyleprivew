"use client";

import { useEffect, useRef, useState } from "react";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.crossOrigin = "anonymous"; image.onload = () => resolve(image); image.onerror = reject; image.src = src;
  });
}

function rgb(hex: string) { const value = Number.parseInt(hex.slice(1), 16); return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255] as const; }

function liftStrength(targetLevel: number) { return Math.max(0, Math.min(1, (targetLevel - 3) / 7)); }
function smoothMask(value: number) { const scaled = Math.max(0, Math.min(1, (value - .18) / .64)); return scaled * scaled * (3 - 2 * scaled); }

function render2d(canvas: HTMLCanvasElement, image: HTMLImageElement, mask: HTMLImageElement, hex: string, intensity: number, targetLevel: number, bleachPreview = false) {
  const context = canvas.getContext("2d"); if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const maskCanvas = document.createElement("canvas"); maskCanvas.width = canvas.width; maskCanvas.height = canvas.height; const maskContext = maskCanvas.getContext("2d"); if (!maskContext) return;
  maskContext.drawImage(mask, 0, 0, maskCanvas.width, maskCanvas.height);
  const base = context.getImageData(0, 0, canvas.width, canvas.height); const alpha = maskContext.getImageData(0, 0, canvas.width, canvas.height).data;
  const target = rgb(hex); const targetLum = Math.max(.08, target[0] * .299 + target[1] * .587 + target[2] * .114); const lift = liftStrength(targetLevel); const amount = intensity / 100;
  for (let offset = 0; offset < base.data.length; offset += 4) {
    const hair = smoothMask(alpha[offset + 3] / 255); if (hair <= 0) continue;
    const source = [base.data[offset] / 255, base.data[offset + 1] / 255, base.data[offset + 2] / 255];
    const luminance = source[0] * .299 + source[1] * .587 + source[2] * .114;
    const goal = Math.max(.05, Math.min(.92, .08 + targetLevel * .075 + (luminance - .2) * .35));
    // Even naturally dark strands must visibly reach a high lift level. The
    // luminance signal retains strand contrast, while the base lift prevents
    // level 9 from reading as a brown color overlay.
    const strandLift = lift * (.65 + .35 * smoothMask(Math.max(0, Math.min(1, (luminance - .02) / .38))));
    const liftedLum = luminance + (goal - luminance) * strandLift;
    const lifted = source.map((channel) => Math.min(1, channel * liftedLum / Math.max(.06, luminance)));
    const undertone = targetLevel >= 9 ? [1, .82, .52] : targetLevel >= 7 ? [1, .68, .34] : [0.92, .5, .24];
    const bleachBase = lifted.map((channel, index) => channel * (1 - lift * .5) + undertone[index] * liftedLum * lift * .5);
    const neutralizeUndertone = lift * .48;
    const neutralTarget = target.map((channel) => channel * (1 - neutralizeUndertone) + targetLum * neutralizeUndertone);
    const toner = neutralTarget.map((channel) => Math.min(1, channel / targetLum * liftedLum));
    const toned = bleachBase.map((channel, index) => channel * (1 - amount * .58) + toner[index] * amount * .58);
    const result = bleachPreview ? bleachBase : toned;
    for (let channel = 0; channel < 3; channel += 1) base.data[offset + channel] = Math.round((source[channel] * (1 - hair) + result[channel] * hair) * 255);
  }
  context.putImageData(base, 0, 0);
}

function renderMaskPreview(canvas: HTMLCanvasElement, image: HTMLImageElement, mask: HTMLImageElement) {
  const context = canvas.getContext("2d"); if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = "#050708"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.save(); context.globalAlpha = .34; context.filter = "grayscale(1)"; context.drawImage(image, 0, 0, canvas.width, canvas.height); context.restore();
  const layer = document.createElement("canvas"); layer.width = canvas.width; layer.height = canvas.height; const layerContext = layer.getContext("2d"); if (!layerContext) return;
  layerContext.fillStyle = "#00E5FF"; layerContext.fillRect(0, 0, layer.width, layer.height); layerContext.globalCompositeOperation = "destination-in"; layerContext.drawImage(mask, 0, 0, layer.width, layer.height);
  context.save(); context.globalAlpha = .9; context.globalCompositeOperation = "screen"; context.drawImage(layer, 0, 0); context.restore();
}

function shader(gl: WebGL2RenderingContext, type: number, source: string) {
  const value = gl.createShader(type); if (!value) throw new Error("WEBGL_SHADER_CREATE"); gl.shaderSource(value, source); gl.compileShader(value); if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(String(gl.getShaderInfoLog(value))); return value;
}

function rasterSource(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CANVAS_2D_CONTEXT");
  context.drawImage(image, 0, 0);
  return canvas;
}

function texture(gl: WebGL2RenderingContext, unit: number, image: HTMLImageElement) {
  const value = gl.createTexture(); gl.activeTexture(unit); gl.bindTexture(gl.TEXTURE_2D, value); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, rasterSource(image));
}

function renderWebgl(canvas: HTMLCanvasElement, image: HTMLImageElement, mask: HTMLImageElement, hex: string, intensity: number, targetLevel: number, bleachPreview = false) {
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: false }); if (!gl) return false;
  const program = gl.createProgram(); if (!program) return false;
  gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, `#version 300 es\nin vec2 p;out vec2 uv;void main(){uv=(p+1.0)*0.5;gl_Position=vec4(p,0,1);}`));
  gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, `#version 300 es\nprecision highp float;uniform sampler2D base;uniform sampler2D mask;uniform vec3 target;uniform float amount;uniform float salonLevel;uniform float showBleach;in vec2 uv;out vec4 outColor;void main(){vec4 b=texture(base,uv);float edge=smoothstep(.28,.88,texture(mask,uv).a);float lum=dot(b.rgb,vec3(.299,.587,.114));float lift=clamp((salonLevel-3.)/7.,0.,1.);float strandSignal=smoothstep(.02,.40,lum);float strandLift=lift*(.65+.35*strandSignal);float goalLum=clamp(.08+salonLevel*.075+(lum-.2)*.35,.05,.92);float liftedLum=mix(lum,goalLum,strandLift);vec3 lifted=clamp(b.rgb*(liftedLum/max(.06,lum)),0.,1.);vec3 undertone=salonLevel>=9.?vec3(1.,.82,.52):(salonLevel>=7.?vec3(1.,.68,.34):vec3(.92,.5,.24));vec3 bleachBase=mix(lifted,undertone*liftedLum,lift*.5);float targetLum=max(.08,dot(target,vec3(.299,.587,.114)));vec3 neutralTarget=mix(target,vec3(targetLum),lift*.48);vec3 toner=clamp(neutralTarget/targetLum*liftedLum,0.,1.);vec3 toned=mix(bleachBase,toner,amount*.58);vec3 result=mix(toned,bleachBase,showBleach);outColor=vec4(mix(b.rgb,result,edge),b.a);}`));
  gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false; gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW); const location = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  texture(gl, gl.TEXTURE0, image); texture(gl, gl.TEXTURE1, mask); gl.uniform1i(gl.getUniformLocation(program, "base"), 0); gl.uniform1i(gl.getUniformLocation(program, "mask"), 1); gl.uniform3fv(gl.getUniformLocation(program, "target"), rgb(hex)); gl.uniform1f(gl.getUniformLocation(program, "amount"), intensity / 100); gl.uniform1f(gl.getUniformLocation(program, "salonLevel"), targetLevel); gl.uniform1f(gl.getUniformLocation(program, "showBleach"), bleachPreview ? 1 : 0); gl.viewport(0, 0, canvas.width, canvas.height); gl.drawArrays(gl.TRIANGLES, 0, 6); return true;
}

export function HairColorCanvas({ imageUrl, maskUrl, swatchHex, intensity, targetLevel, before = false, bleachPreview = false, maskPreview = false, alt }: { imageUrl: string; maskUrl: string; swatchHex: string; intensity: number; targetLevel: number; before?: boolean; bleachPreview?: boolean; maskPreview?: boolean; alt: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const [renderer, setRenderer] = useState<"webgl2" | "canvas2d" | "loading">("loading");
  useEffect(() => { let active = true; void Promise.all([loadImage(imageUrl), loadImage(maskUrl)]).then(([image, mask]) => { const canvas = canvasRef.current; if (!active || !canvas) return; canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; if (maskPreview) { renderMaskPreview(canvas, image, mask); setRenderer("canvas2d"); return; } if (before) { render2d(canvas, image, mask, swatchHex, 0, targetLevel); setRenderer("canvas2d"); return; } try { if (renderWebgl(canvas, image, mask, swatchHex, intensity, targetLevel, bleachPreview)) setRenderer("webgl2"); else { render2d(canvas, image, mask, swatchHex, intensity, targetLevel, bleachPreview); setRenderer("canvas2d"); } } catch { render2d(canvas, image, mask, swatchHex, intensity, targetLevel, bleachPreview); setRenderer("canvas2d"); } }); return () => { active = false; }; }, [before, bleachPreview, imageUrl, intensity, maskPreview, maskUrl, swatchHex, targetLevel]);
  return <canvas ref={canvasRef} role="img" aria-label={alt} data-color-renderer={renderer} className="h-full w-full object-cover" />;
}
