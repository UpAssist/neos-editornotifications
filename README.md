# UpAssist.Neos.EditorNotifications

Admin-managed backend notifications for Neos CMS editors.

## Features

- **Admin module** at `/neos/management/notifications` for creating and managing notifications
- **Markdown editor** with toolbar (bold, italic, lists, links, images) and live preview
- **Image uploads** stored as Flow persistent resources
- **Scheduling** with optional show-from and show-until date/time windows
- **Lifecycle management** — draft → published → archived, with publish/unpublish/archive actions
- **Per-user read state** — tracks seen, dismissed, and removed state per editor
- **Content module plugin** — bell icon badge with unread count, slide-out notification panel with accordion layout
- **Toast notifications** — bottom-right toast when new notifications arrive
- **Mark all read** — editors can mark all notifications as read at once
- **Security** — role-based access: admins manage notifications and upload images, editors can only read/dismiss
- **i18n** — Dutch and English translations

## Requirements

- Neos CMS 8.x
- PHP 8.1+
- `league/commonmark` ^2.0 (installed via Composer)

## Installation

```bash
composer require upassist/neos-editornotifications
./flow doctrine:migrate
```

## Configuration

The package registers itself automatically via `Settings.yaml`. No additional configuration needed.

- **Backend module**: appears under Management → Notifications
- **Content module plugin**: bell icon loads automatically for all editors
- **Policies**: Administrators get full access; Editors can view, mark as read, and dismiss

## Architecture

```text
Classes/
├── Api/Controller/NotificationApiController.php     # JSON API (active, unreadCount, markSeen, markAllSeen, markUnseen, dismiss, removeForCurrentUser, uploadImage)
├── Controller/Backend/Module/
│   └── NotificationModuleController.php             # Admin CRUD + publish/unpublish/archive
├── Domain/
│   ├── Model/Notification.php                       # Title, contentMarkdown, content (HTML), scheduling, lifecycle
│   ├── Model/NotificationReadState.php              # Per-user seen/dismissed/removed tracking
│   └── Repository/                                  # Query builders with filter and pagination support
└── Service/NotificationService.php                  # Business logic, markdown rendering, read state

Resources/
├── Private/
│   ├── Fusion/Backend/                              # Index (list + filters + pagination) and Form (editor + preview)
│   └── Translations/                                # Dutch (nl) and English (en) XLIFF
└── Public/
    ├── JavaScript/Module/Module.js                  # Markdown editor with toolbar and image upload
    ├── JavaScript/NotificationPlugin/Plugin.js      # Content module badge, panel, and toast
    └── Styles/Module.css                            # Admin module dark theme styling
```

## Notification lifecycle

| State | Condition |
| --- | --- |
| **Draft** | Created but not published (`publishedAt` is null) |
| **Published** | `publishedAt` set, visible to editors if within show window |
| **Scheduled** | Published but `showFrom` is in the future |
| **Expired** | Published but `showUntil` is in the past |
| **Archived** | `archivedAt` set, hidden from editors |

Active notifications cannot be deleted directly — archive them first. Drafts, archived, expired, and scheduled notifications can be deleted.

## API endpoints

All API routes are prefixed with `/neos/notifications/api/`.

| Action | Method | Description |
| --- | --- | --- |
| `active` | GET | Active notifications for current user (with read state) |
| `unreadCount` | GET | Number of unread notifications |
| `markSeen` | POST | Mark a notification as seen |
| `markAllSeen` | POST | Mark all active notifications as seen |
| `markUnseen` | POST | Mark a notification as unread |
| `dismiss` | POST | Dismiss (hide) a notification |
| `removeForCurrentUser` | POST | Permanently remove a notification for the current user |
| `uploadImage` | POST | Upload an image (admin, max 10 MB, JPEG/PNG/GIF/WebP) |

## Security

| Role | Privileges |
|---|---|
| `Neos.Neos:Administrator` | Full CRUD, publish/archive, image upload, read notifications |
| `Neos.Neos:Editor` | Read, mark seen/unseen, mark all seen, dismiss, remove for self |

## License

MIT
