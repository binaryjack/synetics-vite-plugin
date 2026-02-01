import * as ts from 'typescript';
import type { HmrContext, ModuleNode, Plugin } from 'vite';

/**
 * Vite plugin for pulsar framework
 * Transforms TSX syntax into direct DOM manipulation using the pulsar transformer
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vite'
 * import { pulsarPlugin } from '@pulsar/vite-plugin'
 *
 * export default defineConfig({
 *   plugins: [pulsarPlugin()]
 * })
 * ```
 */

export interface PulsarPluginOptions {
  /**
   * Enable caching for production builds
   * @default false (caching disabled for better HMR)
   */
  enableCache?: boolean;
}

const PLUGIN_VERSION = Date.now(); // Version changes on every server restart

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.Preserve,
  strict: false,
  esModuleInterop: true,
  skipLibCheck: true,
};

function pulsarPlugin(options: PulsarPluginOptions = {}): Plugin {
  const { enableCache = false } = options;

  // Cache transformer module and program
  let cachedTransformer: any = null;
  let cachedProgram: ts.Program | null = null;
  let transformedFiles = new Set<string>();
  let isDevMode = true;
  let lastTransformerLoad = 0;
  const RELOAD_INTERVAL = 1000; // Reload transformer every second in dev mode

  return {
    name: 'pulsar-vite-plugin',
    enforce: 'pre',

    configResolved(config) {
      isDevMode = config.command === 'serve';
    },

    buildStart() {
      // Initialize shared program once at build start
      if (!cachedProgram) {
        const host = ts.createCompilerHost(compilerOptions);

        // Create a lightweight program with minimal file set
        cachedProgram = ts.createProgram([], compilerOptions, host);
      }
    },

    async transform(code: string, id: string) {
      // Only transform .tsx files
      if (!id.endsWith('.tsx')) {
        return null;
      }

      const startTime = performance.now();
      const fileName = id.split('/').pop();

      // In dev mode, don't cache the transformer to always get latest changes
      // In production, cache for performance
      if (!isDevMode && cachedTransformer) {
        // Use cached version in production
      } else {
        // Always reload in dev, or first load in production
        const transformerModule = await import('@pulsar-framework/transformer');
        cachedTransformer = transformerModule.default;
      }

      // Create source file for this specific transformation
      const sourceFile = ts.createSourceFile(
        id,
        code,
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.TSX
      );

      // Don't pass program - let transformer work without type checking
      // This avoids issues with incomplete type information in Vite environment
      const transformerFactory = cachedTransformer();

      // Transform the source file
      const result = ts.transform(sourceFile, [transformerFactory]);
      const transformedFile = result.transformed[0];

      // Print the transformed file
      const printer = ts.createPrinter();
      const outputCode = printer.printFile(transformedFile);

      // Clean up
      result.dispose();

      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(2);

      if (isDevMode) {
        const status = transformedFiles.has(id) ? 'cached' : 'fresh';
        transformedFiles.add(id);
        console.log(`[pulsar] ⚡ ${fileName} transformed in ${duration}ms (${status})`);
      }

      return {
        code: `/* Pulsar v${PLUGIN_VERSION} */\n${outputCode}`,
        map: null,
      };
    },

    handleHotUpdate(ctx: HmrContext) {
      // When a .tsx file changes, invalidate the module to trigger re-transformation
      if (ctx.file.endsWith('.tsx')) {
        // Mark file as needing fresh transformation
        transformedFiles.delete(ctx.file);

        // Invalidate the module to trigger re-transformation
        const module = ctx.modules.find((m: ModuleNode) => m.file === ctx.file);
        if (module) {
          ctx.server.moduleGraph.invalidateModule(module);
        }

        // Return modules to update (let Vite handle the HMR)
        return ctx.modules;
      }
    },
  };
}

// Named export for convenience
export { pulsarPlugin };

// Default export
export default pulsarPlugin;
