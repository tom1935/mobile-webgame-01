# CLAUDE.md

## 言語ルール
- ユーザーと会話するとき（チャットでの返答・質問・報告）は **日本語** で話す。
- それ以外（コード、コードコメント、コミットメッセージ、識別子など）は日本語に限定しない。

## プロジェクト概要
スマホ横持ち向けのビーチバレーWebゲーム（2対2、味方1人と相手2人はbot）。
グラフィックは3D（Three.js）、ゲームロジックは2D（x=コート長手方向, y=高さ）。GitHub Pagesで公開する。
- 仕様: `docs/design.md`
- イメージ資料: `docs/reference/concept-beach.webp`

## 構成のルール
- `src/sim/` は純粋なゲームロジック。Three.js・DOM・`Math.random()`・`Date.now()` を使わない（乱数は `sim/rng.ts` のシード付き）。
- `src/sim/` は Node の型除去(type stripping)で直接実行できる書き方にする: `enum`・`namespace`・コンストラクタ引数プロパティは使わない、import には `.ts` 拡張子を付け、型だけの import は `import type` を使う。

## デバッグ（スクショに頼らない）
- `node tools/sim-cli.ts --autoplay --seed 1 --frames 3600` : 4人bot対戦をヘッドレスで回してサマリを出す
- `--events` イベントログ(JSONL)、`--trace 6` 6フレームごとの座標、`--ascii 300` 300フレーム目のコート図
- `node --test tests/` : ロジックのテスト
