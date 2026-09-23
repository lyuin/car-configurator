import { useCallback, useEffect, useRef, useState } from 'react';
import { loadEncodedState, saveEncodedState } from './storage';
import { decodeState, encodeState } from './url';
import type { AppState } from './url';

/** ハッシュ書き込みのデバウンス (ms)。スライダー操作中に書き続けないため */
const WRITE_DELAY = 200;

/**
 * 状態を URL のハッシュと localStorage に同期する。
 *
 * 読み込みの優先順位は URL → localStorage → 既定値。共有されたリンクを開いた
 * ときは必ずそのリンクの内容が出るべきで、前回の状態が勝ってはいけない。
 *
 * 書き込みは `history.replaceState` を使う。`pushState` だとスライダーを
 * 動かすたびに履歴が積まれて戻るボタンが使えなくなる。
 *
 * 同じタブで別の URL を貼られたときに追従するため `hashchange` も拾う。
 * 自分が書いたハッシュは無視して、書き込みと読み込みのループを避ける。
 */
export function useUrlState(): [AppState, (next: AppState) => void] {
  const [state, setState] = useState<AppState>(() => decodeState(initialEncodedState()));
  const lastWritten = useRef<string | null>(null);

  useEffect(() => {
    const encoded = encodeState(state);
    const timer = setTimeout(() => {
      saveEncodedState(encoded);
      if (encoded === window.location.hash.replace(/^#/, '')) {
        return;
      }
      lastWritten.current = encoded;
      window.history.replaceState(null, '', `#${encoded}`);
    }, WRITE_DELAY);

    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    const onHashChange = () => {
      const current = window.location.hash.replace(/^#/, '');
      if (current === lastWritten.current) {
        return;
      }
      setState(decodeState(current));
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const update = useCallback((next: AppState) => {
    setState(next);
  }, []);

  return [state, update];
}

/** URL にハッシュがあればそれを、無ければ前回保存した状態を使う */
function initialEncodedState(): string {
  const fromHash = window.location.hash.replace(/^#/, '');
  if (fromHash !== '') {
    return fromHash;
  }
  return loadEncodedState() ?? '';
}
