# Bone 2D

[English](README.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · **日本語**

<p align="center"><img src="docs/media/kit-walk.gif" alt="歩くデモ用のキツネ Kit：IK の脚、物理演算のしっぽ、耳とスカーフ" width="280"></p>

![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![CI](https://github.com/iamgatz/Bone-2D/actions/workflows/ci.yml/badge.svg)

**ブラウザで動く無料の 2D スケルタルアニメーションエディターです。** リンクを開いて、リグを組み、アニメーションを付けて、エクスポートするだけです。インストールは不要で、ファイルがあなたのマシンの外に出ることはありません。
オープンソース（MIT）の Spine 代替ツールです。**Spine 4.3** 形式（`.json` またはバイナリの `.skel`、`.atlas`、`.png`）で書き出し、その結果は公式の `spine-core` ランタイムで検証されています。

**[エディターを開く →](https://iamgatz.github.io/Bone-2D/)** デモ用のリグ「Kit」はワンクリックで開けます。
直接リンク：[`?demo`](https://iamgatz.github.io/Bone-2D/?demo) でキツネを開き、[`?demo=wave`](https://iamgatz.github.io/Bone-2D/?demo=wave) で `wave` アニメーションを再生した状態で開きます（`walk`、`jump`、`idle` もあります）。インターフェースは英語、ロシア語、簡体字中国語に対応しています。
初めてデモを開くと、2分間のインタラクティブなレッスン（"Bring the fox to life"）が基本的な作業の流れを案内します。Help からいつでも呼び出せ、Learn メニューには全部で7つのレッスン（リギング、メッシュ、IK、カーブ、スキンとイベント、エクスポート）が用意されています。

## 機能

- **リギング：** ボーン、スロット、ウェイト付きメッシュ（自動トレース、ウェイトブラシ）、スキン、クリッピング、バウンディングボックス、パス、Photoshop と OpenRaster（Krita、GIMP）のインポート、そしてレイヤーで描かれたキャラクターに対してボーン、メッシュ、IK を自動で構築するオートリグ。
- **コンストレイント：** IK、トランスフォーム、パス、物理演算、そして Spine 4.3 のスライダー。
- **アニメーション：** ベジェカーブ対応のドープシートとグラフエディター、オニオンスキン、イベント、描画順とシーケンスのキー、ポーズライブラリ、キー操作ツール。
- **エクスポート：** アトラスパッカー付きの Spine 4.3 JSON またはバイナリ。フレームを再生するゲーム向けの GIF、PNG シーケンス、動画、または JSON 付きのパック済みスプライトシート。単一ファイルのプレイヤーページ。あなたのキャラクターを自分のゲーム内で再生できる無料のプレイヤー（JavaScript ファイル1つ、MIT）付きの **Web ゲーム** パッケージ。Spine JSON 4.0 – 4.3 とバイナリ 4.3 のインポート、および **DragonBones** プロジェクト（アトラス付きの `*_ske.json`、フォーマット 5）のインポートに対応し、公式の DragonBones ランタイムで検証されています。
- **レビュー：** アニメーション入りの HTML ページを1つ送るだけで、レビュアーはボーンをクリックしてコメントを残せます。そのコメントはマーカーとして取り込めます。
- **安心して試せる：** 300 ステップの元に戻す、比較したり一部を取り込んだりできるチェックポイント、自動バックアップ。
- **アカウントもサーバーも不要：** コマンドラインからも使えます（`npm run cli`）。

エディターで `Ctrl+K` を押すとコマンドパレットが開きます。Spine にある機能と Bone 2D にある機能の項目ごとの比較：[docs/SPINE_PARITY.md](docs/SPINE_PARITY.md)（ロシア語）。

## ローカルで実行する

```bash
npm install
npm run dev        # http://localhost:5273
npm test           # unit tests and random editor sessions, including a comparison with the official spine-core
npm run build      # production build into dist/
npm run cli -- help   # Spine skeleton data without the editor: export, import, info, check, clean
```

ランダムなエディターセッションをより長く実行する場合（`FUZZ_FROM` は最初のシードです）：

```bash
FUZZ_SEEDS=300 FUZZ_STEPS=100 npx vitest run tests/fuzz.test.ts
```

## エクスポートを信頼できる理由

- **差分テスト。** `tests/spine-parity.test.ts` は、あえて意地の悪いリグ（すべての継承モード、シアー、IK、トランスフォーム・パス・物理演算のコンストレイント、ウェイト付きメッシュ、デフォーメーション、スキン、ランダムな描画順）をエクスポートし、公式の `@esotericsoftware/spine-core@4.3` で読み込んで、すべてのボーンのワールド行列、メッシュの頂点、色、アタッチメント、描画順を、数十の時点で独自のソルバーと比較します。ミュータントテストによって、どんなずれも検出されることを確認しています。
- **ランダムセッション。** `tests/fuzz.test.ts` は、実際のエディター操作のシーケンスを何百通りも実行します。各ステップの後、ドキュメントは有効でなければならず、エクスポートは公式ランタイムで読み込めなければなりません。最後にソルバー同士を比較し、「すべて元に戻す」で初期のドキュメントに、「すべてやり直す」で最終のドキュメントに戻ることを確認します。

## プロジェクトの構成

```
src/core      pure logic, no DOM: model, curves, solver (pose, IK, constraints, skinning), animation, meshes, validation, export / import
src/store     the document on immer patches (undo / redo), the UI store, the actions the UI calls
src/render    WebGL2 renderer (batches, blend modes, two-color tint, stencil clipping)
src/editor    React panels, the viewport, the dopesheet and the graph editor, hotkeys
src/player    the page a reviewer opens
tests, e2e    vitest (unit, differential, random sessions) and Playwright smoke tests
docs          architecture, the Spine comparison
```

技術スタック：TypeScript（strict）、Vite、React 19、immer、delaunator、独自の WebGL2 レンダラー。コントリビューター向けの案内は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) にあります。

## ショートカットキー

`V` 選択 · `B` ボーン · `T` `R` `S` 移動 / 回転 / 拡大縮小 · `M` メッシュ · `W` ウェイト · `I` IK · `C` クリッピング · `Tab` Setup ⇄ Animate · `Space` 再生 · `K` キー · `Ctrl+Z` / `Ctrl+Y` 元に戻す / やり直す · `Ctrl+S` / `Ctrl+O` / `Ctrl+E` 保存 / 開く / エクスポート · `F12` 設定。
ラテン文字以外のキーボード配列でも動作し、すべて Settings で変更できます。

## 未実装の機能

- クリッピングとバウンディングボックスのウェイトとデフォーメーション（頂点の移動のみ対応しています）。
- Spine 4.0 – 4.2 のバイナリファイルは読み込めません（これらのバージョンの JSON は読み込めます）。
- リアルタイムの共同編集（共有はプロジェクトファイルとレビューページで行います）。
- 予定なし：ポリゴンでのアトラスパッキング、ナインパッチ、JPG のアトラスページ、`.spine` のインポート、外部エディター向けプラグイン。

## コントリビューション

Issue とプルリクエストを歓迎します。プロジェクトファイル付きのバグ報告が最も役に立ちます。[CONTRIBUTING.md](CONTRIBUTING.md) と [SECURITY.md](SECURITY.md) を参照してください。

## 注意事項

Bone 2D は独立したプロジェクトです。Esoteric Software とは関係ありません。「Spine」は同社の製品および商標であり、ここでは Bone 2D が読み書きするファイル形式を示すためにのみ名前を挙げています。ゲームで公式の Spine ランタイムを使用する場合は、それぞれのライセンスが適用されます。

## ライセンス

[MIT](LICENSE)
