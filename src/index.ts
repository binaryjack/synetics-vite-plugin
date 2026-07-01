import { type HmrContext, type Plugin, transformWithEsbuild } from 'vite';

/** Virtual module ID for the devtools client */
const DEVTOOLS_VIRTUAL_ID = 'virtual:synetics-devtools';
const RESOLVED_DEVTOOLS_VIRTUAL_ID = '\0' + DEVTOOLS_VIRTUAL_ID;

/** Inline browser client injected by Vite in dev mode */
const DEVTOOLS_CLIENT_CODE = `
(function() {
  if (typeof window === 'undefined') return;
  if (window.__SYNETICS_DEVTOOLS__) return;

  const TRACE_PORT = 9339;
  const SESSION_ID = 'browser-' + Date.now();

  const events = [];
  let panel = null;
  let visible = false;

  function createPanel() {
    const el = document.createElement('div');
    el.id = '__pulsar-devtools__';
    el.style.cssText = 'position:fixed;bottom:0;right:0;width:400px;max-height:340px;background:#0f1117;color:#e2e8f0;font-family:monospace;font-size:11px;border-top:2px solid #7c3aed;border-left:2px solid #7c3aed;border-radius:6px 0 0 0;z-index:99999;display:none;flex-direction:column;overflow:hidden;box-shadow:-4px -4px 20px rgba(124,58,237,0.3);';
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#1e1b4b;border-bottom:1px solid #312e81;flex-shrink:0;"><span style="color:#a78bfa;font-weight:bold;">⚡ PULSAR DevTools</span><div style="display:flex;gap:6px;"><button id="__pulsar-clear__" style="background:#312e81;border:none;color:#c4b5fd;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:10px;">clear</button><button id="__pulsar-close__" style="background:#312e81;border:none;color:#c4b5fd;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:10px;">✕</button></div></div><div id="__pulsar-log__" style="overflow-y:auto;flex:1;padding:4px 0;"></div><div style="padding:4px 10px;background:#1e1b4b;border-top:1px solid #312e81;font-size:9px;color:#4c1d95;flex-shrink:0;">Alt+P to toggle</div>';
    document.body.appendChild(el);
    el.querySelector('#__pulsar-close__').addEventListener('click', hide);
    el.querySelector('#__pulsar-clear__').addEventListener('click', function() {
      el.querySelector('#__pulsar-log__').innerHTML = '';
      events.length = 0;
    });
    return el;
  }

  const CHANNEL_COLOR = { signal:'#34d399', component:'#60a5fa', transformer:'#f472b6', vite:'#fbbf24', lifecycle:'#a78bfa', error:'#f87171' };

  function appendRow(event) {
    if (!panel) return;
    const log = panel.querySelector('#__pulsar-log__');
    const ts = new Date(event.timestamp).toISOString().slice(11,23);
    const color = CHANNEL_COLOR[event.channel] || '#94a3b8';
    const row = document.createElement('div');
    row.style.cssText = 'padding:2px 10px;border-bottom:1px solid #1a1a2e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    
    let dataStr = '';
    if (event.data) {
      if (event.channel === 'signal' && event.type === 'update') {
        let prev = typeof event.data.prev === 'object' ? JSON.stringify(event.data.prev) : String(event.data.prev);
        let next = typeof event.data.next === 'object' ? JSON.stringify(event.data.next) : String(event.data.next);
        if (prev.length > 20) prev = prev.slice(0, 20) + '...';
        if (next.length > 20) next = next.slice(0, 20) + '...';
        dataStr = ' <span style="color:#fbbf24; font-size:10px;">' + prev + ' ➔ ' + next + '</span>';
      } else {
        try { dataStr = ' <span style="color:#94a3b8; font-size:10px;">' + JSON.stringify(event.data) + '</span>'; } catch(e){}
      }
    }
    
    row.innerHTML = '<span style="color:#475569;">' + ts + '</span> <span style="color:' + color + ';">[' + event.channel + ']</span> <span style="color:#e2e8f0;">' + event.type + '</span>' + (event.name ? ' <span style="color:#94a3b8;">' + event.name + '</span>' : '') + dataStr;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 200) log.removeChild(log.firstChild);
  }

  function show() { visible = true; if (panel) panel.style.display = 'flex'; }
  function hide() { visible = false; if (panel) panel.style.display = 'none'; }
  function toggle() { visible ? hide() : show(); }

  function emit(event) {
    events.push(event);
    if (events.length > 500) events.shift();
    if (visible) appendRow(event);
    // fetch('http://localhost:' + TRACE_PORT, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ events: [event], source: 'browser', sessionId: SESSION_ID })
    // }).catch(function() {});
  }

  document.addEventListener('DOMContentLoaded', function() {
    panel = createPanel();
  });

  document.addEventListener('keydown', function(e) {
    if (e.altKey && e.key === 'p') toggle();
  });

  window.addEventListener('synetics:signal-update', function(e) {
    const detail = e.detail;
    emit({
      timestamp: Date.now(),
      channel: 'signal',
      type: 'update',
      name: detail.id,
      data: { prev: detail.prevValue, next: detail.newValue }
    });
  });

  window.__SYNETICS_DEVTOOLS__ = { emit: emit, show: show, hide: hide, toggle: toggle };
  console.log('[Synetics DevTools] Loaded — Alt+P to toggle overlay');
})();
`;

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
  const hasRuntimeImports =
    /import\s+{[^}]*\$REGISTRY[^}]*}\s+from\s+['"]@synetics\/pulsar\.dev['"]/.test(code) ||
    /import\s+{[^}]*t_element[^}]*}\s+from\s+['"]@synetics\/pulsar\.dev['"]/.test(code) ||
    /import\s+{[^}]*insert[^}]*}\s+from\s+['"]@synetics\/pulsar\.dev['"]/.test(code);

  if (hasHeader || hasRuntimeImports) {
    if (debug) {
      console.log(`[synetics] ${fileName} already transformed (${code.length} bytes), skipping`);
    }
    return { code, map: null };
  }

  if (debug) {
    console.log(`\n[synetics] ========== TRANSFORMATION START: ${fileName} ==========`);
    console.log(`[synetics] File path: ${id}`);
    console.log(`[synetics] Input length: ${code.length} chars`);
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
      console.log(`[synetics] Preprocessing complete`);
      console.log(`[synetics] Preprocessed length: ${preprocessedCode.length} chars`);
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
            `[synetics] ⚠️  ${fileName}: Found ${matches.length} uses of '${name}' operator`
          );
          console.warn(`[synetics]    ${msg} - transformation may fail`);
        }
      });
    }

    // Import the working transformer pipeline
    const { createPipeline } = await import('@synetics/transformer');

    if (debug) {
      console.log(`[synetics] Creating transformation pipeline...`);
    }

    // Create pipeline
    const pipeline = createPipeline({
      debug,
      filePath: id,
    });

    if (debug) {
      console.log(`[synetics] Running transformation pipeline...`);
    }

    // Transform using the proven pipeline
    const result = await pipeline.transform(preprocessedCode);

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    if (debug) {
      console.log(`[synetics] Transformation complete in ${duration}ms`);
      console.log(`[synetics] Output length: ${result.code.length} chars`);
      console.log(`[synetics] Diagnostic count: ${result.diagnostics.length}`);

      // Show metrics
      if (result.metrics) {
        console.log(`[synetics] METRICS:`);
        console.log(`[synetics]   - Lexer:     ${result.metrics.lexerTime}ms`);
        console.log(`[synetics]   - Parser:    ${result.metrics.parserTime}ms`);
        console.log(`[synetics]   - Transform: ${result.metrics.transformTime}ms`);
        console.log(`[synetics]   - Total:     ${result.metrics.totalTime}ms`);
      }

      // Debug transformation details
      console.log(`\n[synetics] DEBUG TRANSFORMATION for ${fileName}:`);
      console.log(`  Input first 300 chars: ${preprocessedCode.substring(0, 300)}...`);
      console.log(`  Output first 300 chars: ${result.code.substring(0, 300)}...`);
      console.log(`  Has .syn in input: ${/\.syn['"]/.test(preprocessedCode)}`);
      console.log(`  Has .js in output: ${/\.js['"]/.test(result.code)}`);
      console.log(`[synetics] ========== TRANSFORMATION END: ${fileName} ==========\n`);
    }

    if (debug || result.diagnostics.some((d) => d.type === 'error')) {
      console.log(`[synetics] ⚡ PSR: ${fileName} transformed in ${duration}ms`);
      if (result.diagnostics.length > 0) {
        result.diagnostics.forEach((diag) => {
          const level = diag.type === 'error' ? '❌' : diag.type === 'warning' ? '⚠️' : 'ℹ️';
          console.log(`[synetics]   ${level} ${diag.phase}: ${diag.message}`);
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
      console.error(`[synetics] ❌ VALIDATION FAILED: ${fileName}`);
      console.error(`[synetics]    ${msg}`);
      throw new Error(`PSR validation failed for ${fileName}: ${msg}`);
    }

    // Error: Missing exports
    if (inputHasExport && !hasExport) {
      const msg = "Input has exports but output doesn't. Transformation failed silently.";
      console.error(`[synetics] ❌ VALIDATION FAILED: ${fileName}`);
      console.error(`[synetics]    ${msg}`);
      throw new Error(`PSR validation failed for ${fileName}: ${msg}`);
    }

    // Warning: Missing $REGISTRY for components
    if (code.includes('export component') && !hasRegistry) {
      console.warn(`[synetics] ⚠️  WARNING: ${fileName}`);
      console.warn(`[synetics]    Component found but $REGISTRY.execute missing.`);
      console.warn(`[synetics]    Component may not render correctly.`);
    }

    // Embed the PSR→TS sourcemap inline so esbuild can chain PSR→TS→JS
    // automatically — debuggers get full fidelity back to the original .syn file.
    let tsCodeForEsbuild = outputCode;
    if (result.map) {
      const mapBase64 = Buffer.from(JSON.stringify(result.map)).toString('base64');
      tsCodeForEsbuild += `\n//# sourceMappingURL=data:application/json;base64,${mapBase64}`;
    }

    // Convert TypeScript to JavaScript (strip types, handle interfaces).
    // sourcemap:true + the inline input sourcemap → esbuild chains them automatically.
    const jsResult = await transformWithEsbuild(tsCodeForEsbuild, fileName || id, {
      loader: 'ts',
      target: 'esnext',
      sourcemap: true,
    });

    if (debug) {
      console.log(`[synetics] ESBuild transformation complete`);
      console.log(`  JS Output first 300 chars: ${jsResult.code.substring(0, 300)}...`);
    }

    return {
      code: jsResult.code,
      map: jsResult.map,
    };
  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(2);
    console.error(`[synetics] PSR Error transforming ${fileName} (after ${duration}ms):`, error);

    if (debug && error instanceof Error) {
      console.error(`[synetics] Error stack:`, error.stack);
      console.error(`[synetics] Error details:`, {
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
console.error('[Synetics] Transformation failed for ' + ${jsonFileName});
console.error('[Synetics] Error:', ${jsonError});

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
      console.log('[synetics] ERROR COMPONENT CODE:', errorComponentCode);
    }

    // Transform with esbuild to ensure syntax validity (optional but good practice)
    try {
      const result = await transformWithEsbuild(errorComponentCode, fileName || 'error.js', {
        loader: 'ts',
        target: 'esnext',
      });
      return { code: result.code, map: result.map };
    } catch (e) {
      console.error('[synetics] Failed to transform error component code:', e);
      // Fallback to raw string if even esbuild fails on it
      return { code: errorComponentCode, map: null };
    }
  }
}

/**
 * Vite plugin for Synetics framework
 * Transforms TSX syntax into direct DOM manipulation using the pulsar transformer
 * Now with enhanced dependency resolution for component imports
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vite'
 * import { syneticsPlugin } from '@pulsar/vite-plugin'
 *
 * export default defineConfig({
 *   plugins: [syneticsPlugin()]
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

  /**
   * Enable Synetics DevTools browser overlay in dev mode
   * Injects floating panel + posts events to VS Code tracer on port 9339
   * @default true
   */
  devtools?: boolean;
}

const PLUGIN_VERSION = Date.now(); // Version changes on every server restart

/**
 * Generic PSR module declaration template
 * This provides TypeScript support for importing .syn files
 */
const PSR_TYPE_DECLARATION = `/**
 * TypeScript declarations for .syn files
 * Auto-generated by @synetics/vite-plugin
 * 
 * Wildcard allows any named exports from .syn files.
 * Use: import { ComponentName } from './file.syn'
 */
declare module '*.syn';
`;

function syneticsPlugin(options: PulsarPluginOptions = {}): Plugin {
  const { debug = false, autoInjectHMR = true, devtools = true } = options;

  let projectRoot = '';
  let isDevMode = true;

  return {
    name: 'synetics-vite-plugin',
    enforce: 'pre',

    async configResolved(config) {
      isDevMode = config.command === 'serve';
      projectRoot = config.root;
    },

    transformIndexHtml() {
      if (!devtools || !isDevMode) return [];
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: `/@id/${DEVTOOLS_VIRTUAL_ID}` },
          injectTo: 'head',
        },
      ];
    },

    async resolveId(source: string, importer: string | undefined) {
      // Handle devtools virtual module first
      if (source === DEVTOOLS_VIRTUAL_ID) return RESOLVED_DEVTOOLS_VIRTUAL_ID;
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

      // If source is .syn, resolve it NOW (don't let Vite handle it)
      if (cleanSource.endsWith('.syn')) {
        console.log(`[synetics] resolveId: Resolving .syn "${cleanSource}"`);
        console.log(`[synetics]   From: ${importer}`);

        try {
          const importerDir = path.dirname(importer);
          const psrPath = path.resolve(importerDir, cleanSource);

          // Check if file exists
          await fs.access(psrPath);

          console.log(`[synetics]   ✓ Resolved to: ${psrPath}`);

          return psrPath;
        } catch {
          return null;
        }
      }

      // Check if this is a .js import that should resolve to .syn
      // (Transformer converts .syn imports to .js for browser compatibility)
      const isTransformedJsImport = cleanSource.endsWith('.js');

      // Skip if source already has another extension (but allow .js to pass through for .syn resolution)
      if (!isTransformedJsImport && /\.(tsx?|jsx?|mjs|cjs|json|css|scss|less)$/.test(cleanSource)) {
        return null;
      }

      try {
        // Resolve relative to importer
        const importerDir = path.dirname(importer);

        // Determine the .syn path to check
        // If source ends with .js, replace it with .syn (transformed imports)
        // Otherwise, append .syn (extensionless imports)
        const psrSource = cleanSource.endsWith('.js')
          ? cleanSource.replace(/\.js$/, '.syn')
          : `${cleanSource}.syn`;
        const possiblePsrPath = path.resolve(importerDir, psrSource);

        // Check if .syn file exists
        await fs.access(possiblePsrPath);

        if (debug) {
          console.log(`[synetics] resolveId: Found .syn file for import "${cleanSource}"`);
          console.log(`[synetics]   Importer: ${importer}`);
          console.log(`[synetics]   Resolved: ${possiblePsrPath}`);
        }

        return possiblePsrPath;
      } catch {
        // .syn file doesn't exist, let Vite try normal resolution
        return null;
      }
    },

    async load(id: string) {
      // Handle devtools virtual module first
      if (id === RESOLVED_DEVTOOLS_VIRTUAL_ID) {
        return { code: DEVTOOLS_CLIENT_CODE, map: null };
      }

      // Use load hook instead of transform to process .syn files BEFORE Vite's import analysis
      // This prevents "Failed to parse source for import analysis" errors

      // Strip query parameters before checking extension
      const [cleanId, query] = id.split('?', 2);

      // ALWAYS log .syn requests to debug
      if (cleanId.endsWith('.syn')) {
        const fileName = cleanId.split('/').pop() || cleanId.split('\\').pop() || cleanId;
        console.log(`[synetics] load() called for: ${fileName}`);
        console.log(`[synetics]   Full ID: ${id}`);
        console.log(`[synetics]   Clean ID: ${cleanId}`);
        console.log(`[synetics]   Query: ${query || 'none'}`);
      }

      if (!cleanId.endsWith('.syn')) {
        return null;
      }

      // Read the file content
      const fs = await import('fs/promises');
      const path = await import('path');

      let absolutePath: string;
      if (path.isAbsolute(cleanId)) {
        absolutePath = cleanId;
      } else {
        // If it starts with / but is not absolute (e.g. vite's special resolution), or it's just relative
        let resolvedPath = cleanId;
        if (resolvedPath.startsWith('/')) {
          resolvedPath = resolvedPath.substring(1); // Remove leading /
        }
        absolutePath = path.resolve(projectRoot, resolvedPath);
      }

      if (debug) {
        console.log(`[synetics]   Resolved: ${absolutePath}`);
      }

      try {
        const code = await fs.readFile(absolutePath, 'utf-8');
        // Transform PSR file to TypeScript before Vite analyzes imports
        return await transformPSRFile(code, absolutePath, debug);
      } catch (error) {
        console.error(`[synetics] PSR Error reading file ${cleanId}:`, error);
        return null;
      }
    },

    async transform(code: string, id: string) {
      // CRITICAL: Transform .syn files if load() hook didn't catch them
      // This is a fallback for when Vite routes .syn files through transform instead of load
      const [cleanId] = id.split('?', 2);
      if (cleanId.endsWith('.syn')) {
        // GUARD: Skip if code is already transformed (prevent double transformation)
        const isAlreadyTransformed =
          /import\s+{[^}]*\$REGISTRY[^}]*}\s+from\s+['"]@synetics\/pulsar\.dev['"]/.test(
            code
          ) ||
          /import\s+{[^}]*t_element[^}]*}\s+from\s+['"]@synetics\/pulsar\.dev['"]/.test(
            code
          );

        if (isAlreadyTransformed) {
          if (debug) {
            const fileName = cleanId.split('/').pop() || cleanId.split('\\').pop() || cleanId;
            console.log(`[synetics] transform() hook: ${fileName} already transformed, skipping`);
          }
          return null; // Let Vite use the already-transformed code
        }

        if (debug) {
          const fileName = cleanId.split('/').pop() || cleanId.split('\\').pop() || cleanId;
          console.log(
            `[synetics] transform() hook triggered for: ${fileName} (FALLBACK - load() didn't catch it)`
          );
        }
        // Transform the PSR file
        return await transformPSRFile(code, cleanId, debug);
      }

      // Auto-inject HMR for pulse() calls in main.ts/main.tsx
      if (autoInjectHMR && isDevMode && /main\.(ts|tsx|js|jsx)$/.test(id)) {
        // Check if file contains pulse() call and has PSR component import
        const hasPulse = /\bpulse\s*\(/.test(code);
        const psrImportMatch = code.match(/import\s+{([^}]+)}\s+from\s+['"](.+\.syn)['"]/);

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
// Auto-injected HMR by synetics-vite-plugin
if (import.meta.hot) {
  import.meta.hot.accept('${psrPath}', async (newModule) => {
    if (newModule) {
      const { getCurrentAppRoot } = await import('@synetics/synetics.dev');
      const app = getCurrentAppRoot();
      if (app) {
        await app.unmount();
        await app.mount(newModule.${componentName}());
      }
    }
  });
  import.meta.hot.accept();
}`;

            if (debug) {
              console.log(`[synetics] Auto-injecting HMR for ${id}`);
              console.log(`[synetics]   Component: ${componentName}`);
              console.log(`[synetics]   PSR file: ${psrPath}`);
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
      // When a .syn file changes, invalidate the module and all its importers
      if (ctx.file.endsWith('.syn')) {
        console.log(`[synetics] HMR: PSR file changed - ${ctx.file}`);
        console.log(`[synetics] HMR: Found ${ctx.modules.length} modules`);

        // Invalidate all modules in the update context
        ctx.modules.forEach((module) => {
          console.log(`[synetics] HMR: Invalidating module - ${module.url}`);
          ctx.server.moduleGraph.invalidateModule(module);
        });

        if (debug) {
          console.log(`[synetics] HMR: PSR file changed, invalidating ${ctx.file}`);
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
 * @synetics/synetics.dev are automatically available.
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
        console.log('[synetics] PSR type declarations already exist:', typesFile);
      }
      return;
    } catch {
      // File doesn't exist, create it
    }

    // Check if @synetics/synetics.dev is installed
    // If it is, types should be automatic - but we'll create a local copy anyway
    // as a fallback or for users who want to customize
    try {
      await fs.mkdir(typesDir, { recursive: true });
      await fs.writeFile(typesFile, PSR_TYPE_DECLARATION, 'utf-8');

      console.log('[synetics] ✅ Created PSR type declarations: src/types/psr-modules.d.ts');
      console.log('[synetics] 💡 This enables TypeScript support for .syn file imports');

      if (debug) {
        console.log(
          '[synetics] Note: @synetics/synetics.dev includes these types automatically.'
        );
        console.log('[synetics] This file exists as a fallback or for customization.');
      }
    } catch (error) {
      if (debug) {
        console.warn('[synetics] ⚠️ Could not create PSR type declarations:', error);
        console.warn('[synetics] TypeScript support will rely on @synetics/synetics.dev types');
      }
    }
  } catch (error) {
    // Silent fail - not critical, types should come from framework package
    if (debug) {
      console.warn('[synetics] Type declaration check failed:', error);
    }
  }
}

// Named export for convenience
export { syneticsPlugin };

// Default export
export default syneticsPlugin;
