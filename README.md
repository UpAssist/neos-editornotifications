# UpAssist.Neos.EditorNotifications

Admin-managed backend notifications for Neos CMS editors.

## Features

- **Admin module** at `/neos/administration/notifications` for creating and managing notifications
- **Markdown editor** with toolbar (bold, italic, lists, links, images) and live preview
- **Image uploads** stored as Flow persistent resources (not data URLs)
- **Scheduling** with optional show-from and show-until date/time windows
- **Lifecycle management** — draft → published → archived, with publish/unpublish/archive actions
- **Per-user read state** — tracks seen and dismissed state per editor
- **Content module plugin** — bell icon badge with unread count, slide-out notification panel with accordion layout
- **Toast notifications** — bottom-right toast when new notifications arrive
- **Security** — role-based access: admins manage notifications, editors can only read/dismiss
- **i18n** — Dutch and English translations

## Requirements

- Neos CMS 8.x
- PHP 8.1+
- `league/commonmark` ^2.0 (installed via Composer)

## Installation

This package is designed to be used as a path repository inside a Neos project.

1. Add the path repository to your project's `composer.json`:
   ```json
   {
     "repositories": [
       {
         "type": "path",
         "url": "Packages/Application/UpAssist.Neos.EditorNotifications"
       }
     ]
   }
   ```
2. `composer require upassist/neos-editornotifications:@dev`
3. `./flow doctrine:migrate`

## Configuration

The package registers itself automatically via `Settings.yaml`. No additional configuration needed.

- **Backend module**: appears under Administration → Notifications
- **Content module plugin**: bell icon loads automatically for all editors
- **Policies**: Administrators get full access; Editors can view, mark as read, and dismiss

## Architecture

```
Classes/
├── Api/Controller/NotificationApiController.php     # JSON API (read, mark, dismiss, upload)
├── Controller/Backend/Module/
│   └── NotificationModuleController.php             # Admin CRUD + publish/archive
├── Domain/
│   ├── Model/Notification.php                       # Title, contentMarkdown, content (HTML), scheduling, lifecycle
│   ├── Model/NotificationReadState.php              # Per-user seen/dismissed tracking
│   └── Repository/                                  # Query builders with filter support
└── Service/NotificationService.php                  # Business logic, markdown rendering, read state

Resources/
├── Private/Fusion/Backend/                          # Index (list + filters) and Form (editor + preview)
└── Public/
    ├── JavaScript/Module/Module.js                  # Markdown editor with toolbar and image upload
    ├── JavaScript/NotificationPlugin/Plugin.js      # Content module badge, panel, and toast
    └── Styles/Module.css                            # Admin module dark theme styling
```

## License

Proprietary — UpAssist
