import type { HmrContext, Plugin } from 'vite';

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

  if (debug) {
    console.log(`\n[pulsar] ========== TRANSFORMATION START: ${fileName} ==========`);
    console.log(`[pulsar] File path: ${id}`);
    console.log(`[pulsar] Input length: ${code.length} chars`);
  }

  try {
    // PREPROCESSING: Remove TypeScript-only syntax that PSR parser doesn't handle yet
    // 1. Remove "type" keyword from imports: import { type Foo } => import { Foo }
    let preprocessedCode = code.replace(/import\s*{\s*type\s+([^}]+)}/g, 'import { $1}');

    // 2. Remove type-only imports entirely: import type { Foo } from '...'
    preprocessedCode = preprocessedCode.replace(
      /import\s+type\s+{[^}]+}\s+from\s+['"][^'"]+['"]\s*;?\s*/g,
      ''
    );
    if (debug) {
      console.log(`[pulsar] Preprocessing complete`);
      console.log(`[pulsar] Preprocessed length: ${preprocessedCode.length} chars`);
    }
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

    if (debug) {
      console.log(`[pulsar] Creating transformation pipeline...`);
    }

    // Create pipeline and transform
    const pipeline = createPipeline({
      filePath: id,
      debug: debug,
      debugLogger: debug ? { enabled: true, console: true, minLevel: 'debug' } : undefined,
    });

    if (debug) {
      console.log(`[pulsar] Running transformation pipeline...`);
    }

    const result = await pipeline.transform(preprocessedCode);

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    if (debug) {
      console.log(`[pulsar] Transformation complete in ${duration}ms`);
      console.log(`[pulsar] Output length: ${result.code.length} chars`);
      console.log(`[pulsar] Diagnostic count: ${result.diagnostics.length}`);

      // Show metrics if available
      if (result.metrics) {
        console.log(`[pulsar] METRICS:`);
        console.log(`[pulsar]   - Lexer:     ${result.metrics.lexerTime.toFixed(2)}ms`);
        console.log(`[pulsar]   - Parser:    ${result.metrics.parserTime.toFixed(2)}ms`);
        console.log(`[pulsar]   - Analyzer:  ${result.metrics.analyzerTime.toFixed(2)}ms`);
        console.log(`[pulsar]   - Transform: ${result.metrics.transformTime.toFixed(2)}ms`);
        console.log(`[pulsar]   - Emitter:   ${result.metrics.emitterTime.toFixed(2)}ms`);
        console.log(`[pulsar]   - Total:     ${result.metrics.totalTime.toFixed(2)}ms`);
      }
    }

    // FIX: Debug import transformation issue
    if (debug) {
      console.log(`\n[pulsar] DEBUG TRANSFORMATION for ${fileName}:`);
      console.log(`  Input first 300 chars: ${preprocessedCode.substring(0, 300)}...`);
      console.log(`  Output first 300 chars: ${result.code.substring(0, 300)}...`);
      console.log(`  Has .psr in input: ${/\.psr['"]/.test(preprocessedCode)}`);
      console.log(`  Has .js in output: ${/\.js['"]/.test(result.code)}`);
      console.log(`[pulsar] ========== TRANSFORMATION END: ${fileName} ==========\n`);
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
    const duration = (performance.now() - startTime).toFixed(2);
    console.error(`[pulsar] PSR Error transforming ${fileName} (after ${duration}ms):`, error);

    if (debug && error instanceof Error) {
      console.error(`[pulsar] Error stack:`, error.stack);
      console.error(`[pulsar] Error details:`, {
        message: error.message,
        name: error.name,
      });
    }

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

  /**
   * Auto-inject HMR handling for pulse() calls in main.ts
   * Automatically handles component hot reloading without manual HMR code
   * @default true
   */
  autoInjectHMR?: boolean;

  /**
   * Debug channels for transformer
   */
  debugChannels?: string[];

  /**
   * Enable dependency resolution
   */
  enableDependencyResolution?: boolean;
}

const PLUGIN_VERSION = Date.now(); // Version changes on every server restart

/**
 * Generic PSR module declaration template
 * This provides TypeScript support for importing .psr files
 */
const PSR_TYPE_DECLARATION = `/**
 * TypeScript declarations for .psr files
 * Auto-generated by @pulsar-framework/vite-plugin
 * 
 * Wildcard allows any named exports from .psr files.
 * Use: import { ComponentName } from './file.psr'
 */
declare module '*.psr';
`;

function pulsarPlugin(options: PulsarPluginOptions = {}): Plugin {
  const { debug = false, autoInjectHMR = true } = options;

  let projectRoot = '';
  let isDevMode = true;

  return {
    name: 'pulsar-vite-plugin',
    enforce: 'pre',

    async configResolved(config) {
      isDevMode = config.command === 'serve';
      projectRoot = config.root;

      // Note: Type declarations are provided by @pulsar-framework/pulsar.dev
      // No need to auto-create local files
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

    async transform(code: string, id: string) {
      // Auto-inject HMR for pulse() calls in main.ts/main.tsx
      if (autoInjectHMR && isDevMode && /main\.(ts|tsx|js|jsx)$/.test(id)) {
        // Check if file contains pulse() call and has PSR component import
        const hasPulse = /\bpulse\s*\(/.test(code);
        const psrImportMatch = code.match(/import\s+{([^}]+)}\s+from\s+['"](.+\.psr)['"]/);

        if (hasPulse && psrImportMatch) {
          const componentNames = psrImportMatch[1]
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean);
          const psrPath = psrImportMatch[2];

          // Check if HMR is already manually added
          const hasManualHMR = /import\.meta\.hot/.test(code);

          if (!hasManualHMR && componentNames.length > 0) {
            // Get the first exported component (default or first named)
            const componentName = componentNames[0];

            const hmrCode = `
// Auto-injected HMR by pulsar-vite-plugin
if (import.meta.hot) {
  import.meta.hot.accept('${psrPath}', async (newModule) => {
    if (newModule && typeof app !== 'undefined') {
      await app.unmount();
      await app.mount(newModule.${componentName}());
    }
  });
  import.meta.hot.accept();
}`;

            if (debug) {
              console.log(`[pulsar] Auto-injecting HMR for ${id}`);
              console.log(`[pulsar]   Component: ${componentName}`);
              console.log(`[pulsar]   PSR file: ${psrPath}`);
            }

            return {
              code: code + '\n' + hmrCode,
              map: null,
            };
          }
        }
      }

      return null;
    },

    handleHotUpdate(ctx: HmrContext) {
      // When a .psr file changes, invalidate the module and all its importers
      if (ctx.file.endsWith('.psr')) {
        console.log(`[pulsar] HMR: PSR file changed - ${ctx.file}`);
        console.log(`[pulsar] HMR: Found ${ctx.modules.length} modules`);

        // Invalidate all modules in the update context
        ctx.modules.forEach((module) => {
          console.log(`[pulsar] HMR: Invalidating module - ${module.url}`);
          ctx.server.moduleGraph.invalidateModule(module);
        });

        // Return undefined to let Vite handle full page reload
        return undefined;
      }
    },
  };
}

// Named export for convenience
export { pulsarPlugin };

// Default export
export default pulsarPlugin;
