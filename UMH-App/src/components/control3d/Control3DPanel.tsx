import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  TransformControls,
} from '@react-three/drei';
import { Cuboid, Crosshair, Move3d, Send } from 'lucide-react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { deviceService } from '../../services/device';
import { StimulationType } from '../../shared/types';
import { useDeviceStore } from '../../store/useDeviceStore';

interface FocusPoint {
  x: number;
  y: number;
  z: number;
}

interface AxisBounds {
  min: number;
  max: number;
}

const BOUNDS = {
  x: { min: -0.05, max: 0.05 },
  y: { min: -0.05, max: 0.05 },
  z: { min: 0.01, max: 0.2 },
} satisfies Record<'x' | 'y' | 'z', AxisBounds>;

const DEFAULT_FOCUS: FocusPoint = { x: 0, y: 0, z: 0.1 };

const clamp = (value: number, bounds: AxisBounds) =>
  Math.min(bounds.max, Math.max(bounds.min, value));

const clampFocus = (focus: FocusPoint): FocusPoint => ({
  x: clamp(focus.x, BOUNDS.x),
  y: clamp(focus.y, BOUNDS.y),
  z: clamp(focus.z, BOUNDS.z),
});

const formatMeters = (value: number) => `${value.toFixed(4)} m`;

const generateHexArrayPositions = (count: number, spacing: number): THREE.Vector3[] => {
  const result: THREE.Vector3[] = [];
  let radius = 0;

  while (result.length < count) {
    for (let q = -radius; q <= radius; q += 1) {
      const rMin = Math.max(-radius, -q - radius);
      const rMax = Math.min(radius, -q + radius);

      for (let r = rMin; r <= rMax; r += 1) {
        const s = -q - r;
        const ringDistance = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
        if (ringDistance !== radius) {
          continue;
        }

        const x = spacing * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
        const y = spacing * ((3 / 2) * r);
        result.push(new THREE.Vector3(x, y, 0));

        if (result.length >= count) {
          return result;
        }
      }
    }

    radius += 1;
  }

  return result;
};

interface SceneProps {
  focus: FocusPoint;
  onFocusChange: (next: FocusPoint) => void;
  transducerPositions: THREE.Vector3[];
  transducerDiameter: number;
}

interface CameraControllerProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  fitRadius: number;
  fitCenter: THREE.Vector3;
  resetToken: number;
}

interface SceneErrorBoundaryProps {
  children: React.ReactNode;
}

interface SceneErrorBoundaryState {
  hasError: boolean;
}

class SceneErrorBoundary extends React.Component<SceneErrorBoundaryProps, SceneErrorBoundaryState> {
  state: SceneErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('3D scene render failed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm text-amber-900">
          3D scene failed to load. Please check network/device config, then reopen this page.
        </div>
      );
    }

    return this.props.children;
  }
}

const CameraController: React.FC<CameraControllerProps> = ({ controlsRef, fitRadius, fitCenter, resetToken }) => {
  const { camera, invalidate } = useThree();

  const fitCamera = useCallback(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    const radius = Math.max(0.02, fitRadius);
    const fovRadians = THREE.MathUtils.degToRad(camera.fov);
    const distance = (radius / Math.tan(fovRadians / 2)) * 1.45;
    const direction = new THREE.Vector3(1, -1.22, 0.92).normalize();
    const position = fitCenter.clone().add(direction.multiplyScalar(distance));

    camera.position.copy(position);
    camera.near = Math.max(0.001, distance * 0.01);
    camera.far = Math.max(8, distance * 20);
    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.copy(fitCenter);
      controlsRef.current.minDistance = distance * 0.35;
      controlsRef.current.maxDistance = distance * 8;
      controlsRef.current.update();
    }

    invalidate();
  }, [camera, controlsRef, fitCenter, fitRadius, invalidate]);

  useEffect(() => {
    fitCamera();
  }, [fitCamera, resetToken]);

  return null;
};

const CanvasScrollGuard: React.FC = () => {
  const { gl } = useThree();

  useEffect(() => {
    const element = gl.domElement;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  }, [gl]);

  return null;
};

