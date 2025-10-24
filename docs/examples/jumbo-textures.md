# Jumbo Textures

There may be times when you have to load a texture that is too large to fit into your texture atlas. For example, a background for a fighting game might exceed 4096 pixels wide.

Toodle will attempt to break jumbo textures down to fit it into the atlas. If the texture is larger than the atlas, you'll have to use `toodle.JumboQuad` when drawing the texture.

::: warning

This is a new feature. Please let us know if you encounter issues when using jumbo textures and `toodle.JumboQuad`. Custom shaders expecting uvs to range from 0 to 1 will not work correctly.

:::

Image is copyright [Scramble Heart City](https://scrambleheart.city/)

{toodle=snippets/jumbo-textures.ts width=400px height=400px}

<<< @/snippets/jumbo-textures.ts
