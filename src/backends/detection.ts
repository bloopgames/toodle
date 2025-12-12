import type { BackendType } from "./IRenderBackend";

/**
 * Detect the best available rendering backend.
 *
 * Tries WebGPU first (better performance), falls back to WebGL 2.
 */
export async function detectBackend(): Promise<BackendType> {
  // Check for WebGPU support
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        return "webgpu";
      }
    } catch {
      // WebGPU initialization failed, fall back to WebGL
    }
  }

  return "webgl2";
}

/**
 * Check if WebGPU is available in the current environment.
 */
export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/**
 * Check if WebGL 2 is available in the current environment.
 */
export function isWebGL2Available(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    return gl !== null;
  } catch {
    return false;
  }
}
