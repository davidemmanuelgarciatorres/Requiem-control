/**
 * Shaders WebGL2 del globo. Se dibuja un único triángulo que cubre el lienzo y el
 * fragment shader hace, por píxel: intersección con la esfera, rotación terrestre,
 * mapeo equirectangular, iluminación solar, luces de ciudad en el lado nocturno,
 * nubes, brillo especular del océano y atmósfera.
 */
export const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uDay;     // Blue Marble (día)
uniform sampler2D uNight;   // Black Marble: intensidad de luces de ciudad (canal R)
uniform sampler2D uMasks;   // R = agua, G = nubes
uniform vec2  uResolution;
uniform float uRadius;      // radio del globo en píxeles
uniform float uRotation;    // radianes
uniform float uTilt;        // inclinación axial
uniform float uPitch;       // polo norte hacia el observador
uniform vec3  uSun;         // dirección al sol (espacio de vista)

out vec4 outColor;

const float PI = 3.14159265359;

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

// Muestreo equirectangular sin costura en el antimeridiano (gradientes elegidos a mano).
vec4 sampleEq(sampler2D tex, vec3 n) {
  float u = atan(n.x, n.z) / (2.0 * PI) + 0.5;
  float v = 0.5 - asin(clamp(n.y, -1.0, 1.0)) / PI;
  float u2 = fract(u + 0.5) - 0.5;
  vec2 dx = vec2(dFdx(u), dFdx(v));
  vec2 dy = vec2(dFdy(u), dFdy(v));
  vec2 dx2 = vec2(dFdx(u2), dx.y);
  vec2 dy2 = vec2(dFdy(u2), dy.y);
  if (dot(dx2, dx2) + dot(dy2, dy2) < dot(dx, dx) + dot(dy, dy)) { dx = dx2; dy = dy2; }
  return textureGrad(tex, vec2(u, v), dx, dy);
}

float nightFactor(float cosSun) { return smoothstep(0.08, -0.22, cosSun); }

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uRadius;
  float r2 = dot(p, p);
  vec3 sun = normalize(uSun);
  vec3 atmoColor = vec3(0.36, 0.62, 1.0);

  if (r2 > 1.0) {
    // Halo atmosférico fuera del disco, más intenso del lado iluminado.
    float r = sqrt(r2);
    float lit = clamp(dot(normalize(vec3(p, 0.0)), sun) * 0.5 + 0.55, 0.0, 1.0);
    float glow = exp(-(r - 1.0) * 26.0) * (0.25 + 0.75 * lit);
    outColor = vec4(atmoColor * glow, glow);
    return;
  }

  vec3 n = vec3(p, sqrt(1.0 - r2));                 // normal en espacio de vista
  // Vista → Tierra: deshacer inclinaciones y la rotación diaria.
  mat3 toEarth = rotY(-uRotation) * rotZ(uTilt) * rotX(uPitch);
  vec3 e = toEarth * n;

  vec3 day = sampleEq(uDay, e).rgb;
  float lights = sampleEq(uNight, e).r;
  vec2 masks = sampleEq(uMasks, e).rg;
  float water = masks.r;
  float clouds = masks.g;

  float cosSun = dot(n, sun);
  float diffuse = max(cosSun, 0.0);
  float night = nightFactor(cosSun);

  // Día: superficie + nubes iluminadas.
  vec3 surface = mix(day, vec3(1.0), clouds * 0.85);
  vec3 color = surface * (0.04 + 1.05 * pow(diffuse, 0.85));

  // Océano: reflejo especular del sol.
  vec3 h = normalize(sun + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, h), 0.0), 60.0) * water * (1.0 - clouds) * 0.55;
  color += vec3(1.0, 0.92, 0.78) * spec;

  // Noche: luces de ciudad (cálidas), parcialmente ocultas por las nubes. De día no se ven.
  vec3 city = vec3(1.0, 0.74, 0.42) * lights * 3.2;
  color += city * night * (1.0 - clouds * 0.55);

  // Línea del terminador con un leve tono cálido (atardecer).
  float dusk = smoothstep(0.12, 0.0, abs(cosSun)) * diffuse;
  color += vec3(0.5, 0.22, 0.08) * dusk * 0.05;

  // Atmósfera en el borde (Fresnel).
  float fres = pow(1.0 - n.z, 3.0);
  color += atmoColor * fres * (0.15 + 0.85 * smoothstep(-0.3, 0.6, cosSun));

  // Borde suave antialias.
  float edge = smoothstep(1.0, 1.0 - 2.0 / uRadius, sqrt(r2));
  outColor = vec4(color, 1.0) * edge + vec4(atmoColor * 0.6, 0.6) * (1.0 - edge);
}
`;
