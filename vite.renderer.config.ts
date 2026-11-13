import { defineConfig } from 'vite';
// eslint-disable-next-line import/no-unresolved -- Tailwind v4 exposes its Vite plugin via package exports.
import tailwindcss from '@tailwindcss/vite';
import { createRendererContentSecurityPolicy } from './src/shared/renderer-csp';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    tailwindcss(),
    {
      name: 'renderer-content-security-policy',
      transformIndexHtml: {
        order: 'post',
        handler(_html, context) {
          const devUrl = context.server?.resolvedUrls?.local[0];
          if (context.server && !devUrl) throw new Error('Renderer dev server URL is not ready for CSP');
          return [{
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: createRendererContentSecurityPolicy(devUrl) },
            injectTo: 'head-prepend',
          }];
        },
      },
    },
  ],
  optimizeDeps: {
    include: [
      '@babylonjs/core/Buffers/storageBuffer',
      '@babylonjs/loaders/OBJ/objFileLoader.js',
      '@babylonjs/loaders/STL/stlFileLoader.js',
      '@babylonjs/loaders/SPLAT/spz.js',
      // babylon-mmd dynamically imports this after the first BMP toon/sphere texture is inspected.
      // Discover it up front so Vite does not invalidate optimized deps mid-session.
      'babylon-mmd/esm/Loader/dxBmpTextureLoader',
      // babylon-mmd loads these after the first textured PMX material is inspected.
      // Discover them up front so Vite does not invalidate optimized deps mid-session.
      'babylon-mmd/esm/Loader/Shaders/textureAlphaChecker.fragment',
      'babylon-mmd/esm/Loader/Shaders/textureAlphaChecker.vertex',
      'babylon-mmd/esm/Loader/ShadersWGSL/textureAlphaChecker.fragment',
      'babylon-mmd/esm/Loader/ShadersWGSL/textureAlphaChecker.vertex',
    ],
    exclude: [
      '@babylonjs/loaders',
      '@babylonjs/loaders/glTF',
      'babylon-mmd/esm/Runtime/Optimized/Animation/mmdWasmAnimation',
      'babylon-mmd/esm/Runtime/Optimized/Animation/mmdWasmRuntimeModelAnimation',
      'babylon-mmd/esm/Runtime/Optimized/mmdWasmRuntime',
      'babylon-mmd/esm/Runtime/Optimized/Physics/mmdWasmPhysics',
      'babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/physicsRuntimeEvaluationType',
      'babylon-mmd/esm/Runtime/Optimized/wasm/mpr',
      'babylon-mmd/esm/Runtime/Optimized/wasm/spr',
    ],
  },
});
