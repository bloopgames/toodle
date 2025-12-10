# CLAUDE.md

This file provides context for AI assistants working with the Toodle codebase.

## Project Overview

Toodle is a 2D graphics engine using WebGPU to render textured quads and text. The name is a portmanteau of "2d" and "doodle".

- **Package:** `@bloopjs/toodle`
- **Documentation:** https://toodle.gg
- **License:** MIT (Copyright 2025 bloop games)

## Common Commands

```bash
bun install          # Install dependencies
bun run dev          # Start Vite dev server
bun test             # Run tests
bun tsc              # Type check
bun run biome:check  # Lint and format check
bun run biome:write  # Auto-fix lint/format issues
bun run build        # Build for distribution
bun run ci           # Full CI check (biome + test + tsc)
```

## Project Structure

```
src/
├── Toodle.ts           # Main engine class
├── mod.ts              # Public API exports (entry point)
├── limits.ts           # Engine limits configuration
├── coreTypes/          # Color, Point, Size, Transform, Vec2
├── scene/              # Scene graph (SceneNode, QuadNode, Camera, Batcher)
├── shaders/            # Shader system and WGSL sources
│   ├── wgsl/           # WGSL shader source files
│   └── postprocess/    # Post-processing effects
├── textures/           # Texture atlas and asset management
├── text/               # Text rendering (MSDF fonts)
├── math/               # Matrix and angle utilities
└── utils/              # Pooling, assertions, GPU boilerplate

examples/               # 26+ example files demonstrating features
test/                   # Bun test suite
docs/                   # VitePress documentation site
scripts/                # Build and publish scripts
```

## Key Technologies

- **WebGPU** - GPU rendering API
- **TypeScript** - Strict mode enabled
- **Bun** - Package manager and test runner
- **Vite** - Dev server and bundler
- **WGSL** - WebGPU Shading Language for GPU code
- **Biome** - Linting and formatting

## Architecture Patterns

### Scene Graph
- `SceneNode` is the base class for all renderable nodes
- Nodes have parent/children relationships and transforms (position, scale, rotation, size)
- Dirty flag caching for performance optimization

### Render Batching
- `Batcher` groups nodes by shader and z-index
- Instanced rendering supports up to 2048 quads per draw call

### Shader System
- `IShader` interface for pluggable shaders
- WGSL files stored as TypeScript string exports in `src/shaders/wgsl/`
- `QuadShader` handles standard textured quad rendering

### Asset Management
- `AssetManager` handles texture and font loading
- Textures are packed into large GPU atlases
- Assets referenced by string ID

### Engine Limits (defaults in limits.ts)
- instanceCount: 2048 (max rendered instances/frame)
- zIndex: 32 (unique z-layers)
- shaderCount: 32 (custom shaders)
- textureSize: 4096x4096 (atlas dimensions)

## Code Conventions

- Private fields use `#fieldName` syntax
- Node factory methods: `toodle.Quad()`, `toodle.shapes.Circle()`, etc.
- Core types use PascalCase: `QuadNode`, `SceneNode`, `TextNode`
- Namespace exports: `Colors`, `Scene`, `Shaders`, `Text`, `Textures`
- No side effects (tree-shakeable)

## Testing

Tests use Bun's native test runner. Test files are in `test/` directory:
- `test/math/matrix.test.ts`
- `test/shader/parser.test.ts`
- `test/scene/SceneNode.test.ts`
- `test/scene/Batcher.test.ts`
