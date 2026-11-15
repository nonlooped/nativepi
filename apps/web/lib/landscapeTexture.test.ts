import { it } from "node:test";
import assert from "node:assert/strict";
import { Texture, type OGLRenderingContext } from "ogl";

import { prepareLandscapeTexture } from "./landscapeTexture";

it("uploads the landscape through WebGL1 without an unsupported R-axis sampler command", () => {
  // WebGL1 has S/T texture wrapping; TEXTURE_WRAP_R is a WebGL2-only enum.
  const supported = new Set([0x2800, 0x2801, 0x2802, 0x2803]);
  const sampler = new Map<number, number>();
  const state = { textureUnits: [] as number[], activeTextureUnit: 0, flipY: false, premultiplyAlpha: false, unpackAlignment: 4 };
  const gl = {
    TEXTURE_2D: 0x0de1, UNSIGNED_BYTE: 0x1401, RGBA: 0x1908,
    CLAMP_TO_EDGE: 0x812f, LINEAR: 0x2601, REPEAT: 0x2901,
    NEAREST_MIPMAP_LINEAR: 0x2702, TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800, TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    renderer: { parameters: { maxAnisotropy: 1 }, state, activeTexture(unit: number) { state.activeTextureUnit = unit; } },
    createTexture() { return {}; },
    bindTexture() {},
    pixelStorei() {},
    texImage2D() {},
    texParameteri(_target: number, parameter: number, value: number) {
      assert.ok(supported.has(parameter), "WebGL1 rejects this texture parameter with INVALID_ENUM");
      sampler.set(parameter, value);
    },
  };
  const texture = new Texture(gl as unknown as OGLRenderingContext, {
    generateMipmaps: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR,
  });
  prepareLandscapeTexture(texture, false);
  assert.doesNotThrow(() => texture.update());
  assert.equal(sampler.get(gl.TEXTURE_MIN_FILTER), gl.LINEAR);
  assert.equal(sampler.get(gl.TEXTURE_WRAP_S), gl.CLAMP_TO_EDGE);
  assert.equal(sampler.get(gl.TEXTURE_WRAP_T), gl.CLAMP_TO_EDGE);
});
