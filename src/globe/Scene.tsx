import { Suspense, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { Earth } from "./Earth";
import { Satellites } from "./Satellites";
import { OrbitLine } from "./OrbitLine";
import { subsolarDir } from "./sun";
import type { Satellite } from "../types";
import type { PropagationClient, PropagationSnapshot } from "../propagation/propagationClient";
import { useApp } from "../store";

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
}

export function Scene({
  satellites,
  visibleIds,
  client,
}: {
  satellites: Satellite[];
  visibleIds: Set<number>;
  client: PropagationClient;
}) {
  const selectedId = useApp((s) => s.selectedId);
  const getSatellite = useApp((s) => s.getSatellite);
  const selectedSat = selectedId != null ? getSatellite(selectedId) : undefined;

  return (
    <Canvas
      camera={{ position: [0, 1.4, 3.6], fov: 45, near: 0.01, far: 100 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={[0x0d1115]} />
      <ambientLight intensity={0.25} />
      <SunLight />
      <Suspense fallback={null}>
        <Stars radius={50} depth={25} count={2500} factor={3} fade speed={0.4} />
        <Earth />
        <Satellites satellites={satellites} client={client} visibleIds={visibleIds} />
        {selectedSat && <OrbitLine sat={selectedSat} />}
      </Suspense>
      <Controls client={client} satellites={satellites} />
    </Canvas>
  );
}

function SunLight() {
  const ref = useRef<THREE.DirectionalLight>(null);
  const tmp = useRef(new THREE.Vector3());
  useFrame(() => {
    const t = useApp.getState().simTime ?? Date.now();
    subsolarDir(new Date(t), tmp.current);
    if (ref.current) {
      // Place the sun far enough away that its rays are effectively parallel.
      ref.current.position.copy(tmp.current).multiplyScalar(50);
    }
  });
  return <directionalLight ref={ref} intensity={0.9} />;
}

function Controls({ client, satellites }: { client: PropagationClient; satellites: Satellite[] }) {
  const ref = useRef<ControlsLike | null>(null);
  const { camera } = useThree();
  const trackingId = useApp((s) => s.trackingId);
  const idToIndex = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    const m = new Map<number, number>();
    satellites.forEach((s, i) => m.set(s.noradId, i));
    idToIndex.current = m;
  }, [satellites]);

  useEffect(() => {
    const onZoom = (e: Event) => {
      const ce = e as CustomEvent<{ delta: number }>;
      const delta = ce.detail?.delta ?? 0;
      const dir = camera.position.clone().normalize();
      const next = camera.position.length() * (1 + delta);
      const clamped = Math.min(12, Math.max(1.2, next));
      camera.position.copy(dir.multiplyScalar(clamped));
      ref.current?.update();
    };
    const onReset = () => {
      camera.position.set(0, 1.4, 3.6);
      ref.current?.target.set(0, 0, 0);
      ref.current?.update();
    };
    window.addEventListener("ops-zoom", onZoom);
    window.addEventListener("ops-zoom-reset", onReset);
    return () => {
      window.removeEventListener("ops-zoom", onZoom);
      window.removeEventListener("ops-zoom-reset", onReset);
    };
  }, [camera]);

  useEffect(() => {
    if (trackingId == null) return;
    const target = new THREE.Vector3();
    const unsub = client.subscribe((snap: PropagationSnapshot) => {
      const idx = idToIndex.current.get(trackingId);
      if (idx == null) return;
      if (snap.statuses[idx] !== 1) return;
      target.set(snap.positions[idx * 3], snap.positions[idx * 3 + 1], snap.positions[idx * 3 + 2]);
      const c = ref.current;
      if (!c) return;
      c.target.lerp(target, 0.25);
      c.update();
    });
    return unsub;
  }, [trackingId, client]);

  return (
    <OrbitControls
      // drei's OrbitControls forwards a ref to the underlying three.js controls
      // instance. We only need .target and .update(), so we keep a structural ref.
      ref={(c) => {
        ref.current = (c as ControlsLike) ?? null;
      }}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={1.2}
      maxDistance={12}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
    />
  );
}
