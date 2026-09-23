import { useCallback, useMemo } from 'react';
import { CarSvg } from './components/CarSvg';
import { InputPanel } from './components/InputPanel';
import { ShareButton } from './components/ShareButton';
import {
  buildDimensions,
  buildGrid,
  buildView,
  DIMENSION_PADDING,
  expandBounds,
  unifiedViewExtent,
  VIEW_KINDS,
  VIEW_LABELS,
} from './domain/geometry';
import { findPreset, presetFieldsOf, presetToCarInput } from './domain/presets';
import { resolve } from './domain/resolve';
import { SILHOUETTE_LABELS } from './domain/types';
import {
  setDimension,
  setDoors,
  setName,
  setSilhouette,
  setTire,
  unlockAll,
  unlockField,
} from './state/carInput';
import { useUrlState } from './state/useUrlState';
import type { CarPreset } from './domain/presets';
import type { CarInput, DimensionKey, Silhouette, SpecFieldKey } from './domain/types';
import type { ViewKind } from './domain/geometry';

export default function App() {
  const [state, setState] = useUrlState();
  const { car, view, showGrid, showDimensions, presetId } = state;

  const preset = useMemo(
    () => (presetId !== undefined ? findPreset(presetId) : undefined),
    [presetId],
  );

  const spec = useMemo(
    () => resolve(car, { presetFields: presetFieldsOf(car, preset) }),
    [car, preset],
  );

  const geometry = useMemo(() => {
    const built = buildView(spec, view);

    // 3ビューで縮尺を揃える。寸法線は車体の外側に置くため先に余白を広げてから配置する
    const extent = unifiedViewExtent(spec);
    const bounds = expandBounds(
      built.bounds,
      showDimensions
        ? {
            width: extent.width * DIMENSION_PADDING.width,
            height: extent.height * DIMENSION_PADDING.height,
          }
        : extent,
    );

    return {
      bounds,
      shapes: [
        ...(showGrid ? buildGrid(bounds) : []),
        ...built.shapes,
        ...(showDimensions ? buildDimensions(spec, view, bounds) : []),
      ],
    };
  }, [spec, view, showGrid, showDimensions]);

  /** 車の入力を差し替える。ロックの付け外しはすべてここを通る */
  const updateCar = useCallback(
    (next: (current: CarInput) => CarInput) => {
      setState({ ...state, car: next(state.car) });
    },
    [state, setState],
  );

  const handleDimensionChange = useCallback(
    (key: DimensionKey, value: number) => {
      updateCar((current) => setDimension(current, key, value));
    },
    [updateCar],
  );

  const handleSilhouetteChange = useCallback(
    (silhouette: Silhouette) => {
      updateCar((current) => setSilhouette(current, silhouette));
    },
    [updateCar],
  );

  const handleTireChange = useCallback(
    (notation: string) => {
      updateCar((current) => setTire(current, notation));
    },
    [updateCar],
  );

  const handleDoorsChange = useCallback(
    (doors: number) => {
      updateCar((current) => setDoors(current, doors));
    },
    [updateCar],
  );

  const handleUnlock = useCallback(
    (key: SpecFieldKey) => {
      updateCar((current) => unlockField(current, key));
    },
    [updateCar],
  );

  /** すべて推定に戻す。車種の紐付けと名前も外す */
  const handleResetAll = useCallback(() => {
    const { presetId: _dropped, ...rest } = state;
    setState({ ...rest, car: setName(unlockAll(state.car), '') });
  }, [state, setState]);

  const handleLoadPreset = useCallback(
    (loaded: CarPreset) => {
      setState({ ...state, presetId: loaded.id, car: presetToCarInput(loaded) });
    },
    [state, setState],
  );

  const setView = useCallback(
    (next: ViewKind) => {
      setState({ ...state, view: next });
    },
    [state, setState],
  );

  return (
    <div className="app">
      <header className="app__header">
        <h1>Car Silhouette Configurator</h1>
        <ShareButton />
      </header>

      <div className="layout">
        <section className="layout__panel" aria-label="入力">
          <InputPanel
            input={car}
            spec={spec}
            presetId={presetId}
            onLoadPreset={handleLoadPreset}
            onSilhouetteChange={handleSilhouetteChange}
            onDimensionChange={handleDimensionChange}
            onTireChange={handleTireChange}
            onDoorsChange={handleDoorsChange}
            onUnlock={handleUnlock}
            onResetAll={handleResetAll}
          />
        </section>

        <section className="layout__view" aria-label="図">
          <div className="viewbar">
            <div className="segmented" role="group" aria-label="ビュー">
              {VIEW_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="segmented__item"
                  aria-pressed={kind === view}
                  onClick={() => setView(kind)}
                >
                  {VIEW_LABELS[kind]}
                </button>
              ))}
            </div>

            <div className="viewbar__toggles">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(event) => setState({ ...state, showGrid: event.target.checked })}
                />
                <span>グリッド</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={showDimensions}
                  onChange={(event) => setState({ ...state, showDimensions: event.target.checked })}
                />
                <span>寸法線</span>
              </label>
            </div>
          </div>

          <CarSvg
            shapes={geometry.shapes}
            bounds={geometry.bounds}
            title={`${SILHOUETTE_LABELS[spec.silhouette]}の${VIEW_LABELS[view]}図`}
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
            <SpecItem label="フロントトレッド" value={spec.trackFront} />
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
