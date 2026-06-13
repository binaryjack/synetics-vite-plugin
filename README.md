<img src="https://raw.githubusercontent.com/binaryjack/synetics-design-system/main/art-kit/SVG/pulsar-logo.svg" alt="Pulsar" width="400"/>

# @pulsar/vite-plugin

Vite plugin that integrates the Pulsar transformer into your build process, converting TSX syntax into direct DOM manipulation.

<p align="center">
  <strong><a href="https://www.linkedin.com/in/tadeopiana/">follow me</a></strong>
</p>

## Features

- ✅ **Zero-config integration** - Works out of the box with Vite
- ✅ **Automatic TSX transformation** - Converts all `.tsx` files
- ✅ **Fast HMR** - Hot Module Replacement support
- ✅ **TypeScript support** - Full type checking during build
- ✅ **Development warnings** - Detects untransformed JSX in dev mode
- ✅ **Production optimized** - Strips debug code in production builds
- ✅ Seamless integration with Pulsar transformer

## Installation

```bash
pnpm add -D @pulsar/vite-plugin
```

## Usage

Add the plugin to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import { syneticsPlugin } from '@pulsar/vite-plugin';

export default defineConfig({
  plugins: [syneticsPlugin()],
});
```

That's it! The plugin will automatically:

1. Transform all `.tsx` files using the Pulsar transformer
2. Convert JSX into direct DOM operations
3. Enable fine-grained reactive updates
4. Provide fast HMR during development

## How It Works

The plugin integrates into Vite's transform pipeline:

1. **File Detection**: Identifies `.tsx` files
2. **TypeScript Compilation**: Creates TypeScript program with JSX preserved
3. **Transformation**: Applies Pulsar transformer to convert JSX → DOM
4. **Validation**: Checks for any remaining JSX nodes (dev mode)
5. **Output**: Returns transformed JavaScript code

### Before Transformation

```tsx
const Counter = () => {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count()}</button>;
};
```

### After Transformation

```javascript
const Counter = () => {
  const [count, setCount] = useState(0);
  const el = document.createElement('button');
  el.addEventListener('click', () => setCount(count + 1));

  const textNode = document.createTextNode('');
  createEffect(() => {
    textNode.textContent = String(count());
  });
  el.appendChild(textNode);

  return el;
};
```

## Configuration Options

### Basic Configuration

The plugin works with zero configuration, but offers several options for customization:

```typescript
export interface PulsarPluginOptions {
  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * Specify which debug channels to enable
   * If not specified, all channels are enabled when debug is true
   * @default undefined (all channels)
   */
  debugChannels?: DebugChannel[];

  /**
   * Enable dependency resolution for component imports
   * @default false
   * @deprecated This option is not yet implemented
   */
  enableDependencyResolution?: boolean;
}

type DebugChannel =
  | 'lexer' // Token generation
  | 'parser' // AST building
  | 'analyzer' // IR generation
  | 'transform' // IR optimization
  | 'emitter' // Code generation
  | 'validator' // Output validation
  | 'pipeline'; // High-level orchestration
```

### Debug Channels

Debug channels allow you to filter transformation logs by pipeline phase, reducing noise and focusing on specific areas:

```typescript
// Example 1: Show only code generation and validation
syneticsPlugin({
  debug: true,
  debugChannels: ['emitter', 'validator'],
});

// Example 2: Debug parsing issues
syneticsPlugin({
  debug: true,
  debugChannels: ['lexer', 'parser'],
});

// Example 3: Performance monitoring
syneticsPlugin({
  debug: true,
  debugChannels: ['pipeline'],
});

