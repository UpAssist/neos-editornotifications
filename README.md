# UpAssist.Neos.EditorNotifications

Admin-managed backend notifications for Neos editors.

## What it includes

- Admin module for creating and managing editor notifications
- Rich text notification content with inline screenshots
- Per-user read and dismiss state
- Content-module badge and popup for unread notifications
- Doctrine migration for notification storage

## Local development

This package is designed to be used as a path repository inside a Neos project.

Typical workflow:

1. Require the package from the host project
2. Run `composer dump-autoload`
3. Run `./flow neos.flow:package:rescan`
4. Run `./flow doctrine:migrate`

## Notes

- The current editor implementation uses a lightweight contenteditable-based rich text editor.
- Screenshot uploads are embedded inline as data URLs in v1.
