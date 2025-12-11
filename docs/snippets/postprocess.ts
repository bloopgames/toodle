import { Toodle, Colors, Backends } from "@bloopjs/toodle";

const canvas = document.querySelector("canvas")!;
const toodle = await Toodle.attach(canvas, { filter: "linear" });

if (!(toodle.backend instanceof Backends.WebGPUBackend)) {
  throw new Error("Post-processing requires WebGPU backend");
}

const device = toodle.backend.device;
const presentationFormat = toodle.backend.presentationFormat;

const pipeline = device.createRenderPipeline({
  label: "color inversion pipeline",
  layout: "auto",
  primitive: { topology: "triangle-strip" },
  vertex: {
    module: Backends.PostProcessDefaults.vertexShader(device),
  },
  fragment: {
    targets: [{ format: presentationFormat }],
    module: device.createShaderModule({
      label: "color inversion fragment shader",
      code: /*wgsl*/ `
        @group(0) @binding(0) var inputTex: texture_2d<f32>;
        @group(0) @binding(1) var inputSampler: sampler;

        @fragment
        fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
          let color = textureSample(inputTex, inputSampler, uv);
          return vec4f(1.0 - color.rgb, color.a);
        }
      `,
    }),
  },
});

// Create a simple color inversion post-process effect
const postprocess: Backends.PostProcess = {
  process(queue, encoder, pingpong, screen) {
    const renderPass = encoder.beginRenderPass({
      label: "invert colors render pass",
      colorAttachments: [
        {
          view: screen.createView(),
          clearValue: Colors.web.black,
          loadOp: "clear" as const,
          storeOp: "store" as const,
        },
      ],
    });

    const sampler = Backends.PostProcessDefaults.sampler(device);

    const bindGroup = device.createBindGroup({
      label: "color inversion bind group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: pingpong[0].createView() },
        { binding: 1, resource: sampler },
      ],
    });

    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(4);
    renderPass.end();
  }
};

(function frame() {
  toodle.startFrame();

  // Draw a moving circle
  toodle.draw(toodle.shapes.Circle({
    size: { width: 100, height: 100 },
    color: Colors.web.cornflowerBlue,
    position: {
      x: Math.sin(performance.now() / 1000) * 150,
      y: Math.cos(performance.now() / 1000) * 150
    },
  }));

  // Toggle post-process effect every 2 seconds or so
  if (toodle.diagnostics.frames % 240 > 120) {
    toodle.postprocess = postprocess;
  } else {
    toodle.postprocess = null;
  }

  toodle.endFrame();
  requestAnimationFrame(frame);
})();