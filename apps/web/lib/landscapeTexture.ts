import type { Texture } from "ogl";

/** Suppress OGL 1.0.11's WebGL2-only R-axis setter on WebGL1's 2D sampler. */
export function prepareLandscapeTexture(texture: Texture, webgl2: boolean): void {
  if (!webgl2) Object.assign(texture.state, { wrapR: texture.wrapR });
}
