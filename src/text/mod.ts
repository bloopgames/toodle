// references:
// https://tchayen.com/drawing-text-in-webgpu-using-just-the-font-file
// https://github.com/Chlumsky/msdfgen/issues/22#issuecomment-234958005
// https://github.com/pixijs/pixijs/blob/dev/src/scene/text-bitmap/utils/getBitmapTextLayout.ts#L20

// TextShader has moved to backends/webgpu for backend-specific implementation
export { WebGPUTextShader as TextShader } from "../backends/webgpu/WebGPUTextShader";
// TextNode has moved to scene folder for backend-agnostic design
export { TextNode, type TextOptions } from "../scene/TextNode";
