import { Toodle } from "../src/Toodle";
import { createCanvas } from "./util";

async function main() {
	const toodle = await Toodle.attach(
		createCanvas(window.innerWidth, window.innerHeight),
		{
			filter: 'linear'
		}
	);

	await toodle.assets.registerBundle("train_day", {
		atlases: [
			{
				json: new URL("stage_full_train_day-0.json", import.meta.url),
				png: new URL("stage_full_train_day-0.png", import.meta.url),
			},
		],
	});

	const shader = toodle.QuadShader('bg paint', 2,
		/*wgsl*/ `
@fragment
fn frag(vertex: VertexOutput) -> @location(0) vec4f {
  let color = default_fragment_shader(vertex, linearSampler);

	if (color.a == 0.0) {
		return vec4f(0.5, 0.5, 0.5, 1.0);
	}
  return color;
}
  `)

	const lightShader = toodle.QuadShader('light paint', 2,
		/*wgsl*/ `
@fragment
fn frag(vertex: VertexOutput) -> @location(0) vec4f {
	let color = default_fragment_shader(vertex, linearSampler);

	// if (color.a < 0.7) {
	// 	discard;
	// }

	// return vec4f(color.rgb, step(0.99, color.a));

	return color;
}`)


	// toodle.clearColor = { r: 1, g: 0, b: 1, a: 1 };

	const spriteId =
		"stages/train_day/shc_train_daytime_main_tunnel_greenlight.png";

	console.log(toodle.assets.bundles.textureIds);

	// Let the engine derive cropOffset/region from the atlas naturally
	const quad = toodle.Quad(spriteId, {
		// size: {
		// 	width: 3696.6000000000004,
		// 	height: 1801.2368055555553,
		// },
		shader: lightShader,
	});

	quad.scale = 2;

	console.log("quad size:", quad.size);
	console.log("quad cropOffset:", quad.cropOffset);
	console.log("quad region:", quad.region);

	function frame() {
		toodle.startFrame();
		toodle.draw(toodle.Quad("stages/train_day/shc_train_daytime_test_main.png", {shader}))
		toodle.draw(quad);

		toodle.endFrame();
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);

	toodle.camera.x =
1317.9858789909215;
	toodle.camera.y =
-464.02824201815724;
	toodle.camera.zoom = 5.559917313492232;

	window.addEventListener("keydown", (e) => {
		switch (e.key) {
			case "i":
				toodle.camera.y += 100 / toodle.camera.zoom;
				break;
			case "k":
				toodle.camera.y -= 100 / toodle.camera.zoom;
				break;
			case "j":
				toodle.camera.x -= 100 / toodle.camera.zoom;
				break;
			case "l":
				toodle.camera.x += 100 / toodle.camera.zoom;
				break;
			case "u":
				toodle.camera.rotation -= 1;
				break;
			case "o":
				toodle.camera.rotation += 1;
				break;
			case "-":
				toodle.camera.zoom -= 0.1 * toodle.camera.zoom;
				break;
			case "=":
				toodle.camera.zoom += 0.1 * toodle.camera.zoom;
				break;
			default: return;
		}

		console.log({camera: toodle.camera});
	});
}

main();