const Control3DScene: React.FC<SceneProps> = ({
  focus,
  onFocusChange,
  transducerPositions,
  transducerDiameter,
}) => {
  const [dragging, setDragging] = useState(false);
  const targetRef = useRef<THREE.Group>(null);
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const [cameraResetToken, setCameraResetToken] = useState(0);

  const layoutBounds = useMemo(() => {
    if (transducerPositions.length === 0) {
      return {
        minX: -0.02,
        maxX: 0.02,
        minY: -0.02,
        maxY: 0.02,
        minZ: 0,
        maxZ: 0,
      };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const pos of transducerPositions) {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
      minZ = Math.min(minZ, pos.z);
      maxZ = Math.max(maxZ, pos.z);
    }

    return { minX, maxX, minY, maxY, minZ, maxZ };
  }, [transducerPositions]);

  const arrayRadius = useMemo(() => {
    if (transducerPositions.length === 0) {
      return 0.02;
    }

    const cx = (layoutBounds.minX + layoutBounds.maxX) * 0.5;
    const cy = (layoutBounds.minY + layoutBounds.maxY) * 0.5;
    return transducerPositions.reduce((max, pos) => {
      return Math.max(max, Math.hypot(pos.x - cx, pos.y - cy));
    }, 0);
  }, [layoutBounds.maxX, layoutBounds.maxY, layoutBounds.minX, layoutBounds.minY, transducerPositions]);

  const transducerRadius = useMemo(() => Math.max(0.0015, transducerDiameter * 0.45), [transducerDiameter]);
  const fitCenter = useMemo(() => {
    const centerX = (layoutBounds.minX + layoutBounds.maxX) * 0.5;
    const centerY = (layoutBounds.minY + layoutBounds.maxY) * 0.5;
    const centerZFromArray = (layoutBounds.minZ + layoutBounds.maxZ) * 0.5;
    const centerZFromFocusRange = Math.max(0.02, BOUNDS.z.max * 0.35);
    return new THREE.Vector3(centerX, centerY, Math.max(centerZFromArray, centerZFromFocusRange));
  }, [layoutBounds.maxX, layoutBounds.maxY, layoutBounds.maxZ, layoutBounds.minX, layoutBounds.minY, layoutBounds.minZ]);
  const fitRadius = useMemo(() => {
    const radial = arrayRadius + transducerRadius * 2.8;
    const vertical = Math.max(BOUNDS.z.max - layoutBounds.minZ, layoutBounds.maxZ - layoutBounds.minZ) * 0.7;
    return Math.sqrt(radial * radial + vertical * vertical);
  }, [arrayRadius, layoutBounds.maxZ, layoutBounds.minZ, transducerRadius]);

  useEffect(() => {
    if (!targetRef.current || dragging) {
      return;
    }

    targetRef.current.position.set(focus.x, focus.y, focus.z);
  }, [dragging, focus.x, focus.y, focus.z]);

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <SceneErrorBoundary>
        <Canvas
          camera={{ position: [0.2, -0.22, 0.18], fov: 44, near: 0.001, far: 20 }}
          onCreated={({ camera }) => {
            camera.up.set(0, 0, 1);
          }}
        >
          <CanvasScrollGuard />
          <color attach="background" args={['#f8fafc']} />
          <fog attach="fog" args={['#f8fafc', 0.3, 1.3]} />

        <CameraController
          controlsRef={orbitRef}
          fitRadius={fitRadius}
          fitCenter={fitCenter}
          resetToken={cameraResetToken}
        />

        <ambientLight intensity={0.62} />
        <directionalLight position={[0.2, -0.15, 0.25]} intensity={0.95} color="#e2e8f0" />
        <pointLight position={[-0.25, 0.2, 0.18]} intensity={0.5} color="#cbd5e1" />

          <Grid
            position={[0, 0, layoutBounds.minZ - 0.001]}
            rotation={[Math.PI / 2, 0, 0]}
            args={[Math.max(0.24, arrayRadius * 3.4), Math.max(0.24, arrayRadius * 3.4)]}
            cellSize={0.01}
            cellThickness={0.7}
            cellColor="#cbd5e1"
            sectionSize={0.05}
            sectionThickness={1}
            sectionColor="#94a3b8"
            fadeDistance={0.8}
            fadeStrength={1}
            followCamera={false}
            infiniteGrid={false}
          />

          <group>
            <mesh
              position={[
                (layoutBounds.minX + layoutBounds.maxX) * 0.5,
                (layoutBounds.minY + layoutBounds.maxY) * 0.5,
                layoutBounds.minZ,
              ]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[arrayRadius + transducerRadius * 2.2, arrayRadius + transducerRadius * 2.2, 0.002, 64]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.5} metalness={0.08} />
            </mesh>

            {transducerPositions.map((position, index) => (
              <mesh key={`t-${index}`} position={[position.x, position.y, position.z + 0.0028]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[transducerRadius, transducerRadius, 0.0045, 20]} />
                <meshStandardMaterial color="#94a3b8" roughness={0.35} metalness={0.3} />
              </mesh>
            ))}

            <TransformControls
              mode="translate"
              space="world"
              showX
              showY
              showZ
              onMouseDown={() => setDragging(true)}
              onMouseUp={() => setDragging(false)}
              onObjectChange={() => {
                if (!targetRef.current) {
                  return;
                }

                const next = clampFocus({
                  x: targetRef.current.position.x,
                  y: targetRef.current.position.y,
                  z: targetRef.current.position.z,
                });

                targetRef.current.position.set(next.x, next.y, next.z);
                onFocusChange(next);
              }}
            >
              <group ref={targetRef} position={[focus.x, focus.y, focus.z]}>
                <mesh>
                  <sphereGeometry args={[0.0065, 26, 26]} />
                  <meshStandardMaterial color="#475569" emissive="#64748b" emissiveIntensity={0.25} />
                </mesh>
                <mesh>
                  <sphereGeometry args={[0.011, 30, 30]} />
                  <meshBasicMaterial color="#64748b" transparent opacity={0.12} />
                </mesh>
              </group>
            </TransformControls>
          </group>

          <OrbitControls
            makeDefault
            ref={orbitRef}
            enablePan
            enableZoom
            enableRotate
            enableDamping
            dampingFactor={0.08}
            minDistance={0.08}
            maxDistance={1.4}
            enabled={!dragging}
          />
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport labelColor="#0f172a" axisHeadScale={1.05} />
          </GizmoHelper>
        </Canvas>
      </SceneErrorBoundary>

      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-border bg-card/90 px-3 py-2 text-xs text-muted-foreground backdrop-blur-sm">
        Drag arrows to move focus on X/Y/Z
      </div>
      <div className="absolute right-3 top-3 flex gap-2">
        <button
          type="button"
          onClick={() => setCameraResetToken((prev) => prev + 1)}
          className="rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-xs font-medium text-foreground backdrop-blur transition hover:bg-muted"
        >
          Auto Fit
        </button>
      </div>
    </div>
  );
};

