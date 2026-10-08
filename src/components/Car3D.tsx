import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCarMesh, toTriangles } from '../domain/mesh';
import type { ReactNode } from 'react';
import type { CarMesh } from '../domain/mesh';
import type { ResolvedSpec } from '../domain/types';

/**
 * 3D表示の試作。
 *
 * 合意した描画スタイル（docs/3D-STYLE.md）:
 * - ボディは面を粗く保ち、濃淡は光の向きで決める（トゥーン + 3段の帯）
 * - タイヤとリムだけなめらかに
 * - 輪郭線はシルエットと稜線だけ。面の境界すべてには引かない
 * - リムライト、接地影
 * - 広角・低位置カメラで可愛さを出す（プロポーションは誇張しない）
 *
 * モデルは mm で作られているので、シーンに置くときに 1/1000 して m に直す。
 * ライトと影の扱いが素直になる。
 */

/** mm → m */
const MM = 0.001;

export interface Car3DProps {
  readonly a: ResolvedSpec;
  readonly b?: ResolvedSpec | undefined;
  readonly title?: string;
}

export function Car3D({ a, b, title }: Car3DProps) {
  const spin = useRef({ angle: 0.7, velocity: 0, elevation: 0.1 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  // 2台あるときは横に並べる。重ねると面が貫通して見分けられない
  const gap = 0.6;
  const widthA = a.width * MM;
  const widthB = (b?.width ?? 0) * MM;
  const offsetA = b === undefined ? 0 : -(widthA / 2 + gap / 2);
  const offsetB = widthB / 2 + gap / 2;

  const longest = Math.max(a.length, b?.length ?? 0) * MM;

  return (
    <div
      className="car3d"
      role="img"
      {...(title !== undefined ? { 'aria-label': title } : { 'aria-hidden': true })}
      onPointerDown={(event) => {
        dragging.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const from = dragging.current;
        if (from === null) {
          return;
        }
        const dx = event.clientX - from.x;
        const dy = event.clientY - from.y;
        dragging.current = { x: event.clientX, y: event.clientY };
        spin.current.velocity = dx * 0.0001;
        spin.current.angle += dx * 0.008;
        spin.current.elevation = clamp(spin.current.elevation + dy * 0.004, -0.15, 0.75);
      }}
      onPointerUp={() => {
        dragging.current = null;
      }}
      onPointerCancel={() => {
        dragging.current = null;
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 46, position: [longest * 0.62, longest * 0.26, longest * 1.02], near: 0.05, far: 60 }}
      >
        <SceneLights />

        <Turntable spin={spin} target={longest}>
          <CarModel spec={a} variant="a" offsetZ={offsetA} />
          {b !== undefined ? <CarModel spec={b} variant="b" offsetZ={offsetB} /> : null}
        </Turntable>

        <Ground size={longest * 3} />
      </Canvas>
    </div>
  );
}

/**
 * 光源は左上手前に固定。上面が明るく、前面が中間、側面下部が暗くなる。
 * 背後から弱い光を当てて上端にリムライトを作る。
 */
function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[-3.2, 4.6, 3.4]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      <directionalLight position={[2.6, 2.4, -3.2]} intensity={0.55} color="#cfe6ff" />
    </>
  );
}

/** ドラッグで回り、離すと慣性で少し回り続ける */
function Turntable({
  spin,
  target,
  children,
}: {
  readonly spin: React.RefObject<{ angle: number; velocity: number; elevation: number }>;
  readonly target: number;
  readonly children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const current = spin.current;
    if (current === null) {
      return;
    }
    current.angle += current.velocity * delta * 60;
    // 慣性を減衰させる
    current.velocity *= 0.94;

    if (group.current !== null) {
      group.current.rotation.y = current.angle;
    }
    // 上下のドラッグはカメラの高さで受ける
    state.camera.position.y = target * (0.18 + current.elevation);
    state.camera.lookAt(0, target * 0.16, 0);
  });

  return <group ref={group}>{children}</group>;
}

function CarModel({
  spec,
  variant,
  offsetZ,
}: {
  readonly spec: ResolvedSpec;
  readonly variant: 'a' | 'b';
  readonly offsetZ: number;
}) {
  const mesh = useMemo(() => buildCarMesh(spec), [spec]);
  const gradient = useToonGradient(3);

  const bodyColor = variant === 'a' ? '#7ccbbd' : '#f0a184';
  // 車体の中心を原点に置いて回転させる
  const centerX = -(spec.length / 2) * MM;

  return (
    <group position={[0, 0, offsetZ]} scale={[MM, MM, MM]}>
      <group position={[centerX / MM, 0, 0]}>
        <Body mesh={mesh} color={bodyColor} gradient={gradient} />
        {mesh.wheels.map((wheel, index) => (
          <Wheel key={index} wheel={wheel} />
        ))}
      </group>
    </group>
  );
}

function Body({
  mesh,
  color,
  gradient,
}: {
  readonly mesh: CarMesh;
  readonly color: string;
  readonly gradient: THREE.DataTexture;
}) {
  const geometry = useMemo(() => {
    const { positions, normals } = toTriangles(mesh);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...positions], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([...normals], 3));
    return geo;
  }, [mesh]);

  // 折れ角のしきい値を設けて、シルエットと稜線だけ線を出す
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 16), [geometry]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      edges.dispose();
    };
  }, [geometry, edges]);

  return (
    <>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshToonMaterial color={color} gradientMap={gradient} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#20262f" transparent opacity={0.85} />
      </lineSegments>
    </>
  );
}

/** タイヤとリムはここだけなめらかに。丸く見えないと違和感が出る */
function Wheel({ wheel }: { readonly wheel: ReturnType<typeof buildCarMesh>['wheels'][number] }) {
  const outward = Math.sign(wheel.center.z) || 1;

  return (
    <group position={[wheel.center.x, wheel.center.y, wheel.center.z]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[wheel.radius, wheel.radius, wheel.width, 28]} />
        <meshStandardMaterial color="#2e333c" roughness={0.85} />
      </mesh>
      <mesh position={[0, outward * wheel.width * 0.12, 0]}>
        <cylinderGeometry args={[wheel.rimRadius, wheel.rimRadius, wheel.width * 0.9, 24]} />
        <meshStandardMaterial color="#d7dee8" metalness={0.65} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** 接地影を受ける床。影だけを落として床自体は描かない */
function Ground({ size }: { readonly size: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <shadowMaterial transparent opacity={0.22} color="#0b1020" />
    </mesh>
  );
}

/** トゥーンの帯。明るさを指定した段数に量子化する */
function useToonGradient(steps: number): THREE.DataTexture {
  return useMemo(() => {
    const data = new Uint8Array(steps);
    for (let i = 0; i < steps; i += 1) {
      data[i] = Math.round(((i + 1) / steps) * 255);
    }
    const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
  }, [steps]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
