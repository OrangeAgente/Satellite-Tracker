import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { PropagationClient, PropagationSnapshot } from "../propagation/propagationClient";
import type { Satellite } from "../types";
import { useApp } from "../store";

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
      },
      vertexShader: `
        attribute float size;
        attribute float visibility;
        varying vec3 vColor;
        varying float vVisibility;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          vVisibility = visibility;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uPixelRatio * (1.0 + 2.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vVisibility;
        void main() {
          if (vVisibility < 0.5) discard;
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.2, d);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      vertexColors: true,
    });
  }, [gl]);

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

  // Update visibility attribute when filters change.
  useEffect(() => {
    const visAttr = geometry.getAttribute("visibility") as THREE.BufferAttribute;
    for (let i = 0; i < satellites.length; i++) {
      visibility[i] = visibleIds.has(satellites[i].noradId) ? 1 : 0;
    }
    visAttr.needsUpdate = true;
  }, [visibleIds, satellites, geometry, visibility]);

  // Click picking: raycast against points on canvas click.
  useEffect(() => {
    const handler = (ev: MouseEvent) => {
      if (ev.button !== 0) return;
      const target = ev.target as HTMLElement;
      if (!target || target.tagName !== "CANVAS") return;
      if (target !== gl.domElement) return;
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -(((ev.clientY - rect.top) / rect.height) * 2 - 1),
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      raycaster.params.Points = { threshold: 0.02 };
      if (!pointsRef.current) return;
      const hits = raycaster.intersectObject(pointsRef.current, false);
      // Filter to visible points only.
      const hit = hits.find((h) => {
        const idx = h.index ?? -1;
        return idx >= 0 && visibility[idx] > 0.5;
      });
      if (hit && hit.index != null) {
        setSelectedId(idArray[hit.index]);
      } else {
        // Clicking empty space deselects.
        setSelectedId(null);
      }
    };
    gl.domElement.addEventListener("click", handler);
    return () => gl.domElement.removeEventListener("click", handler);
  }, [camera, gl, idArray, visibility, setSelectedId]);

  return (
    <group>
      <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
      <mesh ref={selectedRef} visible={false}>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshBasicMaterial color={0xffffff} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}
