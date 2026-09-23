import { useMemo, useState } from 'react';
import { CarSvg } from './components/CarSvg';
import { buildSideView } from './domain/geometry';
import { resolve } from './domain/resolve';
import { SILHOUETTE_LABELS, SILHOUETTES } from './domain/types';
import type { Silhouette } from './domain/types';

/**
 * Task 4 時点の確認画面。
 * 入力パネル（Task 5）が入るまでは、シルエット切替だけで形の違いを見る。
 */
export default function App() {
  const [silhouette, setSilhouette] = useState<Silhouette>('suv');

  const { spec, geometry } = useMemo(() => {
    const resolved = resolve({ silhouette });
    return { spec: resolved, geometry: buildSideView(resolved) };
  }, [silhouette]);

  return (
    <main className="app">
      <h1>Car Silhouette Configurator</h1>

      <div className="segmented" role="group" aria-label="シルエット">
        {SILHOUETTES.map((value) => (
          <button
            key={value}
            type="button"
            className="segmented__item"
            aria-pressed={value === silhouette}
            onClick={() => setSilhouette(value)}
          >
            {SILHOUETTE_LABELS[value]}
          </button>
        ))}
      </div>

      <CarSvg
        shapes={geometry.shapes}
        bounds={geometry.bounds}
        title={`${SILHOUETTE_LABELS[silhouette]}の側面図`}
      />

      <dl className="spec">
        <SpecItem label="全長" value={`${spec.length} mm`} />
        <SpecItem label="全幅" value={`${spec.width} mm`} />
        <SpecItem label="全高" value={`${spec.height} mm`} />
        <SpecItem label="ホイールベース" value={`${spec.wheelbase} mm`} />
        <SpecItem label="フロントOH" value={`${spec.frontOverhang} mm`} />
        <SpecItem label="リアOH" value={`${spec.rearOverhang} mm`} />
        <SpecItem label="最低地上高" value={`${spec.groundClearance} mm`} />
        <SpecItem
          label="タイヤ"
          value={`${spec.tire.notation}（外径 ${Math.round(spec.tire.outerDiameter)} mm）`}
        />
      </dl>
    </main>
  );
}

function SpecItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="spec__item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
