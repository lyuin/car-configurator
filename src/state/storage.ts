/**
 * 最後の状態をブラウザに保存する。
 *
 * URL コーデックが作る文字列をそのまま保存する。専用のシリアライズを作らずに済み、
 * 壊れた値への耐性も `decodeState` の仕組みがそのまま効く。
 *
 * Safari のプライベートモードなどでは `localStorage` へのアクセス自体が例外を
 * 投げるため、読み書きの両方を try/catch で包む。保存できないだけで
 * アプリが使えなくなる理由はない。
 */

const STORAGE_KEY = 'car-configurator:state';

export function loadEncodedState(): string | undefined {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveEncodedState(encoded: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, encoded);
  } catch {
    // 保存できなくても動作に支障はない
  }
}

export function clearEncodedState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上
  }
}
