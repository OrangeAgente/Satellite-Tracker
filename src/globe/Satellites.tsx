import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { PropagationClient, PropagationSnapshot } from "../propagation/propagationClient";
import type { Satellite } from "../types";
import { useApp } from "../store";
import { subsolarDir } from "./sun";

interface Props {
  satellites: Satellite[];
  client: PropagationClient;
  visibleIds: Set<number>;
}

// Color palette by orbit class.
const ORBIT_COLORS: Record<string, [number, number, number]> = {
  LEO: [0.36, 0.82, 1.0], // cyan
  MEO: [0.6, 0.95, 0.45], // green
  GEO: [1.0, 0.78, 0.28], // amber
  HEO: [1.0, 0.45, 0.82], // magenta
  UNK: [0.7, 0.7, 0.7],
};

// Debris and rocket bodies get a desaturated tint.
function colorFor(sat: Satellite): [number, number, number] {
  const base = ORBIT_COLORS[sat.orbitClass] || ORBIT_COLORS.UNK;
  if (sat.objectType === "DEB") return [base[0] * 0.55, base[1] * 0.55, base[2] * 0.55];
  if (sat.objectType === "R/B") return [base[0] * 0.75, base[1] * 0.75, base[2] * 0.75];
  return base;
}

export function Satellites({ satellites, client, visibleIds }: Props) {
  const pointsRef = useRef<THREE.Points>(null);
  const selectedRef = useRef<THREE.Mesh>(null);
  const { gl, camera } = useThree();

  const setSelectedId = useApp((s) => s.setSelectedId);
  const selectedId = useApp((s) => s.selectedId);
  const pinnedIds = useApp((s) => s.pinnedIds);

  // Allocate buffers keyed on satellites' length + id order (ids come from the worker).
  const { positions, colors, sizes, visibility, idArray, idToIndex } = useMemo(() => {
    const n = satellites.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const visibility = new Float32Array(n);
    const idArray = new Int32Array(n);
    const idToIndex = new Map<number, number>();
    satellites.forEach((s, i) => {
      const [r, g, b] = colorFor(s);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
      sizes[i] = s.objectType === "PAY" ? 4.0 : s.objectType === "DEB" ? 2.0 : 3.0;
      visibility[i] = 1;
      idArray[i] = s.noradId;
      idToIndex.set(s.noradId, i);
    });
    return { positions, colors, sizes, visibility, idArray, idToIndex };
  }, [satellites]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    g.setAttribute("visibility", new THREE.BufferAttribute(visibility, 1));
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, colors, sizes, visibility]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uPixelRatio: { value: Math.min(gl.getPixelRatio(), 2) },
        uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader: `
        attribute float size;
        attribute float visibility;
        varying vec3 vColor;
        varying float vVisibility;
        varying float vEclipse;
        uniform float uPixelRatio;
        uniform vec3 uSunDir;
        void main() {
          vColor = color;
          vVisibility = visibility;

          // Earth-shadow detection in scene units (Earth radius = 1).
          // A point is in umbra if it's on the anti-sun side AND its
          // perpendicular distance from the sun-Earth axis is less than 1.
          vec3 sun = normalize(uSunDir);
          float along = dot(position, sun);
          vec3 perp = position - along * sun;
          float perpDist = length(perp);
          vEclipse = (along < 0.0 && perpDist < 1.0) ? 1.0 : 0.0;

          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uPixelRatio * (1.0 + 2.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vVisibility;
        varying float vEclipse;
        void main() {
          if (vVisibility < 0.5) discard;
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.2, d);
          // In eclipse: dim brightness and slightly desaturate so the user can
          // still see where the sat is, but it reads as "in Earth's shadow".
          float dim = mix(1.0, 0.35, vEclipse);
          vec3 c = mix(vColor, vec3(dot(vColor, vec3(0.3, 0.59, 0.11))), vEclipse * 0.5);
          gl_FragColor = vec4(c * dim, alpha);
        }
      `,
      vertexColors: true,
    });
  }, [gl]);

  useFrame(() => {
    const t = useApp.getState().simTime ?? Date.now();
    subsolarDir(new Date(t), (material.uniforms.uSunDir.value as THREE.Vector3));
  });

  // Map ids from worker to our buffer order. The worker and our `satellites` list are built
  // from the same array, so indices should align — but guard with a map just in case.
  useEffect(() => {
    const unsub = client.subscribe((snap: PropagationSnapshot) => {
      const n = Math.min(snap.ids.length, idArray.length);
      const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) {
        const id = snap.ids[i];
        const myIdx = idToIndex.get(id);
        if (myIdx == null) continue;
        if (snap.statuses[i] !== 1) continue;
        positions[myIdx * 3] = snap.positions[i * 3];
        positions[myIdx * 3 + 1] = snap.positions[i * 3 + 1];
        positions[myIdx * 3 + 2] = snap.positions[i * 3 + 2];
      }
      posAttr.needsUpdate = true;
      // Also update the selected highlight mesh position.
      if (selectedRef.current && selectedId != null) {
        const idx = idToIndex.get(selectedId);
        if (idx != null) {
          selectedRef.current.position.set(
            positions[idx * 3],
            positions[idx * 3 + 1],
            positions[idx * 3 + 2],
          );
          selectedRef.current.visible = true;
        } else {
          selectedRef.current.visible = false;
        }
      } else if (selectedRef.current) {
        selectedRef.current.visible = false;
      }
    });
    return unsub;
  }, [client, geometry, idArray, idToIndex, positions, selectedId]);

  // Update visibility attribute when filters change. Pinned satellites stay visible
  // even when filtered out, per ops console design spec.
  useEffect(() => {
    const visAttr = geometry.getAttribute("visibility") as THREE.BufferAttribute;
    const pinSet = new Set(pinnedIds);
    for (let i = 0; i < satellites.length; i++) {
      const id = satellites[i].noradId;
      visibility[i] = visibleIds.has(id) || pinSet.has(id) ? 1 : 0;
    }
    visAttr.needsUpdate = true;
  }, [visibleIds, satellites, geometry, visibility, pinnedIds]);

  // Recolor + resize pinned satellites with the OK accent.
  useEffect(() => {
    const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute;
    const sizeAttr = geometry.getAttribute("size") as THREE.BufferAttribute;
    const pinSet = new Set(pinnedIds);
    for (let i = 0; i < satellites.length; i++) {
      const s = satellites[i];
      if (pinSet.has(s.noradId)) {
        colors[i * 3] = 0.42;
        colors[i * 3 + 1] = 0.94;
        colors[i * 3 + 2] = 0.62;
        sizes[i] = 6.0;
      } else {
        const [r, g, b] = colorFor(s);
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
        sizes[i] = s.objectType === "PAY" ? 4.0 : s.objectType === "DEB" ? 2.0 : 3.0;
      }
    }
    colorAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  }, [pinnedIds, satellites, geometry, colors, sizes]);

  // Click picking: project every visible sat to screen space, find the one
  // nearest the click within a pixel radius, and skip any occluded by Earth.
  useEffect(() => {
    const PICK_PIXELS = 14;
    const v = new THREE.Vector3();
    const camPos = new THREE.Vector3();
    const dir = new THREE.Vector3();

    // Earth occlusion: ray from camera toward sat, does the unit sphere at
    // the origin lie in front of the sat?
    const isOccluded = (satPos: THREE.Vector3, cam: THREE.Vector3) => {
      dir.subVectors(satPos, cam);
      const dist = dir.length();
      if (dist === 0) return false;
      dir.divideScalar(dist);
      const b = 2 * cam.dot(dir);
      const c = cam.lengthSq() - 1;
      const disc = b * b - 4 * c;
      if (disc < 0) return false;
      const t = (-b - Math.sqrt(disc)) / 2;
      return t > 0.001 && t < dist - 0.001;
    };

    const tryDeselectOnEmpty = (down: { x: number; y: number }, up: { x: number; y: number }) => {
      const moved = Math.hypot(up.x - down.x, up.y - down.y);
      return moved < 4;
    };

    let downAt: { x: number; y: number } | null = null;
    const onDown = (ev: PointerEvent) => {
      if (ev.button !== 0 || ev.target !== gl.domElement) return;
      downAt = { x: ev.clientX, y: ev.clientY };
    };

    const onUp = (ev: PointerEvent) => {
      if (!downAt || ev.button !== 0) return;
      const start = downAt;
      downAt = null;
      if (ev.target !== gl.domElement) return;
      // If the user dragged (rotating the globe), don't treat as a click.
      if (!tryDeselectOnEmpty(start, { x: ev.clientX, y: ev.clientY })) return;

      const rect = gl.domElement.getBoundingClientRect();
      const ndcX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      const pixelToNdcX = 2 / rect.width;
      const pixelToNdcY = 2 / rect.height;
      const radNdcX = PICK_PIXELS * pixelToNdcX;
      const radNdcY = PICK_PIXELS * pixelToNdcY;

      camPos.copy(camera.position);
      let bestI = -1;
      let bestScore = Infinity;
      for (let i = 0; i < satellites.length; i++) {
        if (visibility[i] < 0.5) continue;
        v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        // Filter out the (0,0,0) entries before propagator has filled in.
        if (v.lengthSq() < 0.01) continue;
        const sat = v.clone();
        v.project(camera);
        if (v.z < -1 || v.z > 1) continue;
        const dx = (v.x - ndcX) / radNdcX;
        const dy = (v.y - ndcY) / radNdcY;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        if (isOccluded(sat, camPos)) continue;
        // Tie-break by depth: prefer nearer sats when overlapping.
        const score = d2 + v.z * 0.01;
        if (score < bestScore) {
          bestScore = score;
          bestI = i;
        }
      }

      if (bestI >= 0) {
        setSelectedId(idArray[bestI]);
      } else {
        setSelectedId(null);
      }
    };

    gl.domElement.addEventListener("pointerdown", onDown);
    gl.domElement.addEventListener("pointerup", onUp);
    return () => {
      gl.domElement.removeEventListener("pointerdown", onDown);
      gl.domElement.removeEventListener("pointerup", onUp);
    };
  }, [camera, gl, satellites, idArray, visibility, positions, setSelectedId]);

  return (
    <group>
      <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
      <mesh ref={selectedRef} visible={false}>
        <sphereGeometry args={[0.018, 16, 16]} />
        <meshBasicMaterial color={0xffb547} transparent opacity={0.95} />
      </mesh>
    </group>
  );
}
