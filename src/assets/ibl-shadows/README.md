# IBL 環境テクスチャ

IBL環境ライティングとIBL Shadowsの検証用アセットを置く。

想定形式:

- `.hdr`
- `.env`
- `.dds`

## `yamagata-field-20181231-1137-2k.hdr`

PBRモードの既定環境ライト。Bandai Namco Studios TrueHDRIの
`YamagataField_20181231_1137`を、線形HDR値のまま16Kから2Kへ縮小した派生版である。
Babylon.jsの `HDRCubeTexture` で読み込み、harmonicsとPBR反射用プリフィルタを生成する。
表示背景とは独立しており、環境ライティングをOFFにするとsceneから一時的に外す。

- 元解像度: `16384 x 8192`
- 同梱解像度: `2048 x 1024`
- 実行時cube face: `1024 x 1024`（環境ライト・HDRI背景共通。2026-09-17に128から引き上げ）
- 元バリアント: Light Clip `Clipped`、gamut `sRGB`、Radiance RGBE（`.hdr`）
- 撮影日時: `2018-12-31 11:37`
- ホワイトバランス: `6500K`
- 単位輝度: `1000cd/m² = 1.0`
- 縮小方法: HDR線形値の `8 x 8` ボックス平均
- 元素材名義・任意クレジット: `©Bandai Namco Studios Inc.`
- ライセンス: `CC0-1.0`
- 配布元: https://www.bandainamcostudios.com/projects/truehdri/library/16878
- 加工: MMD_modoki contributors

元素材の配布ページは改変、再配布、製品への組み込みを許可し、クレジットを必須として
いない。ただし配布元の希望に従い、HDRヘッダーと `THIRD_PARTY_NOTICES.md` に任意
クレジットを記載する。

元HDR本体のRadianceヘッダーは `FORMAT` と解像度だけで、作者やライセンスを含まない。
上記の権利・撮影情報は、元素材に付属する `bandai.txt` と公式配布ページで確認した。
GPS情報も公式ページに掲載されているが、同梱派生版のヘッダーには複製していない。

再生成と検証:

```powershell
node scripts/resize-radiance-hdr.mjs local-references/hdri/009131/TrueHDRI_YamagataField_181231_1137_L1000_Clipped_sRGB.hdr src/assets/ibl-shadows/yamagata-field-20181231-1137-2k.hdr 2048
node scripts/verify-radiance-hdr.mjs src/assets/ibl-shadows/yamagata-field-20181231-1137-2k.hdr
```

元の16Kファイルは `local-references/` にのみ置き、Gitへ追加しない。

## 昼・夜の同梱プリセット（2026-09-17）

雪原と同じ `Clipped / sRGB / Radiance HDR` の原本を、線形HDR値の8×8ボックス平均で
`16384×8192`から`2048×1024`へ縮小する。露出は焼き込まない。実行時cube faceは3種とも1024。
公式ページの記載解像度と差があるため、変換では実ファイルのRadianceヘッダーを正とした。

| プリセット | 同梱ファイル | bytes | 配布元 |
| --- | --- | ---: | --- |
| 雪原 | `yamagata-field-20181231-1137-2k.hdr` | 5,736,210 | 上記 |
| 昼 | `eitai-bridge-20190111-1215-2k.hdr` | 6,527,544 | [EitaiBridge_20190111_1215](https://www.bandainamcostudios.com/projects/truehdri/library/eitaibridge_20190111_1215) |
| 夜 | `mifune-bridge-20190311-2140-2k.hdr` | 7,060,073 | [MifuneBridge_20190311_2140](https://www.bandainamcostudios.com/projects/truehdri/library/mifunebridge_20190311_2140) |

合計19,323,827 bytes、追加分13,587,617 bytes。圧縮前の素材容量であり配布ZIPの差分ではない。
昼・夜とも作者はBandai Namco Studios Inc.、ライセンスはCC0-1.0。
2026-09-17に各公式配布ページの改変・再配布・製品組込許可を確認した。
任意クレジットをHDRヘッダーと`THIRD_PARTY_NOTICES.md`に記載する。

原本SHA-256:

- Eitai: `a5c739e2c29db6a74c8e9cbb7f0b192984569ed84b8540cdc229c283822978fa`
- Mifune: `c2508f39b4626fea2d5d0ecd3b9dcb26049aa29d844741778ba571a7ceadb855`

再生成と検証（原本はGitへ追加しない）:

```powershell
node scripts/resize-radiance-hdr.mjs local-references/hdri/002131/TrueHDRI_EitaiBridge_20190111_1215_L1000_Clipped_sRGB.hdr src/assets/ibl-shadows/eitai-bridge-20190111-1215-2k.hdr 2048 EitaiBridge_20190111_1215 https://www.bandainamcostudios.com/projects/truehdri/library/eitaibridge_20190111_1215
node scripts/resize-radiance-hdr.mjs local-references/hdri/003131/TrueHDRI_MifuneBridge_20190311_2140_L1000_Clipped_sRGB.hdr src/assets/ibl-shadows/mifune-bridge-20190311-2140-2k.hdr 2048 MifuneBridge_20190311_2140 https://www.bandainamcostudios.com/projects/truehdri/library/mifunebridge_20190311_2140
node scripts/verify-radiance-hdr.mjs src/assets/ibl-shadows/eitai-bridge-20190111-1215-2k.hdr
node scripts/verify-radiance-hdr.mjs src/assets/ibl-shadows/mifune-bridge-20190311-2140-2k.hdr
```

## `white.hdr`

方向性や中立色の比較に使う手続き生成の診断用IBL。既定環境ライトには使用しない。
`scripts/generate-bundled-studio-hdr.mjs` が数式から生成する中立色のスタジオ環境である。

- 強い光源: モデル背面側（`+Z`）の広いキーライト
- 補助光: 正面側（`-Z`）の弱いフィルライト
- 輪郭光: 斜め上からの弱いサイドリム
- 写真、人物、場所、ロゴ、商標、文字情報: 含まない
- 埋め込み名義: `MMD_modoki contributors`
- 著作権表記: `Copyright (c) 2026 MMD_modoki contributors`
- ライセンス: リポジトリ本体と同じMIT License
- 生成元: `scripts/generate-bundled-studio-hdr.mjs`

再生成と検証:

```powershell
node scripts/generate-bundled-studio-hdr.mjs
node scripts/verify-radiance-hdr.mjs
```

旧 `white.hdr` はGitコミット `ea2a9fad2721569d427f5dd6388c98717af500d1`
（コミット作者名 `togechiyo`）で追加された。旧ファイルのHDRヘッダーには作者、
著作権、入手元の情報がなく、READMEにも外部由来か自作かの記録がなかったため、
第三者由来でないことを確認できなかった。現在の手続き的生成版への置換により、
この出自不明点を解消した。

このフォルダのアセットは実験用として扱う。配布可否やライセンスが不明なファイルは
コミットしないこと。
