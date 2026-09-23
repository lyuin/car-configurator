# Car Silhouette Configurator — 実装プラン

> このドキュメントは合意済みの要件・設計判断・タスク一覧の保存版。
> 開発を再開するときは「進捗」セクションを最初に読むこと。

## 進捗（2026-09-23 時点）

**Task 1・Task 2 完了。次は Task 3（自動補完エンジン）。**

- 公開 URL: https://lyuin.github.io/car-configurator/
- リポジトリ: https://github.com/lyuin/car-configurator （public）

Task 1 で作ったもの:
- `package.json` と依存（バージョンは `--save-exact` で固定）
- `vite.config.ts`（Pages サブパス対応 + Vitest 設定）
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json`（strict 系フル有効）
- `index.html`（iPad 向け viewport: `viewport-fit=cover`、ユーザースケール許可）
- `src/main.tsx` / `src/App.tsx` / `src/index.css`（プレースホルダ、セーフエリア対応）
- `src/vite-env.d.ts`（TypeScript 7 が CSS の副作用インポートに型宣言を要求するため必要）
- `src/__tests__/smoke.test.tsx`（React + TSX + Vitest の配線検証）
- `.github/workflows/deploy.yml`（main push → `npm ci` → `npm test` → `npm run build` → Pages）
- `README.md` / `.gitignore`

検証済み:
- `npm test` / `npm run build` が通る
- Pages は Actions ソースで有効化（`gh api -X POST repos/lyuin/car-configurator/pages -f build_type=workflow`）
- 公開 URL が HTTP 200、`base` が `/car-configurator/` に切り替わり JS / CSS も 200 で解決

インストール済みバージョン:

| パッケージ | バージョン |
|---|---|
| react / react-dom | 19.3.0 |
| vite | 8.3.0 |
| vitest | 5.0.1 |
| typescript | 7.0.2 |
| @vitejs/plugin-react | 6.1.1 |
| jsdom | 29.1.1 |

TypeScript は 7 系。`tsc -b` は問題なく動作した。ただし CSS の副作用インポートには
`src/vite-env.d.ts` の `/// <reference types="vite/client" />` が必須（無いと TS2882）。

## Problem Statement

車の主要寸法を数値で指定すると、簡易な線画（丸＋箱レベル、形状がわかる程度）で車を描画する Web アプリ。
iPad から使い、GitHub Pages で静的配信。状態は URL に保存でき、2台を見た目とスペックの両方で比較できる。

## 確定した要件

| # | 決定事項 |
|---|---|
| 1 | ビューは側面図・正面図・上面図の3種 |
| 2 | 既存車種はリポジトリ内蔵のプリセット JSON（外部 API 不使用） |
| 3 | Vite + TypeScript + React、GitHub Actions で Pages へデプロイ |
| 4 | 比較は「並置」と「オーバーレイ」をトグル切替 |
| 5 | タイヤは `225/55R18` 形式の規格表記をパースして外径算出 |
| 6 | 自動補完はシルエット別の典型比率テーブル + ロック/再計算 |
| 7 | グリッド + 寸法線トグル |
| 8 | プリセットは国内外問わず、寸法が似通っていない車を約30台 |
| 9 | スライダー + 数値、iPad 横持ち2カラム。図の直接ドラッグは後続 |
| 10 | 比較スペックは寸法系のみ |

## 将来の拡張（合意済み・今回は作らない）

- プリセット車種を基準にした差分補完（「CX-5 の比率を保ったまま全長だけ +200mm」）
- 人物シルエットによるスケール参照（身長可変、既定 170cm）
- 図のドラッグハンドルによる直接操作（ドラッグで寸法変更 + 自動ロック）
- 駆動レイアウト（FF / FR / MR / RR / 4WD Front・Rear）の選択
- パワートレイン搭載位置のドラッグと重量配分の算出・可視化

## 技術判断

**SVG で描画する（Canvas ではない）**
- 寸法線や数値ラベルを DOM として置ける
- `viewBox` を mm 単位にすれば2台を同一スケールで並べる処理がほぼ不要
- オーバーレイの半透明が素直
- 後からドラッグハンドルを足すときにヒットテストを自前実装せずに済む

`viewBox` は mm でとる。比較時は2台の外接矩形の和を `viewBox` にすることでスケール合わせが自動的に成立する。

**タイヤ外径の算出**

```
外径 = ホイール径(inch) × 25.4 + 2 × (タイヤ幅 × 扁平率 / 100)
```

ホイール径も別途保持し、リムとタイヤを描き分ける。

**自動補完**

純関数 `resolve(explicit, locks) → ResolvedSpec` に閉じ込める。
補完元を「シルエット平均比率」から「特定車種の比率」に差し替えるだけで差分補完へ拡張できる形にする。

**URL 形式**