// Example 4: All channels (default when debug is true)
syneticsPlugin({
  debug: true,
  // All channels enabled by default
});
```

### Debug Channel Guide

| Channel     | What It Shows                     | When to Use                |
| ----------- | --------------------------------- | -------------------------- |
| `lexer`     | Token generation (PSR → tokens)   | Syntax parsing issues      |
| `parser`    | AST building (tokens → AST)       | Component detection issues |
| `analyzer`  | IR generation (AST → IR)          | Logic analysis issues      |
| `transform` | IR optimization                   | Optimization issues        |
| `emitter`   | Code generation (IR → TypeScript) | Output code issues         |
| `validator` | Output validation                 | Quality/correctness issues |
| `pipeline`  | High-level orchestration          | Overall flow issues        |

### Practical Debug Scenarios

#### Scenario 1: \"Why isn't my component transforming?\"

```typescript
syneticsPlugin({
  debug: true,
  debugChannels: ['parser', 'pipeline'],
});
```

Look for:

- `[PARSER] AST created with X nodes` - Check node count
- `[PIPELINE] Found PSR components` or `No PSR components found`

#### Scenario 2: \"The generated code looks wrong\"

```typescript
syneticsPlugin({
  debug: true,
  debugChannels: ['emitter', 'validator'],
});
```

Look for:

- `[EMITTER] Generated X lines of code` - Check line count
- `[VALIDATOR] Validation: X errors, Y warnings` - Check for issues

#### Scenario 3: \"Transformation is slow\"

```typescript
syneticsPlugin({
  debug: true,
  debugChannels: ['pipeline'],
});
```

Look for:

- `[PIPELINE] Transformation complete` with `{ totalTime: Xms }`
- Compare times across files to identify bottlenecks

#### Scenario 4: \"I need to see everything\"

```typescript
syneticsPlugin({
  debug: true,
  // Omit debugChannels to enable all
});
```

See the complete transformation pipeline for deep debugging.

## Development Mode

### Debug Output

With `debug: true`, the plugin provides detailed transformation logs:

```bash
# File detection
[synetics] transform() called for: Counter.syn (PSR - WILL TRANSFORM)

# Full pipeline (all channels enabled)
[2026-02-06T18:39:41.143Z] [PIPELINE] Starting transformation (+0ms)
[2026-02-06T18:39:41.143Z] [LEXER] Tokenizing source (+0ms)
[2026-02-06T18:39:41.144Z] [LEXER] Generated 31 tokens (+1ms)
[2026-02-06T18:39:41.144Z] [PARSER] Building AST (+1ms)
[2026-02-06T18:39:41.145Z] [PARSER] AST created with 2 nodes (+2ms)
[2026-02-06T18:39:41.145Z] [ANALYZER] Building IR (+2ms)
[2026-02-06T18:39:41.145Z] [ANALYZER] IR generated (+2ms)
[2026-02-06T18:39:41.146Z] [TRANSFORM] Optimizing IR (+3ms)
[2026-02-06T18:39:41.146Z] [TRANSFORM] IR optimization complete (+3ms)
[2026-02-06T18:39:41.146Z] [EMITTER] Generating TypeScript (+3ms)
[2026-02-06T18:39:41.147Z] [EMITTER] Generated 9 lines of code (+4ms)
[2026-02-06T18:39:41.147Z] [VALIDATOR] Validating output (+4ms)
[2026-02-06T18:39:41.148Z] [VALIDATOR] Validation: 0 errors, 0 warnings (+4ms)
[2026-02-06T18:39:41.148Z] [PIPELINE] Transformation complete (+5ms)

# Summary
[synetics] ⚡ PSR: Counter.syn transformed in 4.91ms
[synetics]   ℹ️ lexer: Lexer: 31 tokens generated
[synetics]   ℹ️ parser: Parser: AST with 2 nodes
[synetics]   ℹ️ analyzer: Analyzer: IR generated
[synetics]   ℹ️ transform: Transform: IR pass-through
[synetics]   ℹ️ emitter: Emitter: 9 lines generated
```

### Filtered Debug Output

With `debugChannels`, you see only the phases you care about:

```typescript
// Config: debugChannels: ['emitter', 'validator']
```

```bash
[synetics] transform() called for: Counter.syn (PSR - WILL TRANSFORM)
[2026-02-06T18:39:41.146Z] [EMITTER] Generating TypeScript (+3ms)
[2026-02-06T18:39:41.147Z] [EMITTER] Generated 9 lines of code (+4ms)
[2026-02-06T18:39:41.147Z] [VALIDATOR] Validating output (+4ms)
[2026-02-06T18:39:41.148Z] [VALIDATOR] Validation: 0 errors, 0 warnings (+4ms)
[synetics] ⚡ PSR: Counter.syn transformed in 4.91ms
[synetics]   ℹ️ lexer: Lexer: 31 tokens generated
[synetics]   ℹ️ parser: Parser: AST with 2 nodes
[synetics]   ℹ️ analyzer: Analyzer: IR generated
[synetics]   ℹ️ transform: Transform: IR pass-through
[synetics]   ℹ️ emitter: Emitter: 9 lines generated
```

**Result:** 70% less console noise! 🎯

## Integration with Vite

The plugin integrates seamlessly with Vite features:

### Hot Module Replacement (HMR)

```typescript
// Automatic HMR - no configuration needed
if (import.meta.hot) {
  import.meta.hot.accept();
}
```

### Build Optimization

```typescript
export default defineConfig({
  plugins: [syneticsPlugin()],
  build: {
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['pulsar'],
        },
      },
    },
  },
});
```

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxFactory": "jsx",
    "jsxFragmentFactory": "Fragment",
    "jsxImportSource": "pulsar"
  }
}
```

