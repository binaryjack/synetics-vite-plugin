import type { HmrContext, ModuleNode, Plugin } from 'vite';

/**
 * Transform PSR file to TypeScript
 */
async function transformPSRFile(code: string, id: string, debug: boolean): Promise<{ code: string; map: null } | null> {
  const startTime = performance.now();
  const fileName = id.split('/').pop();

  try {
    // Import the pipeline from transformer
    const transformerModule = await import('@pulsar-framework/transformer');
    const { createPipeline } = transformerModule;

    if (!createPipeline) {
      console.error(`[pulsar] PSR: Pipeline not found in transformer module for ${fileName}`);
      return {
        code: `/* Pulsar v${Date.now()} - Pipeline not available, returning original */\n${code}`,
        map: null,
      };
    }

    // Create pipeline and transform
    const pipeline = createPipeline({
      filePath: id,
      debug: debug,
      debugLogger: debug ? { enabled: true, console: true, minLevel: 'info' } : undefined,
    });

    const result = pipeline.transform(code);

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    if (debug || result.diagnostics.some(d => d.type === 'error')) {
      console.log(`[pulsar] ⚡ PSR: ${fileName} transformed in ${duration}ms`);
      if (result.diagnostics.length > 0) {
        result.diagnostics.forEach(diag => {
          const level = diag.type === 'error' ? '❌' : diag.type === 'warning' ? '⚠️' : 'ℹ️';
          console.log(`[pulsar]   ${level} ${diag.phase}: ${diag.message}`);
        });
      }
    }

    return {
      code: `/* Pulsar v${Date.now()} PSR */\n${result.code}`,
      map: null,
    };
  } catch (error) {
    console.error(`[pulsar] PSR Error transforming ${fileName}:`, error);

    // Return original code as fallback
    return {
      code: `/* Pulsar v${Date.now()} - PSR Transform failed, returning original */\n${code}`,
      map: null,
    };
  }
}

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
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

const PLUGIN_VERSION = Date.now(); // Version changes on every server restart

function pulsarPlugin(options: PulsarPluginOptions = {}): Plugin {
  const { debug = false } = options;

  let projectRoot = '';
  let isDevMode = true;

  return {
    name: 'pulsar-vite-plugin',
    enforce: 'pre',

    configResolved(config) {
      isDevMode = config.command === 'serve';
      projectRoot = config.root;
    },

    async transform(code: string, id: string) {
      // Debug log for all files passed to transform hook
      if (debug) {
        const fileName = id.split('/').pop() || id.split('\\').pop() || id;
        const fileType = id.endsWith('.psr') ? 'PSR' : id.endsWith('.tsx') ? 'TSX' : 'OTHER';
        console.log(
          `[pulsar] transform() called for: ${fileName} (${fileType} - ${id.endsWith('.psr') ? 'WILL TRANSFORM' : 'SKIP'})`
        );
      }

      // Only transform .psr files (PSR syntax)
      // TSX files pass through normally - no transformation needed
      if (!id.endsWith('.psr')) {
        return null;
      }

      // Transform PSR file to TypeScript
      return await transformPSRFile(code, id, debug);
    },

    handleHotUpdate(ctx: HmrContext) {
      // When a .psr file changes, invalidate the module to trigger re-transformation
      if (ctx.file.endsWith('.psr')) {
        // Invalidate the module to trigger re-transformation
        const module = ctx.modules.find((m: ModuleNode) => m.file === ctx.file);
        if (module) {
          ctx.server.moduleGraph.invalidateModule(module);
        }

        if (debug) {
          console.log(`[pulsar] HMR: PSR file changed, invalidating ${ctx.file}`);
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
