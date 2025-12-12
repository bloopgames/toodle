export default /*wgsl*/ `
// ==============================
// === BOUNDING BOX PASS =======
// ==============================

// Input texture from which to compute the non-transparent bounding box
@group(0) @binding(0)
var input_texture: texture_2d<f32>;

// Atomic bounding box storage structure
struct bounding_box_atomic {
    min_x: atomic<u32>,
    min_y: atomic<u32>,
    max_x: atomic<u32>,
    max_y: atomic<u32>,
};

// Storage buffer to hold atomic bounding box updates
@group(0) @binding(1)
var<storage, read_write> bounds: bounding_box_atomic;

// Compute shader to find the bounding box of non-transparent pixels
@compute @workgroup_size(8, 8)
fn find_bounds(@builtin(global_invocation_id) gid: vec3<u32>) {
    let size = textureDimensions(input_texture).xy;
    if (gid.x >= size.x || gid.y >= size.y) {
        return;
    }

    let pixel = textureLoad(input_texture, vec2<i32>(gid.xy), 0);
    if (pixel.a > 0.0) {
        atomicMin(&bounds.min_x, gid.x);
        atomicMin(&bounds.min_y, gid.y);
        atomicMax(&bounds.max_x, gid.x);
        atomicMax(&bounds.max_y, gid.y);
    }
}

// ==============================
// === CROP + OUTPUT PASS ======
// ==============================

// Input texture from which cropped data is read
@group(0) @binding(0)
var input_texture_crop: texture_2d<f32>;

// Output texture where cropped image is written
@group(0) @binding(1)
var output_texture: texture_storage_2d<rgba8unorm, write>;

// Bounding box passed in as a uniform (not atomic anymore)
struct bounding_box_uniform {
    min_x: u32,
    min_y: u32,
    max_x: u32,
    max_y: u32,
};

@group(0) @binding(2)
var<uniform> bounds_uniform: bounding_box_uniform;

// Struct to store both original and cropped texture dimensions
struct image_dimensions {
    original_width: u32,
    original_height: u32,
    cropped_width: u32,
    cropped_height: u32,
};

// Storage buffer to output the result dimensions
@group(0) @binding(3)
var<storage, read_write> dimensions_out: image_dimensions;

// Compute shader to crop the input texture to the bounding box and output it
@compute @workgroup_size(8, 8)
fn crop_and_output(@builtin(global_invocation_id) gid: vec3<u32>) {
    let size = textureDimensions(input_texture_crop).xy;

    let crop_width = bounds_uniform.max_x - bounds_uniform.min_x + 1u;
    let crop_height = bounds_uniform.max_y - bounds_uniform.min_y + 1u;

    if (gid.x >= crop_width || gid.y >= crop_height) {
        return;
    }

    let src_coord = vec2<i32>(
        i32(bounds_uniform.min_x + gid.x),
        i32(bounds_uniform.min_y + gid.y)
    );

    let dst_coord = vec2<i32>(i32(gid.x), i32(gid.y));
    let pixel = textureLoad(input_texture_crop, src_coord, 0);
    textureStore(output_texture, dst_coord, pixel);

    // Output dimensions from workgroup (0,0) only
    if (gid.x == 0u && gid.y == 0u) {
        dimensions_out.original_width = size.x;
        dimensions_out.original_height = size.y;
        dimensions_out.cropped_width = crop_width;
        dimensions_out.cropped_height = crop_height;
    }
}

// ==============================
// === MISSING TEXTURE FILL ====
// ==============================

// Output texture to draw a fallback checkerboard
@group(0) @binding(0)
var checker_texture: texture_storage_2d<rgba8unorm, write>;

// Compute shader to fill a texture with a purple & green checkerboard
@compute @workgroup_size(8, 8)
fn missing_texture(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = textureDimensions(checker_texture);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }

    let checker_size = 25u;
    let on_color = ((id.x / checker_size + id.y / checker_size) % 2u) == 0u;

    let color = select(
        vec4<f32>(0.5, 0.0, 0.5, 1.0), // Purple
        vec4<f32>(0.0, 1.0, 0.0, 1.0), // Green
        on_color
    );

    textureStore(checker_texture, vec2<i32>(id.xy), color);
}
`;
