import { useCallback, useMemo } from 'react';
import { CarSvg } from './components/CarSvg';
import { InputPanel } from './components/InputPanel';
import { ShareButton } from './components/ShareButton';
import { SpecTable } from './components/SpecTable';
import { VIEW_KINDS, VIEW_LABELS } from './domain/geometry';
import { findPreset, presetFieldsOf, presetToCarInput } from './domain/presets';
import { resolve } from './domain/resolve';
import {
  buildScene,
  COMPARE_MODE_LABELS,
  OVERLAY_ORIGIN_LABELS,
  OVERLAY_ORIGINS,
} from './domain/scene';
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
import type { CompareMode, OverlayOrigin } from './domain/scene';
import type { CarInput, DimensionKey, ResolvedSpec, Silhouette, SpecFieldKey } from './domain/types';
import type { CarState } from './state/url';

/** 2台目を追加するときの初期状態。A と同じ車を並べても比較にならないのでセダンにする */
const NEW_CAR: CarState = { car: { silhouette: 'sedan' } };

export default function App() {
  const [state, setState] = useUrlState();
  const { a, b, active, view, compare, origin, showGrid, showDimensions } = state;

  const specA = useSpec(a);
  const specB = useSpec(b);
  const comparing = specB !== undefined;

  const editing = active === 'b' && b !== undefined ? b : a;
  const editingSpec = active === 'b' && specB !== undefined ? specB : specA;

  const scene = useMemo(
    () =>
      buildScene({
        a: specA,
        b: specB,
        view,
        compare,
        origin,
        active,
        showGrid,
        showDimensions,
      }),
    [specA, specB, view, compare, origin, active, showGrid, showDimensions],
  );

  /** 編集中の車の入力を差し替える */
  const updateEditing = useCallback(
    (next: (current: CarInput) => CarInput) => {
      const key = active === 'b' && state.b !== undefined ? 'b' : 'a';
      const target = key === 'b' ? state.b : state.a;
      if (target === undefined) {
        return;
      }
      setState({ ...state, [key]: { ...target, car: next(target.car) } });
    },
    [state, setState, active],
  );

  const handleDimensionChange = useCallback(
    (key: DimensionKey, value: number) => {
      updateEditing((current) => setDimension(current, key, value));
    },
    [updateEditing],
  );

  const handleSilhouetteChange = useCallback(
    (silhouette: Silhouette) => {
      updateEditing((current) => setSilhouette(current, silhouette));
    },
    [updateEditing],
  );

  const handleTireChange = useCallback(
    (notation: string) => {
      updateEditing((current) => setTire(current, notation));
    },
    [updateEditing],
  );

  const handleDoorsChange = useCallback(
    (doors: number) => {
      updateEditing((current) => setDoors(current, doors));
    },
    [updateEditing],
  );

  const handleUnlock = useCallback(
    (key: SpecFieldKey) => {
      updateEditing((current) => unlockField(current, key));
    },
    [updateEditing],
  );

  /** すべて推定に戻す。車種の紐付けと名前も外す */
  const handleResetAll = useCallback(() => {
    const key = active === 'b' && state.b !== undefined ? 'b' : 'a';
    const target = key === 'b' ? state.b : state.a;
    if (target === undefined) {
      return;
    }
    setState({ ...state, [key]: { car: setName(unlockAll(target.car), '') } });
  }, [state, setState, active]);

  const handleLoadPreset = useCallback(
    (loaded: CarPreset) => {
      const key = active === 'b' && state.b !== undefined ? 'b' : 'a';
      setState({ ...state, [key]: { presetId: loaded.id, car: presetToCarInput(loaded) } });
    },
    [state, setState, active],
  );

  const handleAddCarB = useCallback(() => {
    setState({ ...state, b: NEW_CAR, active: 'b' });
  }, [state, setState]);

  const handleRemoveCarB = useCallback(() => {
    const { b: _removed, ...rest } = state;
    setState({ ...rest, active: 'a' });
  }, [state, setState]);

  const nameOf = (spec: ResolvedSpec, fallback: string) => spec.name ?? fallback;

  return (
    <div className="app">
      <header className="app__header">
        <h1>Car Silhouette Configurator</h1>
        <ShareButton />
      </header>

      <div className="layout">
        <section className="layout__panel" aria-label="入力">
          <div className="cartabs" role="group" aria-label="編集する車">
            <button
              type="button"
              className="cartabs__item cartabs__item--a"
              aria-pressed={active === 'a'}
              onClick={() => setState({ ...state, active: 'a' })}
            >
              車A
            </button>

            {comparing ? (
              <>
                <button
                  type="button"
                  className="cartabs__item cartabs__item--b"
                  aria-pressed={active === 'b'}
                  onClick={() => setState({ ...state, active: 'b' })}
                >
                  車B
                </button>
                <button type="button" className="cartabs__remove" onClick={handleRemoveCarB}>
                  車Bを削除
                </button>
              </>
            ) : (
              <button type="button" className="cartabs__add" onClick={handleAddCarB}>
                車Bを追加して比較
              </button>
            )}
          </div>

          <InputPanel
            input={editing.car}
            spec={editingSpec}
            presetId={editing.presetId}
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
                  onClick={() => setState({ ...state, view: kind })}
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

          {comparing ? (
            <div className="viewbar">
              <div className="segmented" role="group" aria-label="比較の表示">
                {(['sideBySide', 'overlay'] as readonly CompareMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="segmented__item"
                    aria-pressed={mode === compare}
                    onClick={() => setState({ ...state, compare: mode })}
                  >
                    {COMPARE_MODE_LABELS[mode]}
                  </button>
                ))}
              </div>

              {compare === 'overlay' && view !== 'front' ? (
                <label className="originselect">
                  <span>基準</span>
                  <select
                    value={origin}
                    aria-label="重ねる基準点"
                    onChange={(event) =>
                      setState({ ...state, origin: event.target.value as OverlayOrigin })
                    }
                  >
                    {OVERLAY_ORIGINS.map((value) => (
                      <option key={value} value={value}>
                        {OVERLAY_ORIGIN_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

          <CarSvg
            layers={scene.layers}
            bounds={scene.bounds}
            title={
              comparing && specB !== undefined
                ? `${SILHOUETTE_LABELS[specA.silhouette]}と${SILHOUETTE_LABELS[specB.silhouette]}の${VIEW_LABELS[view]}図`
                : `${SILHOUETTE_LABELS[specA.silhouette]}の${VIEW_LABELS[view]}図`
            }
          />

          {editingSpec.warnings.length > 0 ? (
            <ul className="warnings" aria-label="警告">
              {editingSpec.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <SpecTable
            a={specA}
            b={specB}
            nameA={nameOf(specA, '車A')}
            {...(specB !== undefined ? { nameB: nameOf(specB, '車B') } : {})}
          />
        </section>
      </div>
    </div>
  );
}

/** 車の状態を解決済みスペックに変換する。車種由来の判定もここで行う */
function useSpec(carState: CarState): ResolvedSpec;
function useSpec(carState: CarState | undefined): ResolvedSpec | undefined;
function useSpec(carState: CarState | undefined): ResolvedSpec | undefined {
  return useMemo(() => {
    if (carState === undefined) {
      return undefined;
    }
    const preset = carState.presetId !== undefined ? findPreset(carState.presetId) : undefined;
    return resolve(carState.car, { presetFields: presetFieldsOf(carState.car, preset) });
  }, [carState]);
}
