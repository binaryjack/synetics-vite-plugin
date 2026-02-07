# Changelog

All notable changes to `@pulsar-framework/vite-plugin` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Debug Channels** - Fine-grained control over debug output by transformation phase
  - New `debugChannels` option to filter logs by pipeline phase
  - Support for 7 debug channels: `lexer`, `parser`, `analyzer`, `transform`, `emitter`, `validator`, `pipeline`
  - Reduces console noise by up to 70% when using targeted debugging
  - Each channel shows specific information about its transformation phase
  - Timestamps and performance metrics included in output

### Changed

- Debug output now requires explicit channel configuration for filtering
- When `debug: true` without `debugChannels`, all channels are enabled (backward compatible)

### Documentation

- Comprehensive debug channels guide in README
- Practical debugging scenarios with examples
- Debug channel reference table showing when to use each channel
- Updated configuration options with complete TypeScript interface

## Previous Versions

_Version history prior to this changelog is tracked in git commits._

---

**Format:** Keep a Changelog  
**Versioning:** Semantic Versioning