## Complete Example

**vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { syneticsPlugin } from '@pulsar/vite-plugin';
import { resolve } from 'path';

export default defineConfig({
  plugins: [syneticsPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['pulsar', 'pulsar/reactivity', 'pulsar/hooks', 'pulsar/jsx-runtime'],
  },
  esbuild: {
    jsxFactory: 'jsx',
    jsxFragment: 'Fragment',
    jsxInject: `import { jsx, Fragment } from 'pulsar/jsx-runtime'`,
  },
});
```

**tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "jsx": "preserve",
    "jsxFactory": "jsx",
    "jsxFragmentFactory": "Fragment",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

## Troubleshooting

### JSX Still Present After Transformation

If you see JSX in the output:

1. Ensure `jsx: "preserve"` in `tsconfig.json`
2. Check that files have `.tsx` extension
3. Verify plugin is in the `plugins` array

### React References in Output

The transformer removes React completely. If you see React:

1. Check your imports - remove `import React from 'react'`
2. Use Pulsar's JSX runtime: `import { jsx } from 'pulsar/jsx-runtime'`
3. Ensure no other plugins are adding React

### Type Errors

If TypeScript complains about JSX:

1. Add `pulsar.d.ts` to your project for JSX type definitions
2. Include `"types": ["pulsar"]` in `tsconfig.json`
3. Restart TypeScript server in your IDE

## Performance

The plugin is designed for optimal build performance:

- **Incremental transformation** - Only transforms changed files
- **Parallel processing** - Utilizes Vite's parallelization
- **Fast HMR** - Sub-100ms hot updates
- **Minimal overhead** - Direct AST transformation without serialization

## Roadmap

### Completed ✅

- Zero-config Vite integration
- PSR (.syn) file transformation
- TypeScript program creation for transformation
- Development mode validation
- Debug logging with channel filtering
- Seamless HMR integration
- Fine-grained debug control per pipeline phase

### In Progress 🚧

- Configuration options for include/exclude patterns
- Transformer optimization flags

### Planned 📋

- **Source maps** - Full source map support for debugging
- **Custom transformers** - Plugin API for custom transformations
- **Bundle analysis** - Visualize transformation impact
- **Caching layer** - Cache transformed files across builds
- **Worker threads** - Parallelize transformation for large projects
- **Watch mode optimization** - Smarter incremental rebuilds
- **SSR support** - Server-side rendering compatibility
- **Module federation** - Support for micro-frontends
- **Production diagnostics** - Optional runtime performance tracking

## Pulsar Ecosystem

| Package                                                                     | Description                                 | Status    |
| --------------------------------------------------------------------------- | ------------------------------------------- | --------- |
| [synetics.dev](https://github.com/binaryjack/synetics.dev)                      | Core framework with signal-based reactivity | ✅ Active |
| [@pulsar/ui](https://github.com/binaryjack/synetics-ui.dev)                   | UI component library                        | ✅ Active |
| [@pulsar/design-tokens](https://github.com/binaryjack/synetics-design-system) | Design tokens & art-kit                     | ✅ Active |
| [@pulsar/transformer](https://github.com/binaryjack/synetics-transformer)     | JSX to DOM compiler                         | ✅ Active |
| [@pulsar/vite-plugin](https://github.com/binaryjack/synetics-vite-plugin)     | Vite integration                            | ✅ Active |
| [@pulsar/demo](https://github.com/binaryjack/synetics-demo)                   | Example applications                        | ✅ Active |

## Contributing

We welcome contributions! To get started:

1. **Clone the repository**

   ```bash
   git clone https://github.com/binaryjack/synetics-vite-plugin.git
   cd synetics-vite-plugin
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Link for local development**

   ```bash
   pnpm link --global
   cd ../your-project
   pnpm link @pulsar/vite-plugin --global
   ```

4. **Test your changes**
   ```bash
   # In a test project
   pnpm dev
   ```

### Development Tips

- **Plugin structure**: Check [vite-plugin-temp/src/index.ts](./vite-plugin-temp/src/index.ts)
- **Testing**: Use [@pulsar/demo](../synetics-demo) as a test bed
- **Debugging**: Add `console.log` statements in the `transform` function
- **Vite API**: Reference [Vite Plugin API docs](https://vitejs.dev/guide/api-plugin.html)

## License

MIT License - Copyright (c) 2026 Synetics framework

See [LICENSE](../synetics.dev/LICENSE) file for details.

---

**Connect:** [LinkedIn](https://www.linkedin.com/in/tadeopiana/) • **Explore:** [Pulsar Ecosystem](#pulsar-ecosystem)
