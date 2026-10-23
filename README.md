# www.piyamaru.app

株式会社ぴやまるのアプリ・ツール一覧サイト（GitHub Pages）。

## 構成

| パス | 内容 |
|---|---|
| `index.html` | トップ（全製品一覧）。カードは `products.json` から自動表示 |
| `products.json` | 製品データ。**リリース時はここを編集** |
| `assets/common.css` | 全ページ共通デザイン |
| `assets/products.js` | 一覧カードの描画 |
| `assets/img/products/` | 一覧用サムネ（16:9、またはアイコン） |
| `roulette/` | ポケットルーレット LP |
| `firemaru/` | firemaru LP・利用規約・マニュアル |
| `tools/` | Kitmaru（ツール本体） |
| `support/` `faq/` `policy/` | ストア登録済みURL。**移動・改名しない** |

## 新しい製品をリリースしたとき

1. アプリアイコン（正方形、512px以上推奨）を `assets/img/products/` に置く
2. `products.json` に1件追加する
3. push する

### products.json の書き方

`categories` にカテゴリ（タブ）を、`products` に製品を書きます。

```json
{
  "categories": [
    { "id": "entame", "label": "エンタメ" },
    { "id": "xr", "label": "XR" }
  ],
  "products": [
    {
      "name": "製品名",
      "icon": "/assets/img/products/xxx.png",
      "categories": ["xr"],
      "desc": "一行説明",
      "lp": "/xxx/",
      "links": [
        { "type": "appstore", "url": "https://..." }
      ]
    }
  ]
}
```

- `categories`（製品側）：上で決めたカテゴリの `id` を書く。複数指定OK（例 `["xr", "dev"]`）
- カテゴリを増やすときは `categories` に1行追加。製品が0件のカテゴリはタブに出ない
- タブの並び順は `categories` に書いた順番
- `https://www.piyamaru.app/#xr` のように、URLでカテゴリを指定して開ける
- `icon`：正方形のアプリアイコン。書かなければ仮のアイコンが出る
- `links[].type`：`appstore` / `googleplay` / `windows` / `mac` / `web`
- `status`：書いたときだけラベルが出る（例 `ベータ` / `近日公開` / `開発終了`）。通常の公開中の製品には書かない
- `"hidden": true` を付けると一覧に出さない
- 製品の並び順は `products` に書いた順番
