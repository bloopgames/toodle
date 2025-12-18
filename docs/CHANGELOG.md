# Changelog

A detailed list of all notable changes for every released version.

[All releases](https://www.npmjs.com/package/@bloopjs/toodle)

## [0.1.3](https://github.com/bloopgames/toodle/releases/tag/0.1.3)

- Make `TextNode` backend-agnostic, you can now use `toodle.Text` with both WebGPU and WebGL2 backends to measure text positioning. Rendering with webgl2 will throw.
- **Breaking** `import {TextNode} from @bloopjs/toodle` instead of `Text.TextNode`

## [0.1.2](https://github.com/bloopgames/toodle/releases/tag/0.1.2)

- **Breaking**: Remove `fflate` dependency and `loadZip` utility function. If you were using `loadZip`, you can use the browser's native `DecompressionStream` API or install `fflate` directly in your project.

## [0.1.0](https://github.com/bloopgames/toodle/releases/tag/0.1.0)

Add **WebGL2 fallback renderer** for browsers without WebGPU support. Use `backend: "webgl2"` in the options passed to `Toodle.attach()`:

```ts
const toodle = await Toodle.attach(canvas, {
  backend: "webgl2", // or "webgpu" (default)
});
```

Note: WebGL2 fallback is not as performant as WebGPU and does not have feature parity. Currently supported features:

- Quad rendering with default or custom fragment shader
- Shape rendering
- Batched / instanced rendering
- Layout / screen space
- Registering + loading pre-baked texture atlases

Unsupported features:

- Text rendering / font loading
- Custom vertex shaders
- Post-processing
- Runtime packing of textures into an atlas, loading textures individually

* Introduce `IBackendShader` and `IRenderBackend` interfaces to support multiple rendering backends
* **Breaking**: GPUDevice and other WebGpu-specific accessors are no longer available on toodle.extra.device() and toodle.debug.device, instead use `(toodle.backend as Backends.WebGpuBackend).device` to get the GPUDevice, presentation format, render pass etc.
* **Breaking** AssetManager signature has changed. If you are using `AssetManager` directly instead of just toodle.assets, you'll need to update to use the new `AssetManagerOptions`

## [0.0.104](https://github.com/bloopgames/toodle/releases/tag/0.0.104)

- **Breaking**: `shapes.Circle()` now takes a `radius` parameter instead of using `scale` for sizing. A circle with `radius: 50` has diameter 100. You can still apply `scale` on top of the radius-based size.
  ```ts
  // before
  toodle.shapes.Circle({ scale: { x: 100, y: 100 } }); // 100px diameter circle
  // after
  toodle.shapes.Circle({ radius: 50 }); // 100px diameter circle (radius defaults to 50)
  ```
- **Breaking**: `idealSize` renamed to `size` throughout the API (`NodeOptions.size`, `QuadOptions.size`, etc.)
  ```ts
  // before
  toodle.Quad("texture", { idealSize: { width: 100, height: 100 } });
  // after
  toodle.Quad("texture", { size: { width: 100, height: 100 } });
  ```
- **Breaking**: `autoLoad` now defaults to `true` for bundle registration. Bundles are loaded to the GPU immediately after registration unless you specify `autoLoad: false`.
  ```ts
  // before - had to explicitly load
  await toodle.assets.registerBundle("sprites", { textures });
  await toodle.assets.loadBundle("sprites");
  // after - auto-loads by default
  await toodle.assets.registerBundle("sprites", { textures });
  // or opt out with autoLoad: false
  await toodle.assets.registerBundle("sprites", { textures, autoLoad: false });
  ```

## [0.0.103](https://github.com/bloopgames/toodle/releases/tag/0.0.103)

- Add `Bundles` class for renderer-agnostic bundle registration and atlas coordinate lookups. This enables WebGL fallback paths to share bundle registration with WebGPU code.
- `AssetManager` now uses `Bundles` internally and exposes it via `assets.bundles`
- Add `AssetManagerOptions` to pass a custom `Bundles` instance or texture format to `AssetManager`
- Breaking: `AssetManager` constructor now takes an `options` object as the 4th parameter instead of a positional `format` parameter

## [0.0.100](https://github.com/bloopgames/toodle/releases/tag/0.0.100)

- Add `assetManager` option to `Toodle.Quad` and `Toodle.QuadShader`, allowing quads to use a different texture array, for eg an array of rg8 atlases.
- Expose `AssetManager` directly to allow more control over texture atlases.
- Breaking: shader constructor no longer accepts `BlendMode` as a positional argument, use the `blendMode` option in opts instead.

## [0.0.99](https://github.com/bloopgames/toodle/releases/tag/0.0.97)

- Add low level api for post-process (fullscreen) shaders, see [post-process example](https://toodle.gg/examples/post-process.html)
- Add `Colors.web` for CSS web color names to use when prototyping

## [0.0.97](https://github.com/bloopgames/toodle/releases/tag/0.0.97)

- Add MIT license to package.json so it shows up on npm and gh.

## [0.0.96](https://github.com/bloopgames/toodle/releases/tag/0.0.96)

- Fix: `toodle.endFrame` now clears instance counts even if an uncaught error is thrown to avoid spamming the console with a ToodleInstanceCap error

## [0.0.94](https://github.com/bloopgames/toodle/releases/tag/0.0.94)

- Rename package

## [0.0.89-0.0.93](https://github.com/bloopgames/toodle/releases/tag/0.0.93)

JumboQuad fixes:

- Fix instance count bug in `QuadShader` when using `toodle.JumboQuad` with layers
- Fix `toodle.JumboQuad` positioning bug when offset is 0
- Fix `toodle.JumboQuad` tile positioning bug when `size` is provided
- Fix `size` option on `toodle.JumboQuad`

## [0.0.89](https://github.com/bloopgames/toodle/releases/tag/0.0.89)

- Add `JumboQuadNode` to render a jumbo texture, see [jumbo texture example](https://toodle.gg/examples/jumbo-textures.html) for more details.

## [0.0.88](https://github.com/bloopgames/toodle/releases/tag/0.0.88)

- Error handling: Throw `ToodleInstanceCap` error when too many instances are enqueued for a shader instead of returning an offset out of bounds error.

## [0.0.87](https://github.com/bloopgames/toodle/releases/tag/0.0.87)

- Fix: Bundles loaded via pixi prebaked atlases now have the `cropOffset` calculated correctly

## [0.0.85 and 0.0.86](https://github.com/bloopgames/toodle/releases/tag/0.0.86)

(administrative, no changes)

## [0.0.84](https://github.com/bloopgames/toodle/releases/tag/0.0.84)

- Add `QuadNode.region` to allow rendering a subregion of a texture (useful for spritesheets / tilemaps), see [texel region example](https://toodle.gg/examples/sprite-region.html) for more details.
- **Breaking**: rename `QuadNode.drawOffset` to `QuadNode.cropOffset` to avoid confusion with region offset for spritesheets
- Add `QuadNode.extra.atlasSize` to get the size of the texture atlas in texels (usually 4096x4096). These dimensions are more commonly available in the `toodle.limits` object.

## [0.0.83](https://github.com/bloopgames/toodle/releases/tag/0.0.83)

- Allow registering bundles with pre-baked texture atlases, see [pre-baking atlases](https://toodle.gg/examples/texture-bundles-prebaked.html) for more details.
- Add `toodle.assets.textureIds` to get an array of ids of all currently loaded textures.

## [0.0.82](https://github.com/bloopgames/toodle/releases/tag/0.0.82)

- Add `toodle.extra.device` to get the GPU device used by the toodle instance.

## [0.0.80](https://github.com/bloopgames/toodle/releases/tag/0.0.80)

- Fork public domain project to blooper-gg organization

## [0.0.72](https://github.com/bloopgames/toodle/releases/tag/0.0.72)

- Add an optional `index` parameter to `node.add` to specify where to insert the new child for full control over the draw order when not using layers.
- Add `node.children` alias for `node.kids` - ai seems to really want the api to be called `children`.
- Add `QuadNode.isCircle` to check if a quad is rendering a circle.

## [0.0.71](https://github.com/bloopgames/toodle/releases/tag/0.0.71)

TextNodes are now easier to serialize/deserialize.

- Add `TextNode.font` to get the font used by a `TextNode`.
- Add `font.id` to get the id of the font from the `AssetManager` perspective.
- Fix issue in fallback character logic and squash incorrect warning about missing fallback character.

## [0.0.70](https://github.com/bloopgames/toodle/releases/tag/0.0.70)

- Add `Text.TextNode` and `Text.TextShader` to the toodle exports for use in automated testing outside the browser, eg `vitest` or `bun:test`. In a browser context `toodle.Text` will still be the best way to create text nodes.

## [0.0.69](https://github.com/bloopgames/toodle/releases/tag/0.0.69)

Transparent cropping is in! Disabled by default, but can be enabled by passing `cropTransparentPixels: true` to `AssetManager.registerBundle`.

See the [transparent cropping example](https://toodle.gg/examples/transparent-cropping.html) for more details.

- Add `cropTransparentPixels` option to `AssetManager.registerBundle` to strip transparent pixels from textures.
- Add `autoLoad` option to `AssetManager.registerBundle` to automatically load a bundle when it is registered.
- Add `drawOffset` option to `toodle.Quad` to offset the draw position of the quad's texture.
- Add `quad.atlasCoords.uvScaleCropped` to get the cropped uv scale of the quad's texture.
- Add `quad.extra.cropRatio()` to get the ratio of a cropped quad's opaque texels to its original size.

## [0.0.67](https://github.com/bloopgames/toodle/releases/tag/0.0.67)

- [Fix `maxTextLength` option in `Toodle.attach`] - this is now correctly applied to the `toodle.Text` constructor.

## [0.0.66](https://github.com/bloopgames/toodle/releases/tag/0.0.66)

**Breaking change**

`rotation` in `NodeOptions` is now in degrees

```ts
// before - constructor for Quad and shapes interpreted rotation as radians
const node = toodle.shapes.Rect({ rotation: Math.PI / 2 });
// but the `rotation` property was interpreted as degrees
node.rotation = 90;

// after - both consistently interpret `rotation` as degrees and `rotationRadians` as radians
toodle.shapes.Rect({ rotation: 90 });
toodle.shapes.Rect({ rotationRadians: Math.PI / 2 });
```

## [0.0.65](https://github.com/bloopgames/toodle/releases/tag/0.0.65)

- Default `TextNode.size` to the size of the text if no `size` is provided.
- Accept `key` parameter in `toodle.shapes.Line` constructor. This allows associating a string key with the node for debugging purposes, and may be [used for optimizations in the future](https://github.com/bloopgames/toodle/issues/82).

## [0.0.64](https://github.com/bloopgames/toodle/releases/tag/0.0.64)

Allow [removal of nodes](https://toodle.gg/examples/add-and-remove-children.html)

- Added `node.delete()` to remove a node from a parent and all of it's children.
- Added `node.remove(node)` to remove a node from a parent without deleting it.
