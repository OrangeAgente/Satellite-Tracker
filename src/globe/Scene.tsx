import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { Earth } from "./Earth";
import { Satellites } from "./Satellites";
import { OrbitLine } from "./OrbitLine";
import type { Satellite } from "../types";
import type { PropagationClient } from "../propagation/propagationClient";
import { useApp } from "../store";

interface Props {
  satellites: Satellite[];
  visibleIds: Set<number>;
  client: PropagationClient;
}

export function Scene({ satellites, visibleIds, client }: Props) {
  const selectedId = useApp((s) => s.selectedId);
  const getSatellite = useApp((s) => s.getSatellite);
  const selectedSat = selectedId != null ? getSatellite(selectedId) : undefined;

  return (
    <Canvas
      camera={{ position: [0, 1.4, 3.6], fov: 45, near: 0.01, far: 100 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={[0x05070c]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 3, 5]} intensity={1.1} />
      <Suspense fallback={null}>
        <Stars radius={50} depth={25} count={4000} factor={4} fade speed={0.5} />
        <Earth />
        <Satellites satellites={satellites} client={client} visibleIds={visibleIds} />
        {selectedSat && <OrbitLine sat={selectedSat} />}
      </Suspense>
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={1.2}
        maxDistance={12}
        rotateSpeed={0.5}
        zoomSpeed={0.8}
      />
    </Canvas>
  );
}
