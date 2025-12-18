import { Toodle } from "../src/Toodle";
import type { TextNode } from "../src/scene/TextNode";
import { createCanvas, getRandomWords } from "./util";

const words = await getRandomWords();

const canvas = createCanvas(600, 600);
const toodle = await Toodle.attach(canvas);

await toodle.assets.loadFont(
  "ComicNeue",
  new URL("/fonts/ComicNeue-Regular-msdf.json", window.location.href),
);

const texts: TextNode[] = [];

for (let i = 0; i < 2048; i++) {
  const textNode = toodle.Text(
    "ComicNeue",
    words[Math.floor(Math.random() * words.length)],
    {
      fontSize: 8,
    },
  );
  textNode.position = {
    x: -300 + Math.random() * 600,
    y: -300 + Math.random() * 600,
  };

  texts.push(textNode);
}

toodle.clearColor = { r: 0.5, g: 0.5, b: 0.5, a: 1 };

function frame() {
  if (toodle.frameCount % 10 === 0) {
    for (const text of texts) {
      text.text = words[Math.floor(Math.random() * words.length)];
    }
  }

  toodle.startFrame();
  for (const text of texts) {
    toodle.draw(text);
  }
  toodle.endFrame();
  requestAnimationFrame(frame);
}

frame();
