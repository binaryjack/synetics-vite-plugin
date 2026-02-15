import { type HmrContext, type Plugin, transformWithEsbuild } from 'vite';

/**
 * Transform PSR file to TypeScript
 */
async function transformPSRFile(
  code: string,
  id: string,
  debug: boolean
): Promise<{ code: string; map: any } | null> {
  const startTime = performance.now();
  const fileName = id.split('/').pop();

  // Guard: Skip if already FULLY transformed
  // Check for header + reasonable indicators of transformation
  const hasHeader = code.includes('/* Pulsar v') && code.includes(' PSR */');

  // Check for runtime imports that only exist in transformed code
  const hasRuntimeImports = /import\s+{[^}]*\$REGISTRY[^}]*}\s+from\s+['"]@pulsar-framework\/pulsar\.dev['"]/.test(code) ||
                            /import\s+{[^}]*t_element[^}]*}\s+from\s+['"]@pulsar-framework\/pulsar\.dev['"]/.test(code) ||
                            /import\s+{[^}]*insert[^}]*}\s+from\s+['"]@pulsar-framework\/pulsar\.dev['"]/.test(code);

  if (hasHeader || hasRuntimeImports) {
    if (debug) {
      console.log(`[pulsar] ${fileName} already transformed (${code.length} bytes), skipping`);
    }
    return { code, map: null };
  }

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

    // PRE-TRANSFORMATION VALIDATION: Check for potential issues
    if (debug) {
      // Check for unsupported operators that might cause parsing failures
      const unsupportedPatterns = [
        { pattern: /<<(?!=)/g, name: '<<', msg: 'Left shift operator not yet supported' },
        { pattern: />>(?!=)/g, name: '>>', msg: 'Right shift operator not yet supported' },
        { pattern: />>>/g, name: '>>>', msg: 'Unsigned right shift not yet supported' },
        { pattern: /\*\*/g, name: '**', msg: 'Exponentiation operator not yet supported' },
      ];

      unsupportedPatterns.forEach(({ pattern, name, msg }) => {
        const matches = preprocessedCode.match(pattern);
        if (matches && matches.length > 0) {
          console.warn(
            `[pulsar] ⚠️  ${fileName}: Found ${matches.length} uses of '${name}' operator`
          );
          console.warn(`[pulsar]    ${msg} - transformation may fail`);
        }
      });
    }

    // Import the working transformer pipeline
    const { createPipeline } = await import('@pulsar-framework/transformer');

    if (debug) {
      console.log(`[pulsar] Creating transformation pipeline...`);
    }

    // Create pipeline
    const pipeline = createPipeline({
      debug,
      filePath: id,
    });

    if (debug) {
      console.log(`[pulsar] Running transformation pipeline...`);
    }

    // Transform using the proven pipeline
    const result = await pipeline.transform(preprocessedCode);

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    if (debug) {
      console.log(`[pulsar] Transformation complete in ${duration}ms`);
      console.log(`[pulsar] Output length: ${result.code.length} chars`);
      console.log(`[pulsar] Diagnostic count: ${result.diagnostics.length}`);

      // Show metrics
      if (result.metrics) {
        console.log(`[pulsar] METRICS:`);
        console.log(`[pulsar]   - Lexer:     ${result.metrics.lexerTime}ms`);
        console.log(`[pulsar]   - Parser:    ${result.metrics.parserTime}ms`);
        console.log(`[pulsar]   - Transform: ${result.metrics.transformTime}ms`);
        console.log(`[pulsar]   - Total:     ${result.metrics.totalTime}ms`);
      }

      // Debug transformation details
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

    // CRITICAL: Stop transformation if diagnostics contain errors
    const hasErrors = result.diagnostics.some((d) => d.type === 'error');
    if (hasErrors) {
      const errorMessages = result.diagnostics
        .filter((d) => d.type === 'error')
        .map((d) => `${d.phase}: ${d.message}`)
        .join('\n  - ');
      throw new Error(`PSR transformation failed for ${fileName}:\n  - ${errorMessages}`);
    }

    // VALIDATION: Check output quality before returning
    const outputCode = `/* Pulsar v${Date.now()} PSR */\n${result.code}`;
    const hasRegistry = outputCode.includes('$REGISTRY.execute');
    const hasExport = /export\s+(const|function)/.test(outputCode);
    const inputHasExport = /export\s+(component|function|const)/.test(code);

    // Error: Output too small (possible incomplete transformation)
    // Use relative check: output should be at least 30% of input size, or minimum 200 bytes
    const minOutputSize = Math.max(200, Math.floor(code.length * 0.3));
    if (outputCode.length < minOutputSize) {
      const msg = `Output too small: ${outputCode.length} bytes (expected > ${minOutputSize} based on input size ${code.length}). Incomplete transformation.`;
      console.error(`[pulsar] ❌ VALIDATION FAILED: ${fileName}`);
      console.error(`[pulsar]    ${msg}`);
      throw new Error(`PSR validation failed for ${fileName}: ${msg}`);
    }

    // Error: Missing exports
    if (inputHasExport && !hasExport) {
      const msg = "Input has exports but output doesn't. Transformation failed silently.";
      console.error(`[pulsar] ❌ VALIDATION FAILED: ${fileName}`);
      console.error(`[pulsar]    ${msg}`);
      throw new Error(`PSR validation failed for ${fileName}: ${msg}`);
    }

    // Warning: Missing $REGISTRY for components
    if (code.includes('export component') && !hasRegistry) {
      console.warn(`[pulsar] ⚠️  WARNING: ${fileName}`);
      console.warn(`[pulsar]    Component found but $REGISTRY.execute missing.`);
      console.warn(`[pulsar]    Component may not render correctly.`);
    }

    // Convert TypeScript to JavaScript (strip types, handle interfaces)
    // Use 'ts' loader to ensure TypeScript syntax is handled regardless of file extension
    const jsResult = await transformWithEsbuild(outputCode, fileName || id, {
      loader: 'ts',
      target: 'esnext',
      sourcemap: true,
    });

    if (debug) {
      console.log(`[pulsar] ESBuild transformation complete`);
      console.log(`  JS Output first 300 chars: ${jsResult.code.substring(0, 300)}...`);
    }

    return {
      code: jsResult.code,
      map: jsResult.map,
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

    // Return valid JS with error message instead of original PSR code
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Properly escape error message for HTML and JavaScript
    const escapedErrorMessage = errorMessage
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/`/g, '\\`') // Escape backticks for template literal
      .replace(/\${/g, '\\${') // Escape interpolation start
      .replace(/\n/g, '<br>')
      .replace(/\\/g, '\\\\'); // Escape backslashes too!

    const cleanFileName = JSON.stringify(fileName).slice(1, -1); 
    const jsonFileName = JSON.stringify(fileName);
    const jsonError = JSON.stringify(errorMessage);

    const errorComponentCode = `
/* Pulsar v${Date.now()} - PSR Transform failed */
console.error('[Pulsar] Transformation failed for ' + ${jsonFileName});
console.error('[Pulsar] Error:', ${jsonError});

export default function() {
  const div = document.createElement('div');
  div.style.cssText = 'padding: 20px; background: #fee; border: 2px solid #f00; border-radius: 8px; color: #c00; font-family: monospace; z-index: 9999; position: relative;';
  
  // Use concatenation instead of template literal for innerHTML content to avoid nesting issues
  const header = '<h3>⚠️ PSR Transformation Error</h3>';
  const fileInfo = '<p><strong>' + ${jsonFileName} + '</strong></p>';
  const errorInfo = '<pre style="background:#fff;padding:10px;overflow:auto;white-space:pre-wrap;border:1px solid #ddd;">' + \`${escapedErrorMessage}\` + '</pre>';
  
  div.innerHTML = header + fileInfo + errorInfo;
  return div;
}
`;
    
    // Log the generated error component code for debugging
    if (debug) {
      console.log('[pulsar] ERROR COMPONENT CODE:', errorComponentCode);
    }

    // Transform with esbuild to ensure syntax validity (optional but good practice)
    try {
      const result = await transformWithEsbuild(errorComponentCode, fileName || 'error.js', {
        loader: 'ts',
        target: 'esnext'
      });
      return { code: result.code, map: result.map };
    } catch (e) {
      console.error('[pulsar] Failed to transform error component code:', e);
      // Fallback to raw string if even esbuild fails on it
      return { code: errorComponentCode, map: null };
    }
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

      // Only resolve when there's an importer (relative imports)
      if (!importer) {
        return null;
      }

      const fs = await import('fs/promises');
      const path = await import('path');

      // If source is .psr, resolve it NOW (don't let Vite handle it)
      if (cleanSource.endsWith('.psr')) {
        console.log(`[pulsar] resolveId: Resolving .psr "${cleanSource}"`);
        console.log(`[pulsar]   From: ${importer}`);

        try {
          const importerDir = path.dirname(importer);
          const psrPath = path.resolve(importerDir, cleanSource);

          // Check if file exists
          await fs.access(psrPath);

          console.log(`[pulsar]   ✓ Resolved to: ${psrPath}`);

          return psrPath;
        } catch {
          return null;
        }
      }

      // Check if this is a .js import that should resolve to .psr
      // (Transformer converts .psr imports to .js for browser compatibility)
      const isTransformedJsImport = cleanSource.endsWith('.js');

      // Skip if source already has another extension (but allow .js to pass through for .psr resolution)
      if (!isTransformedJsImport && /\.(tsx?|jsx?|mjs|cjs|json|css|scss|less)$/.test(cleanSource)) {
        return null;
      }

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

      // ALWAYS log .psr requests to debug
      if (cleanId.endsWith('.psr')) {
        const fileName = cleanId.split('/').pop() || cleanId.split('\\').pop() || cleanId;
        console.log(`[pulsar] load() called for: ${fileName}`);
        console.log(`[pulsar]   Full ID: ${id}`);
        console.log(`[pulsar]   Clean ID: ${cleanId}`);
        console.log(`[pulsar]   Query: ${query || 'none'}`);
      }

      if (!cleanId.endsWith('.psr')) {
        return null;
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
      // CRITICAL: Transform .psr files if load() hook didn't catch them
      // This is a fallback for when Vite routes .psr files through transform instead of load
      const [cleanId] = id.split('?', 2);
      if (cleanId.endsWith('.psr')) {
        // GUARD: Skip if code is already transformed (prevent double transformation)
        const isAlreadyTransformed = /import\s+{[^}]*\$REGISTRY[^}]*}\s+from\s+['"]@pulsar-framework\/pulsar\.dev['"]/.test(code) ||
                                      /import\s+{[^}]*t_element[^}]*}\s+from\s+['"]@pulsar-framework\/pulsar\.dev['"]/.test(code);
        
        if (isAlreadyTransformed) {
          if (debug) {
            const fileName = cleanId.split('/').pop() || cleanId.split('\\').pop() || cleanId;
            console.log(`[pulsar] transform() hook: ${fileName} already transformed, skipping`);
          }
          return null; // Let Vite use the already-transformed code
        }
        
        if (debug) {
          const fileName = cleanId.split('/').pop() || cleanId.split('\\').pop() || cleanId;
          console.log(
            `[pulsar] transform() hook triggered for: ${fileName} (FALLBACK - load() didn't catch it)`
          );
        }
        // Transform the PSR file
        return await transformPSRFile(code, cleanId, debug);
      }

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

        if (debug) {
          console.log(`[pulsar] HMR: PSR file changed, invalidating ${ctx.file}`);
        }

        // Return modules to update (let Vite handle the HMR)
        return ctx.modules;
      }
    },
  };
}