interface NumberFieldProps {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}

const NumberField: React.FC<NumberFieldProps> = ({ label, value, step, min, max, onChange }) => (
  <label className="text-xs text-muted-foreground">
    <span className="mb-1 block">{label}</span>
    <input
      value={value}
      type="number"
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
    />
  </label>
);

export const Control3DPanel: React.FC = () => {
  const { connectionStatus, config, transducerLayout } = useDeviceStore();
  const [focus, setFocus] = useState<FocusPoint>(DEFAULT_FOCUS);
  const [intensity, setIntensity] = useState(100);
  const [frequency, setFrequency] = useState(200);
  const [liveSync, setLiveSync] = useState(true);

  const sendTimerRef = useRef<number | null>(null);

  const normalizedLengthFromConfig = useCallback((raw: number | undefined, fallbackMeters: number) => {
    if (raw === undefined || !Number.isFinite(raw) || raw <= 0) {
      return fallbackMeters;
    }

    const rawValue = raw;
    if (rawValue > 1) {
      return rawValue / 1000;
    }

    return rawValue;
  }, []);

  const transducerCount = useMemo(() => {
    const reported = config?.transducerCount;
    if (reported === undefined || !Number.isFinite(reported)) {
      return 60;
    }

    const rounded = Math.max(1, Math.min(256, Math.round(reported)));
    return rounded === 61 ? 60 : rounded;
  }, [config?.transducerCount]);

  const transducerSpacing = useMemo(() => {
    const spacing = normalizedLengthFromConfig(config?.transducerSpace, 0.01);
    return clamp(spacing, { min: 0.003, max: 0.03 });
  }, [config?.transducerSpace, normalizedLengthFromConfig]);

  const transducerDiameter = useMemo(() => {
    const diameter = normalizedLengthFromConfig(config?.transducerSize, 0.01);
    return clamp(diameter, { min: 0.003, max: 0.02 });
  }, [config?.transducerSize, normalizedLengthFromConfig]);

  const transducerPositions = useMemo(() => {
    if (transducerLayout.length > 0) {
      return transducerLayout.map((position) => new THREE.Vector3(position.x, position.y, position.z));
    }

    return generateHexArrayPositions(transducerCount, transducerSpacing);
  }, [transducerCount, transducerLayout, transducerSpacing]);

  const canSend = connectionStatus === 'connected';

  useEffect(() => {
    if (canSend && !config) {
      deviceService.getConfig();
    }
  }, [canSend, config]);

  const sendPointCommand = useCallback(
    (target: FocusPoint) => {
      if (!canSend) {
        return;
      }

      deviceService.setStimulation(
        StimulationType.POINT,
        target.x,
        target.y,
        target.z,
        intensity,
        frequency,
      );
    },
    [canSend, frequency, intensity],
  );

  useEffect(() => {
    if (!liveSync || !canSend) {
      return;
    }

    if (sendTimerRef.current !== null) {
      window.clearTimeout(sendTimerRef.current);
    }

    sendTimerRef.current = window.setTimeout(() => {
      sendPointCommand(focus);
      sendTimerRef.current = null;
    }, 90);

    return () => {
      if (sendTimerRef.current !== null) {
        window.clearTimeout(sendTimerRef.current);
      }
    };
  }, [canSend, focus, liveSync, sendPointCommand]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">UMH Spatial Engine</p>
            <h3 className="flex items-center gap-2 text-xl font-semibold text-foreground">
              <Cuboid className="h-5 w-5 text-muted-foreground" />
              3D Focus Control
            </h3>
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm text-muted-foreground backdrop-blur">
            {canSend ? 'Device connected: commands live' : 'Device disconnected: preview only'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Control3DScene
            focus={focus}
            onFocusChange={(next) => setFocus(clampFocus(next))}
            transducerPositions={transducerPositions}
            transducerDiameter={transducerDiameter}
          />
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm backdrop-blur-sm">
          <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
            <Move3d className="h-4 w-4 text-muted-foreground" />
            Fine Position Tuning
          </h4>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-1">
            <NumberField
              label="X (m)"
              value={focus.x}
              step={0.0005}
              min={BOUNDS.x.min}
              max={BOUNDS.x.max}
              onChange={(next) => setFocus((prev) => clampFocus({ ...prev, x: next }))}
            />
            <NumberField
              label="Y (m)"
              value={focus.y}
              step={0.0005}
              min={BOUNDS.y.min}
              max={BOUNDS.y.max}
              onChange={(next) => setFocus((prev) => clampFocus({ ...prev, y: next }))}
            />
            <NumberField
              label="Z (m)"
              value={focus.z}
              step={0.0005}
              min={BOUNDS.z.min}
              max={BOUNDS.z.max}
              onChange={(next) => setFocus((prev) => clampFocus({ ...prev, z: next }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Intensity"
              value={intensity}
              step={1}
              min={0}
              max={255}
              onChange={(next) => setIntensity(Math.round(clamp(next, { min: 0, max: 255 })))}
            />
            <NumberField
              label="Frequency (Hz)"
              value={frequency}
              step={1}
              min={1}
              max={5000}
              onChange={(next) => setFrequency(Math.round(clamp(next, { min: 1, max: 5000 })))}
            />
          </div>

          <label className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground">
            Live Sync
            <input
              type="checkbox"
              checked={liveSync}
              onChange={(event) => setLiveSync(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>

          <button
            onClick={() => sendPointCommand(focus)}
            disabled={!canSend}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted"
          >
            <Send className="h-4 w-4" />
            Send Point Command
          </button>

          <div className="rounded-xl border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
            <p className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
              <Crosshair className="h-3.5 w-3.5 text-muted-foreground" /> Current Focus
            </p>
            <p>X: {formatMeters(focus.x)}</p>
            <p>Y: {formatMeters(focus.y)}</p>
            <p>Z: {formatMeters(focus.z)}</p>
            <p className="mt-2 border-t border-border pt-2">Array: {transducerCount} transducers</p>
            <p>Spacing: {formatMeters(transducerSpacing)}</p>
            <p>Diameter: {formatMeters(transducerDiameter)}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 p-3 text-sm text-muted-foreground">
        Drag the transform gizmo for coarse XYZ movement, then use numeric inputs for sub-millimeter tuning.
      </div>
    </div>
  );
};
