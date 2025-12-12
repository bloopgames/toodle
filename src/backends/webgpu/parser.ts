import { type StructInfo, WgslReflect } from "wgsl_reflect";
import type { ShaderDescriptor } from "./ShaderDescriptor";

export function codeWithLineNumbers(code: string) {
  return code
    .split("\n")
    .map((line, index) => `${index + 1}: ${line}`)
    .join("\n");
}

export function combineShaderCode(
  label: string,
  base: string,
  mod: string,
): ShaderDescriptor {
  let baseAst: WgslReflect;
  let modAst: WgslReflect;

  try {
    baseAst = new WgslReflect(base);
  } catch (e) {
    console.error(codeWithLineNumbers(base));
    throw e;
  }
  try {
    modAst = new WgslReflect(mod);
  } catch (e) {
    console.error(codeWithLineNumbers(mod));
    throw e;
  }

  if (modAst.structs.length > 1) {
    throw new Error(
      "Shader has more than one struct. Only one struct is supported for now.",
    );
  }

  const hasInstanceStruct = modAst.structs.length;
  const hasFragmentEntrypoint = modAst.entry.fragment.length > 0;
  const hasVertexEntrypoint = modAst.entry.vertex.length > 0;

  const fragmentEntrypoint = hasFragmentEntrypoint
    ? modAst.entry.fragment[0]?.name
    : baseAst.entry.fragment[0]?.name;
  const vertexEntrypoint = hasVertexEntrypoint
    ? modAst.entry.vertex[0]?.name
    : baseAst.entry.vertex[0]?.name;

  if (hasInstanceStruct) {
    base = injectInstanceData(mod, base);
  }

  return {
    label,
    code: `${base}\n//==========\n\n${mod.trim()}`,
    vertexEntrypoint,
    fragmentEntrypoint,
  };
}

function injectInstanceData(instanceStruct: string, code: string) {
  const codeAst = new WgslReflect(code);
  const snippetAst = new WgslReflect(instanceStruct);

  const baseInstanceStruct = codeAst.structs.find((s) =>
    s.name.endsWith("InstanceData"),
  );
  if (!baseInstanceStruct) {
    throw new Error(
      `No base instance struct found in code. Looking for a struct named ending in "InstanceData". Code:\n${code}`,
    );
  }

  const baseFragmentStruct = codeAst.structs.find((s) =>
    s.name.endsWith("VertexOutput"),
  );
  if (!baseFragmentStruct) {
    throw new Error(
      `No base fragment struct found in code. Looking for a struct named ending in "VertexOutput". Code:\n${code}`,
    );
  }

  const struct = snippetAst.structs[0];
  const slug = struct.name.toLowerCase();

  const passthroughSnippet = struct.members
    .map((m) => `output.${slug}_${m.name} = instance.${slug}_${m.name};`)
    .join("\n");

  const prefixedMembersSnippet = struct.members.map(
    (m) =>
      `${slug}_${m.name}: ${m.type.name}${m.format ? `<${m.format.name}>` : ""}`,
  );

  let startingVertexLocation = findStartingLocation(baseInstanceStruct);

  const instanceInputSnippet = prefixedMembersSnippet
    .map((snippet) => `@location(${startingVertexLocation++}) ${snippet},`)
    .join("\n  ");

  let startingFragmentLocation = findStartingLocation(baseFragmentStruct);

  const vertexOutputSnippet = prefixedMembersSnippet
    .map(
      (snippet) =>
        `@location(${startingFragmentLocation++}) @interpolate(flat) ${snippet},`,
    )
    .join("\n  ");

  return code
    .replace(/\/\/ @INSTANCE_DATA SNIPPET/, instanceInputSnippet)
    .replace(/\/\/ @PASSTHROUGH_SNIPPET/, passthroughSnippet)
    .replace(/\/\/ @VERTEX_OUTPUT SNIPPET/, vertexOutputSnippet);
}

function findStartingLocation(struct: StructInfo) {
  let startingLocation = 0;
  for (const member of struct.members) {
    const locationAttr = (member.attributes || []).find(
      (attr) => attr.name === "location",
    );
    if (locationAttr) {
      const location = Number.parseInt(locationAttr.value as string, 10);
      startingLocation = Math.max(startingLocation, location);
    }
  }
  return startingLocation + 1;
}

export function struct2BufferLayout(
  struct: StructInfo,
  stepMode: GPUVertexStepMode = "instance",
): GPUVertexBufferLayout {
  const hasBuiltin = struct.members.some((m) =>
    m.attributes?.some((a) => a.name === "builtin"),
  );
  if (hasBuiltin) {
    throw new Error(
      "Can't generate buffer layout from struct with builtin attributes - they count towards size",
    );
  }

  const unprocessedMembers = struct.members.filter(
    (m) => !m.attributes || !m.attributes.some((a) => a.name === "location"),
  );
  for (const member of unprocessedMembers) {
    console.error(
      `Unprocessed member in struct ${struct.name}: ${member.name}`,
    );
  }

  const membersWithAttributes = struct.members.filter((m) =>
    m.attributes?.some((a) => a.name === "location"),
  );

  return {
    arrayStride: struct.size,
    attributes: membersWithAttributes.map((m) => {
      const location = m.attributes!.find((a) => a.name === "location")?.value;
      if (!location) {
        throw new Error(`Location attribute not found for member: ${m.name}`);
      }
      if (Array.isArray(location)) {
        throw new Error(`Location attribute is an array for member: ${m.name}`);
      }

      const shaderLocation = Number.parseInt(location, 10);
      if (Number.isNaN(shaderLocation)) {
        throw new Error(
          `Invalid location attribute: ${location} for member: ${m.name}`,
        );
      }

      return {
        shaderLocation,
        offset: m.offset,

        format: getGpuFormat(m.type.name),
      } satisfies GPUVertexAttribute;
    }),
    stepMode,
  } satisfies GPUVertexBufferLayout;
}

export function validateFragmentShader(shaderCode: string) {
  const ast = new WgslReflect(shaderCode);
  const exampleSnippet = `
@fragment
fn myFragmentShader(vertex: VertexOutput) -> @location(0) vec4<f32> {
  let DEFAULT_COLOR = default_fragment_shader(vertex, nearestSampler);
  return DEFAULT_COLOR;
}
`;

  if (!ast.entry.fragment.length) {
    throw new Error(`Shader code must have @fragment, e.g. ${exampleSnippet}`);
  }
}

export function getGpuFormat(typeName: string): GPUVertexFormat {
  // Remove <f32> or <u32> from type names
  const baseType = typeName.replace(/<[fu]32>/, "");

  const formatMap: Record<string, GPUVertexFormat> = {
    vec2: "float32x2",
    vec2f: "float32x2",
    vec3: "float32x3",
    vec3f: "float32x3",
    vec4: "float32x4",
    vec4f: "float32x4",
    mat3x3: "float32x3",
    u32: "uint32",
    f32: "float32",
  };

  const format = formatMap[baseType.toLowerCase()];
  if (!format) {
    throw new Error(`Unsupported type: ${typeName}`);
  }
  return format;
}
