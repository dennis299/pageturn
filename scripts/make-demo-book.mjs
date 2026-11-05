// Builds docs/demo/the-lamplighters-almanac.pdf: a short original book used for README screenshots.
// It has a cover, a contents page, running headers, page numbers and three chapters.
import { mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";

const chapters = [
  {
    title: "Chapter 1: The Last Street Lamp",
    paras: [
      "Every evening at a quarter past six, Ada Fenwick climbed the iron ladder on Weaver Street and lit the last gas lamp in the city. Nobody had asked her to. The council had switched the rest of the street to electric light eleven years earlier, but they had forgotten this one, and Ada had decided that forgetting was a kind of permission.",
      "She carried a brass key, a box of long matches and a notebook with a green cloth cover. In the notebook she wrote down one thing she had noticed that day. Some days it was large: a fox asleep on the library steps. Some days it was very small: the smell of oranges in the bakery queue. She never skipped a day.",
      "People began to stop beneath the lamp to read what she had written, because she had started pinning the pages to the post. By the end of the first winter there were more pages than post, and the baker lent her a cork board.",
    ],
  },
  {
    title: "Chapter 2: A Library of Small Things",
    paras: [
      "The cork board filled by March. Ada moved the pages into a shoebox, then into a crate, and then, when the crate grew too heavy to carry, into the empty shop at the corner of Weaver Street and Mill Lane. She painted a sign that said only: Small Things, Open Evenings.",
      "Visitors were allowed to read anything and take nothing, but they could add a page of their own. A retired engine driver wrote about the exact sound a train makes when it decides to stop. A girl of nine wrote three careful pages about the colour of puddles. Ada filed them all by date, never by importance, because she did not believe she could tell which was which.",
      "On the busiest nights, the queue reached the lamp. Nobody minded waiting. It turned out that waiting under a warm light, with nothing to do but notice things, was the best preparation for reading about them.",
    ],
  },
  {
    title: "Chapter 3: When the Lamp Went Out",
    paras: [
      "In the autumn the council finally remembered the lamp. A van arrived with a ladder of its own, and a man in an orange jacket replaced the gas mantle with a bright white bulb that came on by itself at dusk.",
      "Ada watched from the shop window. She did not climb the ladder that evening, and for the first time in four years she did not know what to write in the notebook. The street was brighter than it had ever been, and somehow harder to see.",
      "The next morning there was a page pinned to the post that she had not written. It said: The lamp is new, but the noticing is ours. Underneath it, in forty different hands, people had written one thing each that they had seen on the way to work. Ada took the page inside, filed it under that day's date, and opened the shop an hour early.",
    ],
  },
];

const doc = await PDFDocument.create();
doc.setTitle("The Lamplighter's Almanac");
doc.setAuthor("Pageturn Demo");
const serif = await doc.embedFont(StandardFonts.TimesRoman);
const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
const W = 420;
const H = 600;

const wrap = (text, font, size, width) => {
  const out = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
};

// Cover and contents
let p = doc.addPage([W, H]);
p.drawText("The Lamplighter's Almanac", { x: 60, y: 360, size: 24, font: bold });
p.drawText("A short story for the Pageturn demo", { x: 60, y: 330, size: 12, font: serif });
p = doc.addPage([W, H]);
p.drawText("Contents", { x: 50, y: 520, size: 20, font: bold });
chapters.forEach((c, i) => p.drawText(`${c.title} .......... ${3 + i * 2}`, { x: 50, y: 480 - i * 20, size: 11, font: serif }));

let pageNo = 3;
for (const ch of chapters) {
  let page = doc.addPage([W, H]);
  const header = (pg) => {
    pg.drawText("THE LAMPLIGHTER'S ALMANAC", { x: 140, y: 575, size: 8, font: serif });
    pg.drawText(String(pageNo), { x: W / 2, y: 22, size: 9, font: serif });
  };
  header(page);
  let y = 520;
  page.drawText(ch.title, { x: 50, y, size: 18, font: bold });
  y -= 40;
  for (const para of ch.paras) {
    for (const line of wrap(para, serif, 11.5, W - 100)) {
      if (y < 60) {
        pageNo++;
        page = doc.addPage([W, H]);
        header(page);
        y = 540;
      }
      page.drawText(line, { x: 50, y, size: 11.5, font: serif });
      y -= 16;
    }
    y -= 10;
  }
  pageNo++;
}

mkdirSync("docs/demo", { recursive: true });
writeFileSync("docs/demo/the-lamplighters-almanac.pdf", await doc.save());
console.log("demo book written:", doc.getPageCount(), "pages");
