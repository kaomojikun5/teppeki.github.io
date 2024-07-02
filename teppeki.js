// SPDX-License-Identifier: MIT
// (c) 2024 kaomojikun

"use strict";

const fs = require("fs");
const MersenneTwister = new require("mersenne-twister");
const tabletojson = require("tabletojson").Tabletojson;
const PDFDocument = require("pdfkit-table");

const clamp = (v, low, high) => Math.min(Math.max(v, low), high);
const minmax = (x, y) => [Math.min(x, y), Math.max(x, y)];

const FONT_TTF = __dirname + "/font.ttf";
const TEPPEKI_JSON = __dirname + "/teppeki.json";

(async (
  pdf = "./exam.pdf",
  left = Infinity,
  right = 1,
  num = 30,
  seed = null
) => {
  const teppeki = await (async (cache) => {
    try {
      return JSON.parse(await cache);
    } catch (e) {
      const URL = "https://ukaru-eigo.com/teppeki-word-list/";
      console.log("鉄壁データを ${URL} からダウンロード中...");
      const teppeki = (await tabletojson.convertUrl(URL))[0].map((word) => ({
        id: parseInt(word["番号"]),
        en: word["英単語"],
        jp: word["意味"],
      }));
      await fs.promises.writeFile(
        TEPPEKI_JSON,
        JSON.stringify(teppeki, null, 2) + "\n",
        "UTF8"
      );
      return teppeki;
    }
  })(fs.promises.readFile(TEPPEKI_JSON, "UTF8"));

  const [l, r] = minmax(
    clamp(new Number(left), 1, teppeki.length),
    clamp(new Number(right), 1, teppeki.length)
  );
  const n = clamp(new Number(num), 1, r - l + 1);
  const s = parseInt(seed, 16) || Math.floor(Math.random() * 2 ** 16);
  const title = `鉄壁テスト ${l}~${r} (SEED:${s
    .toString(16)
    .toUpperCase()
    .padStart(4, "0")})`;
  const mt19937 = new MersenneTwister(s);

  console.log(`\n${title} (${n * 2} 点満点)`);
  const words = teppeki
    .map((word) => ({ ...word, r: mt19937.random() }))
    .slice(l - 1, r)
    .sort((a, b) => a.r - b.r)
    .slice(0, n);
  const tables = {
    en2jp: words.map(({ id, en, jp }) => [id, en, "　".repeat(jp.length)]),
    jp2en: words.map(({ id, en, jp }) => [id, `(${en[0]})`, jp]),
    answer: words.map(({ id, en, jp }) => [id, en, jp]),
  };
  console.table(tables.answer);

  console.log("\nPDF 出力中...");
  const doc = new PDFDocument({ margin: 16, size: "A4" });
  doc.pipe(fs.createWriteStream(pdf));
  let pageLeft = true;
  for (const name in tables) {
    if (!pageLeft) doc.addPage();
    doc
      .font(FONT_TTF)
      .fontSize(16)
      .text(
        `\n${title}【${
          { en2jp: `和訳編`, jp2en: `英訳編`, answer: `解答編` }[name]
        }】`,
        { align: "center" }
      );
    doc
      .fontSize(12)
      .text(`${name === "answer" ? n * 2 : ""}/${n * 2}`, { align: "right" });
    const wordAlign = name === "jp2en" ? "left" : "center";
    const headerCommon = { valign: "center", headerColor: "white" };
    await doc.table(
      {
        headers: [
          { label: "番号", width: 30, align: "right", ...headerCommon },
          { label: "英単語", width: 100, align: wordAlign, ...headerCommon },
          { label: "意味", width: 150, align: "left", ...headerCommon },
          { label: "番号", width: 30, align: "right", ...headerCommon },
          { label: "英単語", width: 100, align: wordAlign, ...headerCommon },
          { label: "意味", width: 150, align: "left", ...headerCommon },
        ],
        rows: tables[name]
          .reduce(
            (rows, row) =>
              rows.length === 0 || rows.at(-1).length >= 6
                ? [...rows, row]
                : [...rows.slice(0, rows.length - 1), [...rows.at(-1), ...row]],
            []
          )
          .map((row) => [...row, ...new Array(6 - row.length)]),
      },
      {
        divider: {
          header: { disabled: false, width: 1, opacity: 1.0 },
          horizontal: { disabled: false, width: 0.5, opacity: 1.0 },
          vertical: { disabled: false, width: 0.25, opacity: 1.0 },
        },
        padding: 4,
        minRowHeight: clamp(500 / Math.ceil(tables[name].length / 2), 20, 45),
        prepareHeader: () => doc.fontSize(10),
        prepareRow: (_row, i, _j, _rectRow, { x, y, width, height }) => {
          (i === 0 ? [0, width] : [width]).forEach((dx) =>
            doc
              .lineWidth(0.5)
              .moveTo(x + dx, y)
              .lineTo(x + dx, y + height)
              .stroke()
          );
          doc.fontSize(i % 3 === 1 ? 10 : 8);
        },
      }
    );
    pageLeft = false;
  }
  doc.end();
  console.log("PDF 出力完了！");
})(...process.argv.slice(2)).catch(console.error);