`#` 以降に、明示指定（= ロック済み）の項目だけを短縮キーの key-value で載せる。
推定値は載せないので URL が短く、後で比率テーブルを改善したとき既存 URL も新しい推定に追従する。
先頭にスキーマ版 `s1` を置いて将来の形式変更に備える。

```
#s1&m=ov&v=side&a=sil:suv,L:4600,W:1845,H:1690,t:225/55R19&b=sil:wgn,L:4755,...
```

## アーキテクチャ

```mermaid
flowchart LR
    URL[URL hash] <--> Store[App State<br/>carA / carB / viewMode / compareMode]
    Presets[(presets.json<br/>約30車種)] --> Store
    Store --> Resolver[resolve<br/>比率テーブル+ロック]
    Resolver --> Geo[geometry builder<br/>side / front / top]
    Geo --> SVG[SVG Renderer<br/>viewBox = mm]
    Resolver --> Table[スペック比較表]
    Panel[入力パネル<br/>スライダー/数値/ロック] --> Store
```

画面レイアウト（iPad 横持ち）:

```mermaid
flowchart TD
    subgraph iPad横持ち
    P[左: 入力パネル<br/>車A / 車B タブ] --- C[右: 図<br/>ビュー切替 / 並置・重ね替え]
    C --- T[下: スペック比較表]
    end
```

## データモデル方針

```ts
type Silhouette = 'sedan' | 'hatch' | 'suv' | 'wagon' | 'minivan' | 'coupe' | 'kei' | 'pickup' | 'van';

// ユーザーが明示した値のみ（未指定は undefined = 推定対象）
interface CarInput {
  name?: string;
  silhouette: Silhouette;
  length?: number; width?: number; height?: number;
  wheelbase?: number;
  frontOverhang?: number; rearOverhang?: number;
  trackFront?: number; trackRear?: number;
  groundClearance?: number;
  tire?: string;        // '225/55R19'
  doors?: number;
}

// 全項目が埋まった状態 + 各項目の出所
interface ResolvedSpec extends Required<Omit<CarInput, 'name'>> {
  tireDiameter: number; rimDiameter: number; tireWidth: number;
  source: Record<keyof CarInput, 'explicit' | 'derived' | 'preset'>;
}
```

整合性の制約（`全長 = フロントOH + WB + リアOH`）は「ロックされていない項目を優先して吸収する」ルールで解決する。
全長・WB・OH がすべてロックされて矛盾した場合は警告を出し、リア OH で吸収する。

## タスク一覧

### Task 1: プロジェクト基盤と GitHub Pages への自動デプロイ ✅ 完了
- Vite + React + TypeScript 初期化、Vitest 導入、ダミーテスト1本
- `vite.config.ts` の `base` をリポジトリ名に（Pages サブパス対応）
- GitHub Actions で main push 時に build → Pages デプロイ
- iPad 向け `viewport` メタタグ（`viewport-fit=cover`、ユーザースケール許可）
- Demo: 公開 Pages URL を iPad Safari で開き、プレースホルダ画面が表示される

### Task 2: ドメイン型とタイヤ規格パーサ ✅ 完了

実装: `src/domain/types.ts`（`Silhouette` / `CarInput` / `ResolvedSpec` / `TireSpec` / `ParseResult`）、
`src/domain/tire.ts`（`parseTireSpec` / `tireOuterDiameter` / `formatTireSpec`）、テスト31件。

決めたこと:
- エラーは例外ではなく `ParseResult<T> = {ok:true,value} | {ok:false,error}` で返す。テキスト入力中の不正な文字列を「異常」ではなく「まだ有効でない状態」として UI に出したいため
- 入力は `String.normalize('NFKC')` してから解析。iPad の日本語キーボードの全角 `２２５／５５Ｒ１８` を救う
- `P` / `LT` プレフィックス、`ZR`、末尾のロードインデックス（`95V XL`）、リム径 0.5 刻みを受け付ける
- 受付範囲: タイヤ幅 100〜400mm / 扁平率 15〜95% / リム径 10〜30inch

<details>
<summary>当初のタスク定義</summary>
- `CarInput` / `ResolvedSpec` / `Silhouette` の型定義
- `parseTireSpec('225/55R18')` → 幅・扁平率・リム径・外径 を返す純関数
- テスト: 正常系（複数サイズの外径）、異常系（不正文字列、範囲外扁平率）、大文字小文字・スペースの揺れ
- Demo: `npm test` が全通し、任意サイズの外径が算出できる
</details>

### Task 3: 自動補完エンジン
- シルエット別比率テーブル（WB/全長、フロントOH/全長、全高/全長、トレッド/全幅、最低地上高 など）
- `resolve(input, locks)` 実装。未ロック項目を推定し `全長 = FOH + WB + ROH` の整合をとる。出所を `source` に記録
- テスト: 全長のみ指定時の推定値、WB ロック時に全長変更で OH が追従、矛盾入力の吸収と警告、シルエット変更で未ロック項目のみ変化
- Demo: 「SUV・全長4600のみ指定 → WB 2760、FOH 780…」が確認できる

