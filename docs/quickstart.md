# Quickstart

This guide assumes some familiarity with web development and bundling.

We recommend running [Vite](https://vitejs.dev/) with [Bun](https://bun.sh/), but you can use any js runtime and bundler you like, e.g. `node` with `webpack` for React or NextJS.

## Create a vite project

```bash
bun create vite
```

## Add toodle

```bash
bun add @bloop.gg/toodle
```

## Draw a kitten at 0,0

**index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Toodle</title>

    <style>
      body {
        margin: 0;
        padding: 0;
      }

      canvas {
        display: block;
      }
    </style>
  </head>

  <body>
    <div id="app"></div>
    <canvas style="width: 100vw; height: 100vh"></canvas>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
```

**src/main.ts**

<<< @/snippets/quickstart.ts

{toodle=snippets/quickstart.ts width=400px height=400px}
