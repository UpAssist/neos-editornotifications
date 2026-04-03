# Changelog

All notable changes to this project will be documented in this file.

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
