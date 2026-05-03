import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useApp } from "../store";
import { subsolarDir } from "./sun";

function loadTextureSafe(url: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        resolve(tex);
      },
      undefined,
      () => resolve(null),
    );
  });
}

function fallbackTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#0b1e3a");
  grad.addColorStop(0.5, "#13375f");
  grad.addColorStop(1, "#0b1e3a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(64, 110, 80, 0.55)";
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * canvas.width;
    const y = (0.2 + Math.random() * 0.6) * canvas.height;
    ctx.beginPath();
    ctx.ellipse(x, y, 80 + Math.random() * 80, 40 + Math.random() * 40, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function Earth() {
  const [textures, setTextures] = useState<{
    day: THREE.Texture;
    night: THREE.Texture | null;
    spec: THREE.Texture | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadTextureSafe("/textures/earth.jpg"),
      loadTextureSafe("/textures/earth-night.png"),
      loadTextureSafe("/textures/earth-spec.jpg"),
    ]).then(([day, night, spec]) => {
      if (cancelled) return;
      setTextures({ day: day ?? fallbackTexture(), night, spec });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sunUniformRef = useRef(new THREE.Vector3(1, 0.4, 0.6).normalize());

  const material = useMemo(() => {
    if (!textures) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        uDay: { value: textures.day },
        uNight: { value: textures.night ?? textures.day },
        uSpec: { value: textures.spec ?? textures.day },
        uHasNight: { value: textures.night ? 1 : 0 },
        uHasSpec: { value: textures.spec ? 1 : 0 },
        uSunDir: { value: sunUniformRef.current },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D uDay;
        uniform sampler2D uNight;
        uniform sampler2D uSpec;
        uniform float uHasNight;
        uniform float uHasSpec;
        uniform vec3 uSunDir;
        varying vec2 vUv;
        varying vec3 vWorldNormal;

        void main() {
          vec3 n = normalize(vWorldNormal);
          float lambert = dot(n, normalize(uSunDir));
          float sunSide = smoothstep(-0.10, 0.20, lambert);

          vec3 day = texture2D(uDay, vUv).rgb;
          vec3 night = uHasNight > 0.5 ? texture2D(uNight, vUv).rgb : vec3(0.0);

          // Lift midtones so terrain colors read; dark side ≈ full brightness,
          // lit side gets +40%. Terminator gradient is wide and gentle.
          vec3 lifted = pow(day, vec3(0.78));
          float shade = mix(1.0, 1.40, sunSide);
          vec3 base = lifted * shade;

          // City lights only on the actual dark side, fading at the terminator.
          vec3 cities = night * 2.2 * (1.0 - sunSide);
          base += cities;

          if (uHasSpec > 0.5) {
            float ocean = 1.0 - texture2D(uSpec, vUv).r;
            float spec = pow(max(lambert, 0.0), 6.0) * ocean * 0.35;
            base += vec3(spec) * vec3(1.0, 0.95, 0.8);
          }

          gl_FragColor = vec4(base, 1.0);
        }
      `,
    });
  }, [textures]);

  useFrame(() => {
    if (!material) return;
    const t = useApp.getState().simTime ?? Date.now();
    subsolarDir(new Date(t), sunUniformRef.current);
    (material.uniforms.uSunDir.value as THREE.Vector3).copy(sunUniformRef.current);
  });

  if (!textures || !material) return null;

  return (
    <group>
      <mesh material={material}>
        <sphereGeometry args={[1, 96, 96]} />
      </mesh>
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
              float intensity = pow(0.75 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0) * 0.45;
              gl_FragColor = vec4(0.55, 0.70, 0.95, 1.0) * intensity;
            }
          `}
        />
      </mesh>
    </group>
  );
}
