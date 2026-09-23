import {
  isLocked,
  lockedCount,
  setDimension,
  setDoors,
  setName,
  setSilhouette,
  setTire,
  unlockAll,
  unlockField,
} from '../carInput';
import { resolve } from '../../domain/resolve';
import type { CarInput } from '../../domain/types';

const base: CarInput = { silhouette: 'suv' };

describe('setDimension', () => {
  it('値を設定すると同時にロックされる', () => {
    const next = setDimension(base, 'length', 4600);

    expect(next.length).toBe(4600);
    expect(isLocked(next, 'length')).toBe(true);
  });

  it('元の入力を変更しない', () => {
    setDimension(base, 'length', 4600);

    expect(base.length).toBeUndefined();
  });

  it('resolve を通すと explicit として扱われる', () => {
    const spec = resolve(setDimension(base, 'wheelbase', 2700));

    expect(spec.source.wheelbase).toBe('explicit');
    expect(spec.wheelbase).toBe(2700);
  });
});

describe('unlockField', () => {
  it('フィールドを削除してロックを解除する', () => {
    const locked = setDimension(base, 'length', 4600);
    const unlocked = unlockField(locked, 'length');

    expect(unlocked.length).toBeUndefined();
    expect(isLocked(unlocked, 'length')).toBe(false);
  });

  it('解除すると推定値に戻る', () => {
    const locked = setDimension(base, 'height', 2000);
    const unlocked = unlockField(locked, 'height');

    expect(resolve(locked).height).toBe(2000);
    expect(resolve(unlocked).source.height).toBe('derived');
    expect(resolve(unlocked).height).not.toBe(2000);
  });

  it('他の項目のロックは保持される', () => {
    const input = setDimension(setDimension(base, 'length', 4600), 'wheelbase', 2700);
    const next = unlockField(input, 'length');

    expect(next.wheelbase).toBe(2700);
  });
});

describe('setSilhouette', () => {
  it('ロック済みの項目を保持し、推定値だけを変える', () => {
    const input = setSilhouette(setDimension(base, 'length', 4600), 'sedan');
    const spec = resolve(input);

    expect(spec.length).toBe(4600);
    expect(spec.silhouette).toBe('sedan');
    // 全高は未ロックなのでセダンの比率で再計算される
    expect(spec.height).toBe(resolve({ silhouette: 'sedan', length: 4600 }).height);
  });
});

describe('setTire / setDoors / setName', () => {
  it('タイヤ表記を設定するとロックされる', () => {
    const next = setTire(base, '225/55R19');

    expect(next.tire).toBe('225/55R19');
    expect(resolve(next).source.tire).toBe('explicit');
  });

  it('ドア数を設定するとロックされる', () => {
    const next = setDoors(base, 3);

    expect(resolve(next).doors).toBe(3);
    expect(resolve(next).source.doors).toBe('explicit');
  });

  it('名前を空文字にすると削除される', () => {
    const named = setName(base, 'マイカー');

    expect(named.name).toBe('マイカー');
    expect(setName(named, '').name).toBeUndefined();
  });
});

describe('lockedCount / unlockAll', () => {
  it('ロック中の項目数を数える', () => {
    expect(lockedCount(base)).toBe(0);

    const input = setTire(setDimension(setDimension(base, 'length', 4600), 'width', 1850), '225/55R19');

    expect(lockedCount(input)).toBe(3);
  });

  it('シルエットはロック対象に数えない', () => {
    expect(lockedCount(setSilhouette(base, 'kei'))).toBe(0);
  });

  it('すべて解除すると推定のみの状態に戻る', () => {
    const input = setTire(setDimension(base, 'length', 4600), '225/55R19');
    const reset = unlockAll(input);

    expect(lockedCount(reset)).toBe(0);
    expect(reset.silhouette).toBe('suv');
    expect(resolve(reset)).toEqual(resolve({ silhouette: 'suv' }));
  });
});