### Task 4: 側面図のジオメトリと SVG レンダラ
- `buildSideView(spec)` → mm 座標のポリライン・円・円弧。シルエット別にルーフラインとベルトラインの制御点を定義（セダン3ボックス、ハッチ2ボックス、SUV は車高とクリアランス高め 等）
- タイヤは外径の円 + リムの円、ホイールアーチは円弧
- `<CarSvg>` で mm の `viewBox` に描画。線のみ、塗りなし
- テスト: 主要座標の一致（前輪中心X = FOH、接地点Y = 0 等）、レンダラはスナップショット
- Demo: 固定スペックの側面図が表示され、シルエット切替で形が変わる

### Task 5: 入力パネルとロック UI
- 各項目をスライダー + 数値表示で。タイヤは規格表記テキスト、シルエットはセグメントコントロール
- 編集で自動ロック（鍵アイコン）、推定値はグレーで「推定」表示。鍵タップで解除
- iPad 横持ち2カラム、縦持ちは上下積みに CSS 切替
- 将来のドラッグハンドル用に「寸法更新 + ロック」を1関数に集約
- Demo: スライダーでリアルタイム変形。WB ロックして全長を動かすと前後 OH だけ伸びる

### Task 6: 正面図・上面図とビュー切替
- `buildFrontView(spec)`（全幅・全高・トレッド・タイヤ幅）、`buildTopView(spec)`（全長・全幅・WB・トレッド、キャビンは台形）
- 3ビューのタブ切替、同一スケール維持
- Demo: タブ切替でどのビューでも入力変更が即反映

### Task 7: グリッドと寸法線
- 500mm グリッド背景（ビューごとに原点を合わせる）
- 全長・全幅・全高・WB・前後OH・タイヤ外径に矢印つき寸法線と数値ラベル。トグル ON/OFF、設定は URL と localStorage に保存
- 人物シルエット追加を見込み「参照オブジェクトレイヤー」として分離
- Demo: トグル ON で寸法が数値付きで表示される

### Task 8: URL への保存と復元
- `encodeState` / `decodeState`。明示指定項目のみ短縮キーで直列化、`s1` プレフィックス
- 状態変更時に `history.replaceState`（入力中はデバウンス）
- 「URLをコピー」ボタン
- テスト: ラウンドトリップ、未知キーや壊れたハッシュのフォールバック、旧バージョンの扱い
- Demo: URL をコピーして別タブで開くと同じ車が再現される

### Task 9: プリセット車種とインポート
- 寸法空間で散らばるように約30台を選定（軽トール〜超小型コミューター、ホットハッチ、ロードスター、ミッドシップ、3列SUV、ピックアップ、フルサイズバン、ロング WB の EV まで）。似た寸法は代表1台に絞る
- `presets.json`（全長/全幅/全高/WB/フロントOH/トレッド/最低地上高/タイヤサイズ/ドア数/シルエット）。スキーマをテストで検証
- 検索つき車種ピッカー。選ぶと全項目が `preset` 由来、編集で `explicit` に変わる
- **選定リストは実装時にユーザーへ提示して確認を取る**
- Demo: プリセットを読み込み、そこから寸法を変えて自分の車を作れる

### Task 10: 2台比較モード
- 車A/Bタブで片方ずつ編集。B は未設定から開始、比較モード ON で有効化
- 並置: 同一スケールで左右。オーバーレイ: 半透明で重ね、色で区別。基準点をフロントバンパー/前輪中心/車体中央から選択
- スペック比較表に差分（±mm）
- テスト: 2台分の URL ラウンドトリップ、`viewBox` が両車を含むこと、差分計算
- Demo: プリセット2台を重ねて違いが図と表で確認できる

### Task 11: iPad 向け仕上げ
- タッチ調整（スライダーのヒットエリア、意図しないピンチズーム/バウンススクロール抑制、セーフエリア）
- 最後の状態を localStorage に保存し、URL なしで開いたとき復元
- ホーム画面追加用アイコンとマニフェスト、フルスクリーン
- README に使い方・URL 形式・プリセット追加手順・将来の拡張候補
- Demo: ホーム画面から起動しフルスクリーンで一連の操作ができる

## 将来拡張に向けた設計上の配慮

- 補完エンジンは比率テーブル差し替え可能な純関数 → プリセット基準の差分補完に対応しやすい
- 図の要素を「参照オブジェクトレイヤー」として分離 → 人物シルエットを追加するだけ
- 寸法更新とロックを1アクションに集約 → ドラッグハンドルはそのアクションを呼ぶだけ
- `ResolvedSpec` に任意フィールドを足せる型構成 + SVG レイヤー分割 → 駆動レイアウト・搭載位置・重量配分の可視化を後から載せられる
