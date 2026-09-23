import { render, screen, waitFor, within } from '@testing-library/react';
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
    lock: () => scope.getByRole('checkbox') as HTMLInputElement,
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
    expect(length.lock()).toBeChecked();
  });

  it('推定値のときはロックのチェックが外れている', () => {
    render(<App />);

    expect(field('length').lock()).not.toBeChecked();
    expect(field('length').lock()).toHaveAccessibleName('全長を固定する');
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

    // ロックのチェックを入れて現在値で固定する
    await user.click(field('wheelbase').lock());
    const locked = field('wheelbase').number().value;

    await user.clear(field('length').number());
    await user.type(field('length').number(), '5000');

    expect(field('wheelbase').number().value).toBe(locked);
    expect(field('wheelbase').source()).toBe('explicit');
    // 代わりに前後オーバーハングが伸びる
    expect(field('frontOverhang').source()).toBe('derived');
  });

  it('ロックのチェックを外すと推定に戻る', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(field('height').lock());
    expect(field('height').source()).toBe('explicit');
    expect(field('height').lock()).toBeChecked();

    await user.click(field('height').lock());
    expect(field('height').source()).toBe('derived');
    expect(field('height').lock()).not.toBeChecked();
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

describe('App ビュー切替', () => {
  it('側面・正面・上面のタブがある', () => {
    render(<App />);

    const views = screen.getByRole('group', { name: 'ビュー' });
    expect(within(views).getByRole('button', { name: '側面' })).toBeInTheDocument();
    expect(within(views).getByRole('button', { name: '正面' })).toBeInTheDocument();
    expect(within(views).getByRole('button', { name: '上面' })).toBeInTheDocument();
  });

  it('初期表示は側面図', () => {
    render(<App />);

    expect(screen.getByRole('img', { name: 'SUVの側面図' })).toBeInTheDocument();
    const views = screen.getByRole('group', { name: 'ビュー' });
    expect(within(views).getByRole('button', { name: '側面' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('タブを押すと正面図・上面図に切り替わる', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '正面' }));
    expect(screen.getByRole('img', { name: 'SUVの正面図' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '上面' }));
    expect(screen.getByRole('img', { name: 'SUVの上面図' })).toBeInTheDocument();
  });

  it('ビューを切り替えても縮尺が変わらない', async () => {
    const user = userEvent.setup();
    render(<App />);

    const viewBoxOf = () => screen.getByRole('img').getAttribute('viewBox')?.split(' ')[2];
    const side = viewBoxOf();

    await user.click(screen.getByRole('button', { name: '正面' }));
    expect(viewBoxOf()).toBe(side);

    await user.click(screen.getByRole('button', { name: '上面' }));
    expect(viewBoxOf()).toBe(side);
  });

  it('ビューを切り替えても入力とロックは保持される', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(field('width').number());
    await user.type(field('width').number(), '1900');

    await user.click(screen.getByRole('button', { name: '正面' }));

    expect(field('width').number().value).toBe('1900');
    expect(field('width').source()).toBe('explicit');
  });

  it('正面図でも全幅の変更が反映される', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '正面' }));
    const before = screen.getByRole('img').innerHTML;

    await user.clear(field('width').number());
    await user.type(field('width').number(), '2000');

    expect(screen.getByRole('img').innerHTML).not.toBe(before);
  });
});

