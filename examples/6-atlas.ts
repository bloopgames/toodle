import { Toodle } from "../src/Toodle";
import { createCanvas } from "./util";

async function main() {
  const loadingImage = new Image();
  loadingImage.src =
    "https://i0.wp.com/www.printmag.com/wp-content/uploads/2021/02/4cbe8d_f1ed2800a49649848102c68fc5a66e53mv2.gif";
  document.body.appendChild(loadingImage);

  const toodle = await Toodle.attach(
    createCanvas(window.innerWidth, window.innerHeight),
    { filter: "nearest" },
  );

  console.time("load images");
  const produceTextures = {
    ItemApple: new URL("img/ItemApple.png", "https://toodle.gg"),
    ItemBanana: new URL("img/ItemBanana.png", "https://toodle.gg"),
    ItemBroccoli: new URL("img/ItemBroccoli.png", "https://toodle.gg"),
    ItemCherry: new URL("img/ItemCherry.png", "https://toodle.gg"),
    ItemKiwi: new URL("img/ItemKiwi.png", "https://toodle.gg"),
    ItemLemon: new URL("img/ItemLemon.png", "https://toodle.gg"),
    ItemOnion: new URL("img/ItemOnion.png", "https://toodle.gg"),
    ItemPea: new URL("img/ItemPea.png", "https://toodle.gg"),
    ItemPeach: new URL("img/ItemPeach.png", "https://toodle.gg"),
    ItemPumpkin: new URL("img/ItemPumpkin.png", "https://toodle.gg"),
    ItemRadish: new URL("img/ItemRadish.png", "https://toodle.gg"),
    ItemSpinach: new URL("img/ItemSpinach.png", "https://toodle.gg"),
    ItemTomato: new URL("img/ItemTomato.png", "https://toodle.gg"),
  };

  const pantryTextures = {
    ItemBaguette: new URL("img/ItemBaguette.png", "https://toodle.gg"),
    ItemCheese: new URL("img/ItemCheese.png", "https://toodle.gg"),
    ItemCoffee: new URL("img/ItemCoffee.png", "https://toodle.gg"),
    ItemButterscotchCinnamonPie: new URL(
      "img/ItemButterscotchCinnamonPie.png",
      "https://toodle.gg",
    ),
    ItemChilidog: new URL("img/ItemChilidog.png", "https://toodle.gg"),
    ItemSeaSaltIceCream: new URL(
      "img/ItemSeaSaltIceCream.png",
      "https://toodle.gg",
    ),
    ItemTurkeyLeg: new URL("img/ItemTurkeyLeg.png", "https://toodle.gg"),
  };

  await toodle.assets.registerBundle("produce", { textures: produceTextures });
  await toodle.assets.registerBundle("pantry", { textures: pantryTextures });

  await toodle.assets.registerBundle("produceTransparency", {
    textures: produceTextures,
  });
  await toodle.assets.registerBundle("pantryTransparency", {
    textures: pantryTextures,
  });

  await toodle.assets.loadBundle("produce");
  await toodle.assets.loadBundle("pantry");

  await toodle.assets.loadBundle("produceTransparency");
  await toodle.assets.loadBundle("pantryTransparency");

  const shader = toodle.QuadShader(
    "texture atlas viewer",
    toodle.limits.instanceCount,
    /*wgsl*/ `
  @vertex
  fn vert(
    @builtin(vertex_index) VertexIndex: u32,
    @builtin(instance_index) InstanceIndex: u32,
    instance: InstanceData,
  ) -> VertexOutput {
    var output = default_vertex_shader(VertexIndex, InstanceIndex, instance);
    //
    output.engine_uv.x = output.engine_uv.z;
    output.engine_uv.y = output.engine_uv.w;

    output.engine_atlasIndex = InstanceIndex;
    return output;
  }

  @fragment
  fn fragment(vertex: VertexOutput) -> @location(0) vec4<f32> {
    let color = default_fragment_shader(vertex, nearestSampler);
    if (color.a == 0.0) {
        return vec4f(1.0, 0.0, 1.0, 1.0);
    }
    return color;
    // return color;
  }
  `,
  );

  loadingImage.remove();

  toodle.clearColor = { r: 0.5, g: 0.5, b: 0.5, a: 1 };

  let frameNumber = 0;
  await toodle.assets.loadFont(
    "ComicNeue",
    new URL("https://toodle.gg/fonts/ComicNeue-Regular-msdf.json"),
  );
  function frame() {
    toodle.startFrame();
    frameNumber++;

    toodle.draw(
      toodle.Quad("ItemApple", {
        size: { width: 300, height: 300 },
        position: { x: -300, y: 10 },
        shader,
      }),
    );
    toodle.draw(
      toodle.Quad("ItemBaguette", {
        size: { width: 300, height: 300 },
        position: {
          x: 300,
          y: 10,
        },
        shader,
      }),
    );
    toodle.draw(
      toodle.Quad("ItemApple", {
        size: { width: 300, height: 300 },
        position: { x: -300, y: -310 },
        shader,
      }),
    );

    toodle.draw(
      toodle.Quad("ItemBaguette", {
        size: { width: 300, height: 300 },
        position: {
          x: 300,
          y: -310,
        },
        shader,
      }),
    );

    toodle.draw(
      toodle.Text("ComicNeue", "Transparency Scraped = True", {
        position: { x: 300, y: -500 },
      }),
    );

    toodle.draw(
      toodle.Text("ComicNeue", "Transparency Scraped = True", {
        position: { x: -300, y: -500 },
      }),
    );

    const usage = toodle.assets.extra.getAtlasUsage();
    toodle.draw(
      toodle.Text("ComicNeue", `Atlases ${usage.used} / ${usage.available}`),
    );
    toodle.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
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
    }
  });
}

main();
