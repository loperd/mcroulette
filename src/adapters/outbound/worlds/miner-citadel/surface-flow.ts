import { MeshStandardMaterial, ShaderChunk, type IUniform } from 'three';

/** Two advected phases cross-fade at their wrap points: one PBR pass, no reflection cameras. */
export const SURFACE_FLOW_GLSL = `
uniform float citadelTime;
vec4 citadelFlow(sampler2D tex, vec2 uv, float rate) {
  float a = fract(citadelTime * rate);
  float b = fract(a + .5);
  float blend = abs(a * 2. - 1.);
  vec2 direction = vec2(sin(uv.y * 3.1) * .035, -1.);
  return mix(texture2D(tex, uv - direction * a), texture2D(tex, uv - direction * b), blend);
}`;

export function animateSurface(material: MeshStandardMaterial, family: 'water' | 'lava', time: IUniform<number>): void {
  const rate = family === 'water' ? '.18' : '.025';
  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prior.call(material, shader, renderer);
    shader.uniforms.citadelTime = time;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${SURFACE_FLOW_GLSL}`)
      .replace('#include <map_fragment>', ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', `citadelFlow( map, vMapUv, ${rate} )`))
      .replace('#include <normal_fragment_maps>', ShaderChunk.normal_fragment_maps.replaceAll('texture2D( normalMap, vNormalMapUv )', `citadelFlow( normalMap, vNormalMapUv, ${rate} )`));
    if (family === 'lava') shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', ShaderChunk.emissivemap_fragment.replace('texture2D( emissiveMap, vEmissiveMapUv )', `citadelFlow( emissiveMap, vEmissiveMapUv, ${rate} )`));
  };
  material.customProgramCacheKey = () => `citadel-pbr-flow-${family}-v1`;
  material.needsUpdate = true;
}

/** Static local lamp lighting, encoded offline; dynamic key shadows still use normal PBR. */
export function staticLampBounce(material: MeshStandardMaterial): void {
  material.vertexColors = false;
  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prior.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 color; varying vec3 vCitadelLamp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCitadelLamp = color * 4.;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCitadelLamp;')
      .replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * vCitadelLamp;\n#include <opaque_fragment>');
  };
}
