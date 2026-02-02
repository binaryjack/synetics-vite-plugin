import * as path from 'path';
import * as ts from 'typescript';
import type { HmrContext, ModuleNode, Plugin } from 'vite';

/**
 * Vite plugin for pulsar framework
 * Transforms TSX syntax into direct DOM manipulation using the pulsar transformer
 * Now with enhanced dependency resolution for component imports
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

  /**
   * Enable enhanced transformer with dependency resolution
   * @default true
   */
  enableDependencyResolution?: boolean;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
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
  const { enableCache = false, enableDependencyResolution = true, debug = false } = options;

  // Cache transformer module and program
  let cachedTransformer: any = null;
  let cachedProgram: ts.Program | null = null;
  let projectRoot = '';
  let transformedFiles = new Set<string>();
  let isDevMode = true;
  let lastTransformerLoad = 0;
  const RELOAD_INTERVAL = 1000; // Reload transformer every second in dev mode

  return {
    name: 'pulsar-vite-plugin',
    enforce: 'pre',

    configResolved(config) {
      isDevMode = config.command === 'serve';
      projectRoot = config.root;
    },

    buildStart() {
      // Create a more comprehensive program for the project
      if (!cachedProgram) {
        const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json');

        if (configPath) {
          const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
          const parsedConfig = ts.parseJsonConfigFileContent(
            configFile.config,
            ts.sys,
            path.dirname(configPath)
          );

          cachedProgram = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);

          if (debug) {
            console.log(
              `[pulsar] Created TypeScript program with ${parsedConfig.fileNames.length} files`
            );
          }
        } else {
          // Fallback to simple program
          const host = ts.createCompilerHost(compilerOptions);
          cachedProgram = ts.createProgram([], compilerOptions, host);

          if (debug) {
            console.log('[pulsar] Created fallback TypeScript program');
          }
        }
      }
    },

    async transform(code: string, id: string) {
      // Debug log for all files passed to transform hook
      if (debug) {
        const fileName = id.split('/').pop() || id.split('\\').pop() || id;
        console.log(
          `[pulsar] transform() called for: ${fileName} (${id.endsWith('.tsx') ? 'WILL TRANSFORM' : 'SKIP'})`
        );
      }

      // Only transform .tsx files
      if (!id.endsWith('.tsx')) {
        return null;
      }

      const startTime = performance.now();
      const fileName = id.split('/').pop();

      try {
        // In dev mode, don't cache the transformer to always get latest changes
        if (!isDevMode && cachedTransformer) {
          // Use cached version in production
        } else {
          // Always reload in dev, or first load in production
          const transformerModule = await import('@pulsar-framework/transformer');
          cachedTransformer = transformerModule;
        }

        let outputCode: string;
        let dependencies: string[] = [];

        if (enableDependencyResolution && cachedProgram) {
          // Use enhanced transformer with dependency resolution
          try {
            const result = await cachedTransformer.enhancedTransform(code, id, {
              program: cachedProgram,
              rootDir: projectRoot,
              debug: debug && isDevMode,
            });

            outputCode = result.code;
            dependencies = result.dependencies;

            if (debug && dependencies.length > 0) {
              console.log(`[pulsar] ${fileName} depends on: ${dependencies.join(', ')}`);
            }
          } catch (error) {
            if (debug) {
              console.warn(
                `[pulsar] Enhanced transform failed for ${fileName}, falling back to single-file:`,
                error
              );
            }

            // Fall back to single-file transformer
            const sourceFile = ts.createSourceFile(
              id,
              code,
              ts.ScriptTarget.ESNext,
              true,
              ts.ScriptKind.TSX
            );
            const transformerFactory = cachedTransformer.default();
            const result = ts.transform(sourceFile, [transformerFactory]);
            const transformedFile = result.transformed[0];
            outputCode = ts.createPrinter().printFile(transformedFile);
            result.dispose();
          }
        } else {
          // Use single-file transformer (backward compatibility)
          const sourceFile = ts.createSourceFile(
            id,
            code,
            ts.ScriptTarget.ESNext,
            true,
            ts.ScriptKind.TSX
          );
          const transformerFactory = cachedTransformer.default();
          const result = ts.transform(sourceFile, [transformerFactory]);
          const transformedFile = result.transformed[0];
          outputCode = ts.createPrinter().printFile(transformedFile);
          result.dispose();
        }

        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(2);

        if (isDevMode || debug) {
          const status = transformedFiles.has(id) ? 'cached' : 'fresh';
          const depInfo = dependencies.length > 0 ? ` [${dependencies.length} deps]` : '';
          transformedFiles.add(id);
          console.log(`[pulsar] ⚡ ${fileName} transformed in ${duration}ms (${status})${depInfo}`);
        }

        return {
          code: `/* Pulsar v${PLUGIN_VERSION} */\n${outputCode}`,
          map: null,
        };
      } catch (error) {
        console.error(`[pulsar] Error transforming ${fileName}:`, error);

        // Return original code as fallback
        return {
          code: `/* Pulsar v${PLUGIN_VERSION} - Transform failed, returning original */\n${code}`,
          map: null,
        };
      }
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
