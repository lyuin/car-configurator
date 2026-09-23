import { clearEncodedState, loadEncodedState, saveEncodedState } from '../storage';

describe('storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('保存した文字列を読み出せる', () => {
    saveEncodedState('s1&a=sil:suv,L:4600');

    expect(loadEncodedState()).toBe('s1&a=sil:suv,L:4600');
  });

  it('何も保存していなければ undefined を返す', () => {
    expect(loadEncodedState()).toBeUndefined();
  });

  it('削除できる', () => {
    saveEncodedState('s1&a=sil:kei');
    clearEncodedState();

    expect(loadEncodedState()).toBeUndefined();
  });

  it('上書きできる', () => {
    saveEncodedState('s1&a=sil:kei');
    saveEncodedState('s1&a=sil:suv');

    expect(loadEncodedState()).toBe('s1&a=sil:suv');
  });
});

describe('storage が使えない環境', () => {
  const realStorage = window.localStorage;

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: realStorage,
      configurable: true,
    });
  });

  /** Safari のプライベートモードでは localStorage へのアクセス自体が例外を投げる */
  function breakStorage() {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
      configurable: true,
    });
  }

  it('読み出しが例外を投げても undefined を返す', () => {
    breakStorage();

    expect(() => loadEncodedState()).not.toThrow();
    expect(loadEncodedState()).toBeUndefined();
  });

  it('保存が例外を投げても落ちない', () => {
    breakStorage();

    expect(() => saveEncodedState('s1&a=sil:suv')).not.toThrow();
  });

  it('削除が例外を投げても落ちない', () => {
    breakStorage();

    expect(() => clearEncodedState()).not.toThrow();
  });
});
