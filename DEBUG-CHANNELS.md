# Debug Channels Quick Reference

## TL;DR

```typescript
import { pulsarPlugin } from '@pulsar-framework/vite-plugin';

export default defineConfig({
  plugins: [
    pulsarPlugin({
      debug: true,
      debugChannels: ['emitter', 'validator'], // 👈 Filter logs
    }),
  ],
});
```

---

## Available Channels

| Channel     | Pipeline Phase  | Shows              |
| ----------- | --------------- | ------------------ |
| `lexer`     | Tokenization    | PSR → Tokens       |
| `parser`    | AST Building    | Tokens → AST       |
| `analyzer`  | IR Generation   | AST → IR           |
| `transform` | Optimization    | IR transformations |
| `emitter`   | Code Generation | IR → TypeScript    |
| `validator` | Validation      | Errors/warnings    |
| `pipeline`  | Orchestration   | High-level flow    |

---

## Common Combinations

### 🔍 Debugging Parse Issues

```typescript
debugChannels: ['lexer', 'parser'];
```

**Use when:** Components not detected, syntax errors

**Output:**

```
[LEXER] Generated 31 tokens (+1ms)
[PARSER] AST created with 2 nodes (+2ms)
```

---

### 🎨 Debugging Generated Code

```typescript
debugChannels: ['emitter', 'validator'];
```

**Use when:** Generated code is incorrect, validation errors

**Output:**

```
[EMITTER] Generated 9 lines of code (+4ms)
[VALIDATOR] Validation: 0 errors, 0 warnings (+4ms)
```

---

### ⚡ Performance Analysis

```typescript
debugChannels: ['pipeline'];
```

**Use when:** Slow transformations, need timing metrics

**Output:**

```
[PIPELINE] Starting transformation (+0ms)
[PIPELINE] Found PSR components (+2ms)
[PIPELINE] Transformation complete (+5ms) { totalTime: 4.24ms }
```

---

### 🔬 Deep Debugging

```typescript
debugChannels: ['analyzer', 'transform', 'emitter'];
```

**Use when:** Need to see IR generation and transformation

**Output:**

```
[ANALYZER] Building IR (+2ms)
[ANALYZER] IR generated (+3ms)
[TRANSFORM] Optimizing IR (+3ms)
[TRANSFORM] IR optimization complete (+3ms)
[EMITTER] Generating TypeScript (+3ms)
```

---

### 🌊 Everything

```typescript
debug: true;
// Omit debugChannels OR provide all channels
```

**Use when:** Initial debugging, need complete picture

**Output:** Full pipeline with all phases

---

## Log Format

```
[2026-02-06T18:39:41.146Z] [CHANNEL] Message (+Xms) { data }
│                          │         │         │      │
│                          │         │         │      └─ Optional JSON data
│                          │         │         └─ Time since previous log
│                          │         └─ Log message
│                          └─ Channel name
└─ ISO timestamp
```

---

## Noise Reduction

| Configuration                             | Logs per File | Reduction |
| ----------------------------------------- | ------------- | --------- |
| `debug: false`                            | 0             | -         |
| `debugChannels: ['pipeline']`             | 3             | 77% ↓     |
| `debugChannels: ['emitter', 'validator']` | 4             | 70% ↓     |
| `debugChannels: ['lexer', 'parser']`      | 4             | 70% ↓     |
| `debug: true` (all channels)              | 13            | baseline  |

---

## Tips

1. **Start Broad:** Begin with all channels, narrow down as you identify the issue
2. **Use Pipeline:** Always include `pipeline` for context about transformation flow
3. **Pair Channels:** Related channels work well together:
   - `lexer` + `parser` for syntax issues
   - `emitter` + `validator` for output issues
   - `analyzer` + `transform` for IR issues
4. **Watch Timing:** The `(+Xms)` indicators show relative timing between phases
5. **Check Validation:** Always include `validator` when debugging output quality

---

## Troubleshooting

### No logs appearing

```typescript
// ❌ Wrong
plugins: [pulsarPlugin()];

// ✅ Correct
plugins: [pulsarPlugin({ debug: true })];
```

### Too much output

```typescript
// ❌ All channels
plugins: [pulsarPlugin({ debug: true })];

// ✅ Filtered
plugins: [
  pulsarPlugin({
    debug: true,
    debugChannels: ['emitter', 'validator'],
  }),
];
```

### Missing phase information

```typescript
// ❌ Wrong channel
debugChannels: ['lexer'];

// ✅ Add the phase you need
debugChannels: ['lexer', 'parser', 'analyzer'];
```

---

## Examples in Action

### Example 1: Component Not Transforming

**Config:**

```typescript
debugChannels: ['parser', 'pipeline'];
```

**Output:**

```
[PARSER] AST created with 3 nodes (+2ms)
[PIPELINE] No PSR components found - returning source unchanged
```

**Fix:** Check that the file uses `component MyComponent()` syntax

---

### Example 2: Generated Code Has Errors

**Config:**

```typescript
debugChannels: ['emitter', 'validator'];
```

**Output:**

```
[EMITTER] Generated 45 lines of code (+8ms)
[VALIDATOR] Validation: 2 errors, 1 warning (+9ms)
```

**Fix:** Check validator errors for specific issues in generated code

---

### Example 3: Slow Transformation

**Config:**

```typescript
debugChannels: ['pipeline'];
```

**Output:**

```
[PIPELINE] Transformation complete (+127ms) { totalTime: 126.8ms }
```

**Fix:** Large file - consider splitting into smaller components

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────┐
│  DEBUG CHANNELS CHEAT SHEET                     │
├─────────────────────────────────────────────────┤
│                                                 │
│  Parse Issues      → ['lexer', 'parser']       │
│  Code Issues       → ['emitter', 'validator']  │
│  Performance       → ['pipeline']              │
│  IR Issues         → ['analyzer', 'transform'] │
│  Everything        → omit debugChannels        │
│                                                 │
│  Enable Debug:  debug: true                    │
│  Disable Debug: debug: false (default)         │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

**See also:** [Full README](./README.md) | [Examples](../../packages/pulsar-ui.dev/vite.config.ts)
