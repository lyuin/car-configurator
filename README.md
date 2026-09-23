# Car Silhouette Configurator

車の主要寸法を数値で指定すると、形状がわかる程度の簡易な線画（側面・正面・上面）を描く Web アプリ。
iPad から使うことを想定し、GitHub Pages で静的配信する。

- 状態は URL に保存でき、リンクを開けば同じ車が再現される
- 2台を並置 / オーバーレイで比較でき、寸法の差分も表で確認できる
- 未指定の寸法はシルエット別の典型比率から自動補完される。触った項目はロックされ、残りだけが再計算される

設計の詳細・データモデル・タスク一覧は [docs/PLAN.md](docs/PLAN.md) を参照。

## 開発

```sh
npm install      # 依存のインストール
npm run dev      # 開発サーバ
npm test         # テスト（1回実行）
npm run test:watch
npm run build    # 型チェック + 本番ビルド
npm run preview  # ビルド結果をローカル配信
```

## デプロイ

`main` に push すると GitHub Actions が `npm ci` → `npm test` → `npm run build` を実行し、
成功した場合のみ GitHub Pages へデプロイする。

初回のみリポジトリ側の設定が必要:

1. Settings → Pages → Build and deployment → Source を **GitHub Actions** に変更

`vite.config.ts` の `base` は GitHub Actions 上でのみ `/<リポジトリ名>/` に切り替わる。
リポジトリ名を変更した場合は `vite.config.ts` の `repoName` も合わせて変更する。

## 技術構成

| 項目 | 選択 |
|---|---|
| ビルド | Vite |
| UI | React + TypeScript（strict） |
| テスト | Vitest（jsdom） |
| 描画 | SVG（`viewBox` を mm 単位でとる） |
| 配信 | GitHub Pages（静的、バックエンドなし） |

描画に Canvas ではなく SVG を使っている理由は、寸法線や数値ラベルを DOM として扱えること、
`viewBox` を mm でとれば2台を同一スケールで並べる計算がほぼ不要になること、
オーバーレイの半透明表現が素直なこと、そして後からドラッグ操作を足すときにヒットテストを自前実装せずに済むこと。
