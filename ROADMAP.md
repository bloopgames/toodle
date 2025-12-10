# Toodle Roadmap

## Phase 1: Package Rename & Publishing (Customer Unblock)

**Goal:** Change package from `@bloopjs/toodle` to `@bloopjs/toodle`

- [ ] Update package name in all config files
- [ ] Update imports in examples and documentation
- [ ] Set up NPM token or OIDC for @bloopjs org
- [ ] Verify GitHub Actions workflow can publish

## Phase 2: AssetManager Extensibility (Customer Unblock)

**Goal:** Extract bundle registration and atlas coordinate parsing for WebGL fallback use

- [ ] Create `Bundles` class - pure TypeScript, no WebGPU dependencies
- [ ] Extract Pixi JSON parsing logic from AssetManager
- [ ] Export renderer-agnostic types (UvRegion, TextureRegion, AtlasCoords, etc.)
- [ ] Refactor AssetManager to use Bundles internally

Customer can then use `Bundles` standalone for:
- Bundle registration (Pixi atlas format)
- Atlas coordinate lookup
- Texture region/size queries

## Phase 3: API Cleanup (v0.1 Prep)

### 3a. Circle radius parameter
```typescript
// Before
toodle.shapes.Circle({ scale: { x: 100, y: 100 } })

// After
toodle.shapes.Circle({ radius: 50 })
```

### 3b. Rename idealSize to size
- Delete vestigial `idealSize` property
- Use `size` directly throughout
- Defaults: 100x100 for shapes, natural dimensions for quads

### 3c. autoLoad default for bundles
- `registerBundle()` will auto-load by default
- Set `autoLoad: false` to defer GPU loading

## Phase 4: Shader API Research

Evaluate improvements to the shader API:
- TypeGPU for type-safe shader uniforms
- Code generation for `writeInstance` offsets
- Better error messages for compilation failures

## Phase 5: v0.1 Release

**Breaking changes:**
- Package name: `@bloopjs/toodle` → `@bloopjs/toodle`
- Circle API: `scale` → `radius`
- `idealSize` → `size`
- Bundle registration: `autoLoad` defaults to `true`
