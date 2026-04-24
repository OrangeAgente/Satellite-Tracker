import { useMemo } from "react";
import * as THREE from "three";

// Procedural Earth — no external textures required, works fully offline.
// We generate day/night color bands and a subtle atmosphere glow.
export function Earth() {
  const material = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d")!;
    // Ocean base
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#0b1e3a");
    grad.addColorStop(0.5, "#13375f");
    grad.addColorStop(1, "#0b1e3a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Procedurally-sketched continents: we can't ship TIFFs, so use a layered noise pattern
    // that still reads as "planet with land."
    const layers = [
      { c: "rgba(64, 110, 80, 0.55)", r: 180, count: 40 },
      { c: "rgba(90, 135, 95, 0.55)", r: 120, count: 60 },
      { c: "rgba(120, 150, 100, 0.4)", r: 80, count: 80 },
      { c: "rgba(180, 170, 120, 0.3)", r: 60, count: 70 }, // deserts
      { c: "rgba(230, 235, 240, 0.5)", r: 40, count: 30 }, // ice / clouds
    ];
    // Seeded rng so the planet is stable across reloads
    let seed = 1337;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (const { c, r, count } of layers) {
      ctx.fillStyle = c;
      for (let i = 0; i < count; i++) {
        const cx = rng() * canvas.width;
        // Bias land toward mid-latitudes
        const cy = (0.2 + rng() * 0.6) * canvas.height;
        const rr = r * (0.4 + rng() * 1.0);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rr, rr * (0.6 + rng() * 0.8), rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Polar caps
    ctx.fillStyle = "rgba(240, 248, 255, 0.85)";
    ctx.fillRect(0, 0, canvas.width, canvas.height * 0.06);
    ctx.fillRect(0, canvas.height * 0.94, canvas.width, canvas.height * 0.06);
    // Latitude haze
    const haze = ctx.createLinearGradient(0, 0, 0, canvas.height);
    haze.addColorStop(0, "rgba(255,255,255,0.08)");
    haze.addColorStop(0.5, "rgba(255,255,255,0)");
    haze.addColorStop(1, "rgba(255,255,255,0.08)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return new THREE.MeshPhongMaterial({
      map: tex,
      shininess: 12,
      specular: new THREE.Color(0x334466),
    });
  }, []);

  return (
    <group>
      <mesh material={material}>
        <sphereGeometry args={[1, 96, 96]} />
      </mesh>
      {/* Atmosphere halo */}
      <mesh>
        <sphereGeometry args={[1.04, 64, 64]} />
        <shaderMaterial
          transparent
          side={THREE.BackSide}
          depthWrite={false}
          uniforms={{}}
          vertexShader={`
            varying vec3 vNormal;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            varying vec3 vNormal;
            void main() {
              float intensity = pow(0.75 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
              gl_FragColor = vec4(0.35, 0.65, 1.0, 1.0) * intensity;
            }
          `}
        />
      </mesh>
    </group>
  );
}