/**
 * Ensures PSR type declarations exist in the project
 * Creates src/types/psr-modules.d.ts if missing
 *
 * @remarks
 * This is a fallback mechanism. In most cases, the types from
 * @pulsar-framework/pulsar.dev are automatically available.
 * This function only creates a local file if:
 * 1. The framework types aren't being picked up by TypeScript
 * 2. The user wants a local copy they can customize
 *
 * @param projectRoot - Absolute path to project root
 * @param debug - Whether to log debug information
 */
async function ensurePSRTypeDeclarations(projectRoot: string, debug: boolean): Promise<void> {
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const typesDir = path.resolve(projectRoot, 'src/types');
    const typesFile = path.resolve(typesDir, 'psr-modules.d.ts');

    // Check if file already exists
    try {
      await fs.access(typesFile);
      if (debug) {
        console.log('[pulsar] PSR type declarations already exist:', typesFile);
      }
      return;
    } catch {
      // File doesn't exist, create it
    }

    // Check if @pulsar-framework/pulsar.dev is installed
    // If it is, types should be automatic - but we'll create a local copy anyway
    // as a fallback or for users who want to customize
    try {
      await fs.mkdir(typesDir, { recursive: true });
      await fs.writeFile(typesFile, PSR_TYPE_DECLARATION, 'utf-8');

      console.log('[pulsar] ✅ Created PSR type declarations: src/types/psr-modules.d.ts');
      console.log('[pulsar] 💡 This enables TypeScript support for .psr file imports');

      if (debug) {
        console.log(
          '[pulsar] Note: @pulsar-framework/pulsar.dev includes these types automatically.'
        );
        console.log('[pulsar] This file exists as a fallback or for customization.');
      }
    } catch (error) {
      if (debug) {
        console.warn('[pulsar] ⚠️ Could not create PSR type declarations:', error);
        console.warn('[pulsar] TypeScript support will rely on @pulsar-framework/pulsar.dev types');
      }
    }
  } catch (error) {
    // Silent fail - not critical, types should come from framework package
    if (debug) {
      console.warn('[pulsar] Type declaration check failed:', error);
    }
  }
}

// Named export for convenience
export { pulsarPlugin };

// Default export
export default pulsarPlugin;
