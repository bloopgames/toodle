# Transparent Pixel Cropping

Atlases are packed with a simple [guillotine algorithm](https://en.wikipedia.org/wiki/Guillotine_cutting).

You can specify `cropTransparentPixels` when loading a texture bundle to have toodle crop out any excess transparent pixels.

In this example, we load the same texture into two bundles - one with transparent pixels cropped, and one without.

From the developer perspective, the size will appear the same. But from a rendering perspective, the cropped texture will take up less memory and be offset by Toodle to be in the same position as the un-cropped texture.

{toodle=snippets/transparent-cropping.ts width=400px height=400px}

<<< @/snippets/transparent-cropping.ts