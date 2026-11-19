# Changelog

All notable changes to this project will be documented in this file.

## [1.0.3] - 2026-11-19

### Bug Fixes

- Replace the `*` constraints on `neos/flow` and `neos/neos` with `^8.3 || ^9.0`, the range tested on Neos 8.3, 8.4, 9.0, 9.1 and 9.2
- Require `neos/fusion` and `neos/neos-ui` explicitly (used by the module view and the content module plugin)

## [1.0.2] - 2026-04-03

### Documentation

- Add Neos 9 compatibility to README

## [1.0.1] - 2026-04-01

### Features

- Complete editor notifications module with admin backend and content module plugin
- Redesign notification panel as accordion layout
- Improve admin UX with status bar and contextual actions
- Image upload support with preview styling
- Expose notifications entity via MCP CRUD

### Bug Fixes

- Resolve Plugin.js loading and security issues
- Use generic CSRF token selector for Neos UI compatibility
- Panel visibility via CSS classes instead of hidden attribute
- Harden image upload and restrict read-state to active notifications
- Use parameterMapping in MCP entity serviceMethods config

### Other

- Move MCP entity config to Settings.Mcp.yaml
- Prepare for Packagist with README, LICENSE
- Quality of life improvements
