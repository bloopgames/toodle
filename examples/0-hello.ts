import { Toodle } from "../src/Toodle";
import { createCanvas } from "./util";

const canvas = createCanvas(window.innerWidth, window.innerHeight);

const toodle = await Toodle.attach(canvas);

toodle.startFrame()
toodle.draw(toodle.shapes.Circle({
  idealSize: { width: 100, height: 100 },
  color: { r: 1, g: 0, b: 0, a: 1 }
}))
toodle.endFrame();