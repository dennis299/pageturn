// Builds tests/fixtures/sample.pdf: running header + footer page numbers, a contents page,
// two chapters with large headings, a hyphenated word, a small footnote, and one blank "scan" page.
import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFileSync } from "node:fs";

const doc = await PDFDocument.create();
doc.setTitle("The Quiet Library");
doc.setAuthor("A. Writer");
const font = await doc.embedFont(StandardFonts.TimesRoman);
const body = "The lamps were low and the shelves were long. Every book waited for someone to open it. ".repeat(6);
const lines = (text, width = 80) => {
  const out = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
};

function page(n, { heading, paras = [], scan = false, contents = false } = {}) {
  const p = doc.addPage([420, 600]);
  if (scan) return;
  p.drawText("THE QUIET LIBRARY", { x: 140, y: 575, size: 8, font });
  p.drawText(String(n), { x: 205, y: 20, size: 9, font });
  let y = 540;
  if (contents) {
    p.drawText("Contents", { x: 40, y, size: 18, font });
    y -= 30;
    for (const l of ["Chapter One .......... 3", "Chapter Two .......... 5"]) { p.drawText(l, { x: 40, y, size: 11, font }); y -= 16; }
    return;
  }
  if (heading) { p.drawText(heading, { x: 40, y, size: 20, font }); y -= 36; }
  for (const para of paras) {
    for (const l of lines(para)) { p.drawText(l, { x: 40, y, size: 11, font }); y -= 14; }
    y -= 10;
  }
  if (n === 4) p.drawText("1 A footnote about lamps.", { x: 40, y: 50, size: 7, font });
}

page(1, { paras: ["The Quiet Library"] });
page(2, { contents: true });
page(3, { heading: "Chapter One", paras: [body, "It was a remark-"] });
page(4, { paras: ["able evening in the reading room. " + body] });
page(5, { heading: "Chapter Two", paras: [body, body] });
page(6, { scan: true });
writeFileSync("tests/fixtures/sample.pdf", await doc.save());
console.log("fixture written");