describe('App グリッドと寸法線', () => {
  const svg = () => screen.getByRole('img');

  it('グリッドは既定で表示され、寸法線は既定で非表示', () => {
    render(<App />);

    expect(screen.getByRole('checkbox', { name: 'グリッド' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '寸法線' })).not.toBeChecked();
    expect(svg().querySelectorAll('.car__grid').length).toBeGreaterThan(0);
    expect(svg().querySelectorAll('.car__dimension')).toHaveLength(0);
  });

  it('グリッドを切ると線が消える', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('checkbox', { name: 'グリッド' }));

    expect(svg().querySelectorAll('.car__grid')).toHaveLength(0);
  });

  it('寸法線を入れると数値付きのラベルが出る', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('checkbox', { name: '寸法線' }));

    expect(svg().querySelectorAll('.car__dimension').length).toBeGreaterThan(0);
    expect(svg().textContent).toContain('全長 4575');
    expect(svg().textContent).toContain('WB 2675');
    expect(svg().textContent).toContain('全高 1690');
  });

  it('寸法線を入れると表示範囲が広がる', async () => {
    const user = userEvent.setup();
    render(<App />);

    const widthOf = () => Number(svg().getAttribute('viewBox')?.split(' ')[2]);
    const before = widthOf();

    await user.click(screen.getByRole('checkbox', { name: '寸法線' }));

    expect(widthOf()).toBeGreaterThan(before);
  });

  it('寸法線 ON のままビューを切り替えても縮尺が揃う', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('checkbox', { name: '寸法線' }));
    const widthOf = () => svg().getAttribute('viewBox')?.split(' ')[2];
    const side = widthOf();

    await user.click(screen.getByRole('button', { name: '正面' }));
    expect(widthOf()).toBe(side);
    expect(svg().textContent).toContain('トレッド');

    await user.click(screen.getByRole('button', { name: '上面' }));
    expect(widthOf()).toBe(side);
  });

  it('寸法を変えるとラベルの数値も変わる', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('checkbox', { name: '寸法線' }));
    await user.clear(field('length').number());
    await user.type(field('length').number(), '5000');

    expect(svg().textContent).toContain('全長 5000');
  });
});

describe('App URL への保存と復元', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  const hash = () => window.location.hash.replace(/^#/, '');

  it('寸法を変えると URL に反映される', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(field('length').number());
    await user.type(field('length').number(), '4800');

    await waitFor(() => expect(hash()).toContain('L:4800'));
    expect(hash()).toMatch(/^s1&/);
  });

  it('推定値は URL に入らない', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(field('length').number());
    await user.type(field('length').number(), '4800');

    await waitFor(() => expect(hash()).toContain('L:4800'));
    expect(hash()).not.toContain('wb:');
    expect(hash()).not.toContain('H:');
  });

  it('ビューと表示設定も URL に入る', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '上面' }));
    await user.click(screen.getByRole('checkbox', { name: '寸法線' }));

    await waitFor(() => expect(hash()).toContain('v=top'));
    expect(hash()).toContain('d=1');
  });

  it('URL から車の状態を復元する', () => {
    window.history.replaceState(null, '', '#s1&v=front&d=1&a=sil:kei,L:3395,wb:2520,t:165/60R14');
    render(<App />);

    expect(field('length').number().value).toBe('3395');
    expect(field('length').source()).toBe('explicit');
    expect(field('wheelbase').number().value).toBe('2520');
    expect(screen.getByRole('img', { name: '軽の正面図' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '寸法線' })).toBeChecked();
  });

  it('復元した状態でも未指定項目は推定値のままになる', () => {
    window.history.replaceState(null, '', '#s1&a=sil:sedan,L:4700');
    render(<App />);

    expect(field('length').source()).toBe('explicit');
    expect(field('height').source()).toBe('derived');
  });

  it('壊れた URL でも既定の状態で表示される', () => {
    window.history.replaceState(null, '', '#s1&a=sil:nonsense,L:abc&zz=1');
    render(<App />);

    expect(screen.getByRole('img', { name: 'SUVの側面図' })).toBeInTheDocument();
    expect(field('length').source()).toBe('derived');
  });

  it('URLをコピーするボタンがある', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'URLをコピー' })).toBeInTheDocument();
  });

  it('コピーに成功すると表示が変わる', async () => {
    // navigator.clipboard は jsdom では getter のみ。user-event が用意する
    // スタブを spy する
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'URLをコピー' }));

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeInTheDocument();

    writeText.mockRestore();
  });

  it('コピーできない環境では URL を手動選択できる形で出す', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new Error('denied'));
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'URLをコピー' }));

    expect(await screen.findByRole('textbox', { name: '共有URL' })).toBeInTheDocument();

    writeText.mockRestore();
  });
});

