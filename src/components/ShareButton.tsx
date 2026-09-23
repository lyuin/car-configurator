import { useState } from 'react';

/**
 * 現在の URL をクリップボードにコピーする。
 *
 * `navigator.clipboard` は安全なコンテキスト（HTTPS / localhost）でしか使えないので、
 * 使えない場合は URL を選択可能な形で表示するフォールバックを出す。
 */
export function ShareButton() {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('failed');
    }
  };

  return (
    <div className="share">
      <button type="button" className="share__button" onClick={copy}>
        {status === 'copied' ? 'コピーしました' : 'URLをコピー'}
      </button>

      {status === 'failed' ? (
        <p className="share__fallback">
          コピーできませんでした。以下を手動で選択してください。
          <input
            className="share__url"
            type="text"
            readOnly
            value={window.location.href}
            onFocus={(event) => event.target.select()}
            aria-label="共有URL"
          />
        </p>
      ) : null}
    </div>
  );
}
