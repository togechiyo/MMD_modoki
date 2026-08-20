import { defineConfig } from 'vite';
// eslint-disable-next-line import/no-unresolved -- Tailwind v4 exposes its Vite plugin via package exports.
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  optimizeDeps: {
    include: [
      '@babylonjs/loaders/OBJ/objFileLoader.js',
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