describe('App 車種プリセット', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  const presetList = () => within(screen.getByRole('list', { name: '車種' }));

  it('30台の一覧が出る', () => {
    render(<App />);

    expect(presetList().getAllByRole('button')).toHaveLength(30);
  });

  it('検索で絞り込める', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('searchbox', { name: '車種を検索' }), 'cx-5');

    expect(presetList().getAllByRole('button')).toHaveLength(1);
    expect(presetList().getByRole('button', { name: /Mazda CX-5/ })).toBeInTheDocument();
  });

  it('該当がなければメッセージを出す', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('searchbox', { name: '車種を検索' }), 'ダンプカー');

    expect(screen.getByText('該当する車種がありません')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '車種' })).not.toBeInTheDocument();
  });

  it('車種を選ぶと寸法が入り、出所が「車種」になる', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(presetList().getByRole('button', { name: /Mazda CX-5/ }));

    expect(field('length').number().value).toBe('4575');
    expect(field('width').number().value).toBe('1845');
    expect(field('length').source()).toBe('preset');
    expect(field('length').lock()).toBeChecked();
    // 一覧の項目とパネル見出しの両方に名前が出るので、見出し側（p 要素）で確認する
    expect(screen.getByText('Mazda CX-5', { selector: 'p' })).toBeInTheDocument();
  });

  it('プリセットが持たない項目は推定値のままになる', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(presetList().getByRole('button', { name: /Mazda CX-5/ }));

    expect(field('groundClearance').source()).toBe('derived');
    expect(field('trackFront').source()).toBe('derived');
  });

  it('読み込んだあとに編集した項目だけ「固定」に変わる', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(presetList().getByRole('button', { name: /Mazda CX-5/ }));
    await user.clear(field('length').number());
    await user.type(field('length').number(), '4800');

    expect(field('length').source()).toBe('explicit');
    expect(field('width').source()).toBe('preset');
  });

  it('車種を選ぶとシルエットも切り替わる', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(presetList().getByRole('button', { name: /Toyota HiAce/ }));

    expect(screen.getByRole('img', { name: 'ミニバンの側面図' })).toBeInTheDocument();
    expect(field('frontOverhang').number().value).toBe('690');
  });

  it('車種の ID が URL に入る', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(presetList().getByRole('button', { name: /Mazda CX-5/ }));

    await waitFor(() =>
      expect(window.location.hash).toContain('p=mazda-cx-5'),
    );
  });

  it('URL から車種を復元する', () => {
    window.history.replaceState(
      null,
      '',
      '#s1&p=porsche-911&a=sil:sports,L:4535,W:1852,H:1300,wb:2450,t:235/40R19,n:Porsche%20911',
    );
    render(<App />);

    expect(field('length').source()).toBe('preset');
    expect(field('length').number().value).toBe('4535');
    expect(screen.getByRole('img', { name: 'スポーツの側面図' })).toBeInTheDocument();
  });

  it('存在しない車種 ID は無視する', () => {
    window.history.replaceState(null, '', '#s1&p=delorean&a=sil:suv,L:4600');
    render(<App />);

    // 値は残るが車種由来ではなくなる
    expect(field('length').number().value).toBe('4600');
    expect(field('length').source()).toBe('explicit');
  });

  it('すべて推定に戻すと車種の紐付けも外れる', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(presetList().getByRole('button', { name: /Mazda CX-5/ }));
    await user.click(screen.getByRole('button', { name: 'すべて推定に戻す' }));

    expect(field('length').source()).toBe('derived');
    expect(screen.queryByText('Mazda CX-5', { selector: 'p' })).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).not.toContain('p='));
  });

  it('車種を読み込んでから寸法を変えても警告が出ない', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(presetList().getByRole('button', { name: /Ford F-150/ }));

    expect(screen.queryByRole('list', { name: '警告' })).not.toBeInTheDocument();
  });
});
