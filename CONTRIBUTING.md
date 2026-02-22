# Contributing to pulsar-vite-plugin

Thank you for your interest in contributing! Please see the [main contributing guide](../../CONTRIBUTING.md) for general guidelines.

## Package-Specific Information

### Development Setup

```bash
# Install dependencies from monorepo root
cd ../..
pnpm install

# Build this package
pnpm --filter @pulsar-framework/vite-plugin build

# Run tests
pnpm --filter @pulsar-framework/vite-plugin test

# Watch mode
pnpm --filter @pulsar-framework/vite-plugin dev
```

### Architecture

This package is part of the Visual Schema Builder monorepo. For detailed architecture and design patterns, see the [package documentation](./docs/) and [monorepo documentation](../../docs/).

### Testing

Please ensure all tests pass before submitting a pull request:

```bash
pnpm --filter @pulsar-framework/vite-plugin test
pnpm --filter @pulsar-framework/vite-plugin typecheck
pnpm --filter @pulsar-framework/vite-plugin lint
```

### Documentation

- Keep the README.md up-to-date with API changes
- Add JSDoc comments for public APIs
- Update examples when changing behavior
- Document breaking changes in CHANGELOG.md

## Questions?

See the [main README](../../README.md) or open a discussion in the repository.
