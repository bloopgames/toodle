import { WgslReflect } from "wgsl_reflect";
import type { SceneNode } from "../scene/SceneNode";
import type { EngineUniform } from "../shaders/EngineUniform";
import type { IShader } from "../shaders/IShader";
import type { FontPipeline } from "./FontPipeline";
import type { MsdfFont } from "./MsdfFont";
import { findLargestFontSize, measureText, shapeText } from "./shaping";
import { DEFAULT_FONT_SIZE, TextNode } from "./TextNode";
import msdfShader from "./text.wgsl";

const deets = new WgslReflect(msdfShader);
const struct = deets.structs.find((s) => s.name === "TextBlockDescriptor");
if (!struct) {
  throw new Error("FormattedText struct not found");
}
const textDescriptorInstanceSize = struct.size;

export class TextShader implements IShader {
  #device: GPUDevice;
  #pipeline: GPURenderPipeline;
  #bindGroups: GPUBindGroup[] = [];
  #font: MsdfFont;
  #maxCharCount: number;
  #engineUniformsBuffer: GPUBuffer;
  #descriptorBuffer: GPUBuffer;
  #textBlockBuffer: GPUBuffer;
  #cpuDescriptorBuffer: Float32Array;
  #cpuTextBlockBuffer: Float32Array;
  #instanceIndex = 0;
  #textBlockOffset = 0;

  constructor(
    device: GPUDevice,
    pipeline: FontPipeline,
    font: MsdfFont,
    colorFormat: GPUTextureFormat,
    instanceCount: number,
  ) {
    this.#device = device;
    this.#font = font;
    this.#pipeline = pipeline.pipeline;
    this.#maxCharCount = pipeline.maxCharCount;

    this.#descriptorBuffer = device.createBuffer({
      label: "msdf text descriptor buffer",
      size: textDescriptorInstanceSize * instanceCount,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.#cpuDescriptorBuffer = new Float32Array(
      (instanceCount * textDescriptorInstanceSize) /
        Float32Array.BYTES_PER_ELEMENT,
    );

    this.#cpuTextBlockBuffer = new Float32Array(
      instanceCount * this.maxCharCount * 4,
    );

    this.#engineUniformsBuffer = device.createBuffer({
      label: "msdf view projection matrix",
      size: Float32Array.BYTES_PER_ELEMENT * 12,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.#textBlockBuffer = device.createBuffer({
      label: "msdf text buffer",
      size:
        instanceCount * this.maxCharCount * 4 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // create uniform bind groups
    this.#bindGroups.push(pipeline.fontBindGroup);

    this.#bindGroups.push(
      device.createBindGroup({
        label: "msdf text bind group",
        layout: pipeline.pipeline.getBindGroupLayout(1),
        entries: [
          {
            binding: 0,
            resource: { buffer: this.#descriptorBuffer },
          },
          {
            binding: 1,
            resource: { buffer: this.#textBlockBuffer },
          },
        ],
      }),
    );

    const engineUniformsBindGroup = device.createBindGroup({
      label: "msdf text uniforms bind group",
      layout: pipeline.pipeline.getBindGroupLayout(2),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.#engineUniformsBuffer },
        },
      ],
    });
    this.#bindGroups.push(engineUniformsBindGroup);
  }

  startFrame(device: GPUDevice, uniform: EngineUniform): void {
    device.queue.writeBuffer(
      this.#engineUniformsBuffer,
      0,
      uniform.viewProjectionMatrix as Float32Array,
    );
    this.#instanceIndex = 0;
    this.#textBlockOffset = 0;
  }

  processBatch(renderPass: GPURenderPassEncoder, nodes: SceneNode[]): number {
    if (nodes.length === 0) return 0;

    renderPass.setPipeline(this.#pipeline);
    for (let i = 0; i < this.#bindGroups.length; i++) {
      renderPass.setBindGroup(i, this.#bindGroups[i]);
    }

    for (const node of nodes) {
      if (!(node instanceof TextNode)) {
        console.error(node);
        throw new Error(
          `Tried to use TextShader on something that isn't a TextNode: ${node}`,
        );
      }
      const text = node.text;
      const formatting = node.formatting;
      const measurements = measureText(this.#font, text, formatting.wordWrap);

      const textBlockSize = 4 * text.length;

      // Calculate the buffer offset to get the current TextBlockDescriptor
      const textDescriptorOffset =
        (this.#instanceIndex * textDescriptorInstanceSize) /
        Float32Array.BYTES_PER_ELEMENT;

      // Shape text and pack to the buffer...
      this.#cpuDescriptorBuffer.set(node.matrix, textDescriptorOffset);

      // Color
      this.#cpuDescriptorBuffer.set(
        [node.tint.r, node.tint.g, node.tint.b, node.tint.a],
        textDescriptorOffset + 12,
      );

      // Font Size
      const size = node.size ?? measurements;
      const fontSize = formatting.shrinkToFit
        ? findLargestFontSize(this.#font, text, size, formatting)
        : formatting.fontSize;
      const actualFontSize = fontSize || DEFAULT_FONT_SIZE;
      this.#cpuDescriptorBuffer[textDescriptorOffset + 16] = actualFontSize;

      // Alignment and dimensions
      this.#cpuDescriptorBuffer[textDescriptorOffset + 17] =
        formatting.align === "center" ? 0 : measurements.width;
      this.#cpuDescriptorBuffer[textDescriptorOffset + 18] =
        measurements.height;

      // Text block buffer offset
      // the shader at text.wgsl.ts is expecting an index into the text block buffer,
      // which is an array<vec4f> hence the division by 4
      this.#cpuDescriptorBuffer[textDescriptorOffset + 19] =
        this.#textBlockOffset / 4;

      shapeText(
        this.#font,
        text,
        size,
        actualFontSize,
        formatting,
        this.#cpuTextBlockBuffer,
        this.#textBlockOffset,
      );

      // Write instance data
      this.#device.queue.writeBuffer(
        this.#descriptorBuffer,
        textDescriptorOffset * Float32Array.BYTES_PER_ELEMENT,
        this.#cpuDescriptorBuffer,
        textDescriptorOffset,
        textDescriptorInstanceSize / Float32Array.BYTES_PER_ELEMENT,
      );

      this.#device.queue.writeBuffer(
        this.#textBlockBuffer,
        this.#textBlockOffset * Float32Array.BYTES_PER_ELEMENT,
        this.#cpuTextBlockBuffer,
        this.#textBlockOffset,
        textBlockSize,
      );

      this.#textBlockOffset += textBlockSize;

      // Draw text
      renderPass.draw(
        4,
        measurements.printedCharCount,
        4 * this.#instanceIndex,
        0,
      );
      this.#instanceIndex++;
    }

    return nodes.length;
  }

  endFrame(): void {
    // No cleanup needed
  }

  get font() {
    return this.#font;
  }

  get maxCharCount() {
    return this.#maxCharCount;
  }
}
