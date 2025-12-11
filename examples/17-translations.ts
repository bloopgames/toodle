import { Toodle } from "../src/Toodle";
import { createCanvas, Palette } from "./util";

const canvas = createCanvas(window.innerWidth, window.innerHeight);

const toodle = await Toodle.attach(canvas, { filter: "nearest" });


const fontId = await toodle.assets.loadFont(
  "roboto",
  // new URL("/fonts/ComicNeue-Regular-msdf.json", window.location.href),
  new URL("/fonts/RobotoMono-msdf.json", "https://toodle.gg"),
);

const fontSize = 22;
const fontSize2 = 26.712;
const text = toodle.Text(
  'roboto',
  'Hello, こんにちは, مرحبا, שלום, नमस्ते, Здравствуйте, 你好, 안녕하세요',
  {
    color: Palette.BLACK,
    fontSize,
  }
)

const regression = toodle.Text('roboto', 'The Book', {
  align: "center",
  // size: {width: 138.33333333333334, height: 667.8},
  position: {x: -88.57499999999999, y: -152.79099999999994},
  // fontSize: fontSize2,
  color: Palette.BLACK,
  // x: 374.925,
  // y: 564.2909999999999,
})


const div = document.createElement('div');
div.style.position = 'absolute';
div.innerText = text.text;
document.body.appendChild(div);

const div2 = document.createElement('div');
div2.style.position = 'absolute';
div2.innerText = regression.text;
document.body.appendChild(div2);

console.log(regression.bounds);

let useHtml = false;

function frame() {
  toodle.startFrame();
  text.x = Math.sin(performance.now() / 1000) * 100;
  text.y = Math.cos(performance.now() / 1000) * 100;
  // text.scale = 1 + Math.sin(performance.now() / 1000) * 0.5;
  if (useHtml) {
    const topLeft = toodle.convertSpace({x: text.bounds.left, y: text.bounds.top}, {
      from: 'world',
      to: 'screen'
    })
    div.style.left = `${topLeft.x}px`;
    div.style.top = `${topLeft.y}px`;
    div.style.fontSize = `${fontSize}px`
    div.style.display = 'block';

    {
      const topLeft = toodle.convertSpace({x: regression.bounds.left, y: regression.bounds.top}, {
        from: 'world',
        to: 'screen'
      })
      div2.style.left = `${topLeft.x}px`;
      div2.style.top = `${topLeft.y}px`;
      div2.style.fontSize = `${fontSize2}px`
      div2.style.display = 'block';
    }
  } else {
    div.style.display = 'none';
    div2.style.display = 'none';
    toodle.draw(text);
    toodle.draw(regression);
  }
  toodle.endFrame();

  requestAnimationFrame(frame);
}

const button = document.body.appendChild(document.createElement('button'));
button.innerText = 'Toodle / HTML';
button.onclick = () => {
  useHtml = !useHtml;
}

frame()