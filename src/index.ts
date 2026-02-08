import type { HmrContext, ModuleNode, Plugin } from 'vite';

/**
 * Transform PSR file to TypeScript
 */
async function transformPSRFile(
  code: string,
  id: string,
  debug: boolean
): Promise<{ code: string; map: null } | null> {
  const startTime = performance.now();
  const fileName = id.split('/').pop();

  try {
    // PREPROCESSING: Remove TypeScript-only syntax that PSR parser doesn't handle yet
    // 1. Remove "type" keyword from imports: import { type Foo } => import { Foo }
    let preprocessedCode = code.replace(/import\s*{\s*type\s+([^}]+)}/g, 'import { $1}');

    // 2. Remove type-only imports entirely: import type { Foo } from '...'
    preprocessedCode = preprocessedCode.replace(
      /import\s+type\s+{[^}]+}\s+from\s+['"][^'"]+['"]\s*;?\s*/g,
      ''
    );

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

    const result = await pipeline.transform(preprocessedCode);

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    // FIX: Debug import transformation issue
    if (debug) {
      console.log(`\n[pulsar] DEBUG TRANSFORMATION for ${fileName}:`);
      console.log(`  Input first 300 chars: ${preprocessedCode.substring(0, 300)}...`);
      console.log(`  Output first 300 chars: ${result.code.substring(0, 300)}...`);
      console.log(`  Has .psr in input: ${/\.psr['"]/.test(preprocessedCode)}`);
      console.log(`  Has .js in output: ${/\.js['"]/.test(result.code)}`);
    }

    if (debug || result.diagnostics.some((d) => d.type === 'error')) {
      console.log(`[pulsar] ⚡ PSR: ${fileName} transformed in ${duration}ms`);
      if (result.diagnostics.length > 0) {
        result.diagnostics.forEach((diag) => {
          const level = diag.type === 'error' ? '❌' : diag.type === 'warning' ? '⚠️' : 'ℹ️';
          console.log(`[pulsar]   ${level} ${diag.phase}: ${diag.message}`);
        });
      }
    }

    // FIX #1: Enforce validation - fail if validation errors detected
    if (result.validation && !result.validation.valid) {
      const errors = result.validation.issues.filter((i) => i.severity === 'error');
      if (errors.length > 0) {
        const errorMessages = errors.map((e) => `  - ${e.message}`).join('\n');
        throw new Error(`[pulsar] PSR Validation Failed for ${fileName}:\n${errorMessages}`);
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

    async resolveId(source: string, importer: string | undefined) {
      // Strip query parameters (Vite adds ?import, ?t=timestamp, etc.)
      const [cleanSource, query] = source.split('?', 2);

      // Skip node_modules - let Vite handle them
      if (!cleanSource.startsWith('.') && !cleanSource.startsWith('/')) {
        return null;
      }

      // If source is .psr, let Vite's default resolution handle it
      // Our load hook will transform it
      if (cleanSource.endsWith('.psr')) {
        return null;
      }

      // Only resolve when there's an importer (relative imports)
      if (!importer) {
        return null;
      }

      // Check if this is a .js import that should resolve to .psr
      // (Transformer converts .psr imports to .js for browser compatibility)
      const isTransformedJsImport = cleanSource.endsWith('.js');

      // Skip if source already has another extension (but allow .js to pass through for .psr resolution)
      if (!isTransformedJsImport && /\.(tsx?|jsx?|mjs|cjs|json|css|scss|less)$/.test(cleanSource)) {
        return null;
      }

      const fs = await import('fs/promises');
      const path = await import('path');

      try {
        // Resolve relative to importer
        const importerDir = path.dirname(importer);

        // Determine the .psr path to check
        // If source ends with .js, replace it with .psr (transformed imports)
        // Otherwise, append .psr (extensionless imports)
        const psrSource = cleanSource.endsWith('.js')
          ? cleanSource.replace(/\.js$/, '.psr')
          : `${cleanSource}.psr`;
        const possiblePsrPath = path.resolve(importerDir, psrSource);

        // Check if .psr file exists
        await fs.access(possiblePsrPath);

        if (debug) {
          console.log(`[pulsar] resolveId: Found .psr file for import "${cleanSource}"`);
          console.log(`[pulsar]   Importer: ${importer}`);
          console.log(`[pulsar]   Resolved: ${possiblePsrPath}`);
        }

        return possiblePsrPath;
      } catch {
        // .psr file doesn't exist, let Vite try normal resolution
        return null;
      }
    },

    async load(id: string) {
      // Use load hook instead of transform to process .psr files BEFORE Vite's import analysis
      // This prevents "Failed to parse source for import analysis" errors

      // Strip query parameters before checking extension
      const [cleanId, query] = id.split('?', 2);

      if (!cleanId.endsWith('.psr')) {
        return null;
      }

      if (debug) {
        const fileName = cleanId.split('/').pop() || cleanId.split('\\').pop() || cleanId;
        console.log(`[pulsar] load() called for: ${fileName} (PSR - WILL TRANSFORM)`);
        console.log(`[pulsar]   ID: ${cleanId}`);
        console.log(`[pulsar]   Root: ${projectRoot}`);
      }

      // Read the file content
      const fs = await import('fs/promises');
      const path = await import('path');

      // If ID starts with /, it's relative to the project root
      let resolvedPath = cleanId;
      if (resolvedPath.startsWith('/')) {
        resolvedPath = resolvedPath.substring(1); // Remove leading /
      }

      const absolutePath = path.resolve(projectRoot, resolvedPath);

      if (debug) {
        console.log(`[pulsar]   Resolved: ${absolutePath}`);
      }

      try {
        const code = await fs.readFile(absolutePath, 'utf-8');
        // Transform PSR file to TypeScript before Vite analyzes imports
        return await transformPSRFile(code, absolutePath, debug);
      } catch (error) {
        console.error(`[pulsar] PSR Error reading file ${cleanId}:`, error);
        return null;
      }
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
