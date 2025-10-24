import { Toodle, Colors } from "@bloop.gg/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, { filter: "linear" });


toodle.startFrame();
toodle.draw(toodle.shapes.Circle({
  idealSize: { width: 100, height: 100 },
  color: Colors.web.cornflowerBlue,
}));
toodle.endFrame();
