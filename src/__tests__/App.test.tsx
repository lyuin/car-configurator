import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

/** 指定した寸法フィールドの要素をまとめて取り出す */
function field(name: string) {
  const container = document.querySelector(`[data-field="${name}"]`);
  if (container === null) {
    throw new Error(`フィールドが見つからない: ${name}`);
  }
  const scope = within(container as HTMLElement);
  return {
    container: container as HTMLElement,
    number: () => scope.getByRole('spinbutton') as HTMLInputElement,
    slider: () => scope.getByRole('slider') as HTMLInputElement,
    lock: () => scope.getByRole('button'),
    source: () => (container as HTMLElement).dataset.source,
  };
}

describe('App の初期状態', () => {
  it('SUV の側面図と推定値が表示される', () => {
    render(<App />);

    expect(screen.getByRole('img', { name: 'SUVの側面図' })).toBeInTheDocument();
    expect(field('length').number().value).toBe('4575');
    expect(field('length').source()).toBe('derived');
  });

  it('すべての項目が推定値であることを伝える', () => {
    render(<App />);

    expect(screen.getByText(/すべて推定値/)).toBeInTheDocument();
  });

  it('警告は表示されない', () => {
    render(<App />);

    expect(screen.queryByRole('list', { name: '警告' })).not.toBeInTheDocument();
  });
});

describe('App 寸法の変更とロック', () => {
  it('数値を入力するとその項目が固定され、図に反映される', async () => {
    const user = userEvent.setup();
    render(<App />);

    const length = field('length');
    await user.clear(length.number());
    await user.type(length.number(), '4800');

    expect(length.number().value).toBe('4800');
    expect(length.source()).toBe('explicit');
    expect(length.lock()).toHaveAttribute('aria-pressed', 'true');
  });

  it('全長を変えると未ロックのホイールベースも追従する', async () => {
    const user = userEvent.setup();
    render(<App />);

    const before = field('wheelbase').number().value;

    await user.clear(field('length').number());
    await user.type(field('length').number(), '5000');

    expect(field('wheelbase').number().value).not.toBe(before);
    expect(field('wheelbase').source()).toBe('derived');
  });

  it('ホイールベースを固定すると全長を変えてもホイールベースは動かない', async () => {
    const user = userEvent.setup();
    render(<App />);

    // 「推定」バッジを押して現在値で固定する
    await user.click(field('wheelbase').lock());
    const locked = field('wheelbase').number().value;

    await user.clear(field('length').number());
    await user.type(field('length').number(), '5000');

    expect(field('wheelbase').number().value).toBe(locked);
    expect(field('wheelbase').source()).toBe('explicit');
    // 代わりに前後オーバーハングが伸びる
    expect(field('frontOverhang').source()).toBe('derived');
  });

  it('固定した項目のバッジを押すと推定に戻る', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(field('height').lock());
    expect(field('height').source()).toBe('explicit');

    await user.click(field('height').lock());
    expect(field('height').source()).toBe('derived');
  });

  it('スライダーを動かすと値が変わり固定される', async () => {
    render(<App />);

    const slider = field('groundClearance').slider();
    slider.focus();
    // range 要素は fireEvent 相当の直接操作で値を変える
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(slider, { target: { value: '260' } });

    expect(field('groundClearance').number().value).toBe('260');
    expect(field('groundClearance').source()).toBe('explicit');
  });

  it('すべて推定に戻すとロックが消える', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(field('length').lock());
    await user.click(field('width').lock());
    expect(screen.getByText(/2 項目を固定中/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'すべて推定に戻す' }));

    expect(screen.getByText(/すべて推定値/)).toBeInTheDocument();
    expect(field('length').source()).toBe('derived');
  });
});

describe('App シルエットの切替', () => {
  it('シルエットを変えると図と推定値が変わる', async () => {
    const user = userEvent.setup();
    render(<App />);

    const heightBefore = field('height').number().value;

    await user.click(screen.getByRole('button', { name: 'セダン' }));

    expect(screen.getByRole('img', { name: 'セダンの側面図' })).toBeInTheDocument();
    expect(field('height').number().value).not.toBe(heightBefore);
  });

  it('固定した項目はシルエットを変えても保持される', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(field('length').number());
    await user.type(field('length').number(), '4600');

    await user.click(screen.getByRole('button', { name: '軽' }));

    expect(field('length').number().value).toBe('4600');
    expect(field('length').source()).toBe('explicit');
  });
});

describe('App タイヤの入力', () => {
  it('規格表記を入力すると外径が更新される', async () => {
    const user = userEvent.setup();
    render(<App />);

    const tire = within(document.querySelector('[data-field="tire"]') as HTMLElement);
    const input = tire.getByRole('textbox');

    await user.clear(input);
    await user.type(input, '265/40R22');

    // 22inch = 558.8mm、サイドウォール 265 × 0.40 = 106mm → 外径 770.8mm
    expect(tire.getByText(/外径 771 mm/)).toBeInTheDocument();
  });

  it('解釈できない表記はエラーを出すが図は壊れない', async () => {
    const user = userEvent.setup();
    render(<App />);

    const tire = within(document.querySelector('[data-field="tire"]') as HTMLElement);
    await user.clear(tire.getByRole('textbox'));
    await user.type(tire.getByRole('textbox'), '225-55-19');

    expect(tire.getByRole('alert')).toHaveTextContent('225/55R18 の形式');
    expect(screen.getByRole('img', { name: 'SUVの側面図' })).toBeInTheDocument();
  });

  it('全角入力を受け付ける', async () => {
    const user = userEvent.setup();
    render(<App />);

    const tire = within(document.querySelector('[data-field="tire"]') as HTMLElement);
    await user.clear(tire.getByRole('textbox'));
    await user.type(tire.getByRole('textbox'), '２２５／５５Ｒ１９');

    expect(tire.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('App 矛盾した入力', () => {
  it('ホイールベースが長すぎると警告が出る', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(field('length').number());
    await user.type(field('length').number(), '3000');
    await user.clear(field('wheelbase').number());
    await user.type(field('wheelbase').number(), '2800');

    expect(screen.getByRole('list', { name: '警告' })).toBeInTheDocument();
  });
});
