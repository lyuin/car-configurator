import '@testing-library/jest-dom/vitest';

/**
 * テストごとに保存済みの状態と URL を初期化する。
 *
 * アプリは状態を localStorage と URL のハッシュに保存するため、
 * これをやらないと前のテストの状態を次のテストが復元してしまう。
 */
beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // localStorage を意図的に壊しているテストがある
  }
  window.history.replaceState(null, '', '#');
});
