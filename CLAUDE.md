# CLAUDE.md

## 言語ルール
- ユーザーと会話するとき（チャットでの返答・質問・報告）は **日本語** で話す。
- それ以外（コード、コードコメント、コミットメッセージ、識別子など）は日本語に限定しない。

## プロジェクト概要
スマホ横持ち向けのビーチバレーWebゲーム（2対2、味方1人と相手2人はbot）。
グラフィックは3D（Three.js）、ゲームロジックは2D（x=コート長手方向, y=高さ）。GitHub Pagesで公開する。
- 仕様: `docs/design.md`
- イメージ資料: `docs/reference/concept-beach.webp`

## 見た目・素材のルール（ユーザー指示）
- 目標は `docs/reference/concept-beach.webp` くらい綺麗な背景と、リッチなライティング。
- **素材で作れる部分は素材を使い、自作しない**（空・砂に限らず、テクスチャ・モデル全般）。手続き生成のテクスチャや、プリミティブを組み合わせたモデルで代用しない。
- 素材はCC0を優先し、出典とライセンスを `assets/CREDITS.md`（取得スクリプト経由のものは `assets/manifest.json`）に記録する。
- キャラは参考画像に合う素材が決まるまで **カプセル1つ** で仮置き。カプセルを組み合わせてキャラを作らない。頭身の違う素材（例: Kenney Mini Characters）はアニメも流用できないので使わない。
- 素材のサイトにつながらない時は、代用品で埋めずにユーザーに許可すべきドメインを伝える。

## 作業の進め方（ユーザー指示）
- 調べてから作る。知らないことを知っているように書かない（調べていないなら、そう言う）
- 変更ができたら、まず main にマージして、ユーザーが触れる状態にする（ユーザーが自分で素材を加工・確認するため）
- 見た目の調整は `tools/ref-compare.mjs` の数値で行う。画像を読むのは確認の最小限にする（画像は利用枠を多く使う）
- 測定などの処理はその場で書き捨てず、ツールに入れて使い回す
- 数値の調整をユーザーにさせない。調整値の意味を説明するより、合わせて結果を見せる

## 構成のルール
- `src/sim/` は純粋なゲームロジック。Three.js・DOM・`Math.random()`・`Date.now()` を使わない（乱数は `sim/rng.ts` のシード付き）。
- `src/sim/` は Node の型除去(type stripping)で直接実行できる書き方にする: `enum`・`namespace`・コンストラクタ引数プロパティは使わない、import には `.ts` 拡張子を付け、型だけの import は `import type` を使う。

## デバッグ（スクショに頼らない）
- `node tools/sim-cli.ts --autoplay --matches 20` : 4人bot対戦をヘッドレスで回して統計を出す
- `--virtual-human` : 自キャラをタッチ相当のコマンドだけで操作するbot（操作系の検証用）
- `--events` イベントログ(JSONL)、`--trace 6` 6フレームごとの座標、`--ascii 300` 300フレーム目のコート図、`--ascii-on hit` 打球ごとのコート図
- `npm test`（= `node --test "tests/*.test.ts"`）: ロジック・ジェスチャのテスト
- `npm run e2e` : スマホ横向きChromiumに実タッチを送り `window.__game` で結果を確認（グローバルの tsc / playwright を使用）。既定は3D表示（低画質）、`node tests-e2e/play.mjs --2d` で2D表示
- ブラウザで `window.__game.renderInfo()` : 表示モード・画質・FPS・素材の読み込み状況
- `node tools/ref-compare.mjs`（`--quality high` も可）: 参考画像と同じカメラ（`?scene=ref`）で描画し、`.ref-compare/` に並べた図・重ねた図・白黒の図を出す。背景づくりはこれで参考画像と比べながら進める
- ブラウザで `?debug=1` : 座標オーバーレイと `window.__game`（getState / step / input / getLog / ascii / probe / exportReplay）
- 調整値は `src/sim/params.ts` の `P`（実行時に変更可）。ブラウザは `?tune=1` のスライダー、CLIは `--param KEY=VAL`。値は使う時に `P.X` で読む（モジュール定数にコピーしない）
- 長いログを読む調査はサブエージェントに任せ、結論だけ受け取る
