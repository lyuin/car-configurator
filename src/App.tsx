import { useCallback, useMemo, useState } from 'react';
import { CarSvg } from './components/CarSvg';
import { InputPanel } from './components/InputPanel';
import { buildSideView } from './domain/geometry';
import { resolve } from './domain/resolve';
import { SILHOUETTE_LABELS } from './domain/types';
import {
  setDimension,
  setDoors,
  setSilhouette,
  setTire,
  unlockAll,
  unlockField,
} from './state/carInput';
import type { CarInput, DimensionKey, Silhouette, SpecFieldKey } from './domain/types';

export default function App() {
  const [input, setInput] = useState<CarInput>({ silhouette: 'suv' });

  const spec = useMemo(() => resolve(input), [input]);
  const geometry = useMemo(() => buildSideView(spec), [spec]);

  const handleDimensionChange = useCallback((key: DimensionKey, value: number) => {
    setInput((current) => setDimension(current, key, value));
  }, []);

  const handleSilhouetteChange = useCallback((silhouette: Silhouette) => {
    setInput((current) => setSilhouette(current, silhouette));
  }, []);

  const handleTireChange = useCallback((notation: string) => {
    setInput((current) => setTire(current, notation));
  }, []);

  const handleDoorsChange = useCallback((doors: number) => {
    setInput((current) => setDoors(current, doors));
  }, []);

  const handleUnlock = useCallback((key: SpecFieldKey) => {
    setInput((current) => unlockField(current, key));
  }, []);

  const handleResetAll = useCallback(() => {
    setInput((current) => unlockAll(current));
  }, []);

  return (
    <div className="app">
      <header className="app__header">
        <h1>Car Silhouette Configurator</h1>
      </header>

      <div className="layout">
        <section className="layout__panel" aria-label="入力">
          <InputPanel
            input={input}
            spec={spec}
            onSilhouetteChange={handleSilhouetteChange}
            onDimensionChange={handleDimensionChange}
            onTireChange={handleTireChange}
            onDoorsChange={handleDoorsChange}
            onUnlock={handleUnlock}
            onResetAll={handleResetAll}
          />
        </section>

        <section className="layout__view" aria-label="図">
          <CarSvg
            shapes={geometry.shapes}
            bounds={geometry.bounds}
            title={`${SILHOUETTE_LABELS[spec.silhouette]}の側面図`}
          />

          {spec.warnings.length > 0 ? (
            <ul className="warnings" aria-label="警告">
              {spec.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <dl className="spec">
            <SpecItem label="全長" value={spec.length} />
            <SpecItem label="全幅" value={spec.width} />
            <SpecItem label="全高" value={spec.height} />
            <SpecItem label="ホイールベース" value={spec.wheelbase} />
            <SpecItem label="フロントOH" value={spec.frontOverhang} />
            <SpecItem label="リアOH" value={spec.rearOverhang} />
            <SpecItem label="最低地上高" value={spec.groundClearance} />
            <SpecItem label="タイヤ外径" value={Math.round(spec.tire.outerDiameter)} />
          </dl>
        </section>
      </div>
    </div>
  );
}

function SpecItem({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="spec__item">
      <dt>{label}</dt>
      <dd>{value.toLocaleString('ja-JP')} mm</dd>
    </div>
  );
}
