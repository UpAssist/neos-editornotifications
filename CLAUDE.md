# CLAUDE.md — UpAssist.Neos.EditorNotifications

## Package Overview

Neos CMS backend module + content module plugin for editor notifications. Allows admins to create Markdown-based notifications that are shown to editors in the Neos content module.

## Architecture

```
Classes/
├── Api/Controller/
│   └── NotificationApiController.php    # JSON API for content module (active, unreadCount, markSeen, markAllSeen, markUnseen, dismiss, removeForCurrentUser, uploadImage)
├── Controller/Backend/Module/
│   └── NotificationModuleController.php # Admin backend module (CRUD, publish, unpublish, archive)
├── Domain/
│   ├── Model/
│   │   ├── Notification.php             # Title, contentMarkdown, content (HTML), showFrom/Until, publishedAt, archivedAt, createdBy
│   │   └── NotificationReadState.php    # Per-user seen/dismissed/removed state (ManyToOne → Notification + User)
│   └── Repository/
│       ├── NotificationRepository.php   # Filters: active, draft, scheduled, expired, archived; pagination support
│       └── NotificationReadStateRepository.php
└── Service/
    └── NotificationService.php          # Business logic, Markdown→HTML (CommonMark), read state management

Configuration/
├── Settings.yaml    # Backend module registration + Neos UI JS resource (Plugin.js)
├── Routes.yaml      # API route: /neos/notifications/api/{@action}
└── Policy.yaml      # Privileges for admin (ManageNotifications, UploadNotificationImage) and editor (ReadNotifications)

Resources/
├── Private/Fusion/
│   ├── Backend/Index.fusion   # Notification list with 5 filters + pagination (10 items/page)
│   ├── Backend/Form.fusion    # Create/edit form with Markdown editor + live preview
│   └── Component/FlashMessages.fusion
└── Public/
    ├── JavaScript/Module/Module.js              # Markdown editor toolbar (bold, italic, lists, links, image upload)
    ├── JavaScript/NotificationPlugin/Plugin.js  # Content module bell badge + slide-out accordion panel
    └── Styles/Module.css                        # Admin module dark theme styling
```

## Data Flow

1. Admin creates notification via backend module → `NotificationModuleController` → `NotificationService` → DB
2. Content stored as both Markdown source (`contentMarkdown`) and rendered HTML (`content`)
3. Admin publishes notification (sets `publishedAt`), optionally with show-from/until window
4. Editor opens content module → Plugin.js polls `/neos/notifications/api/active` every 60s
5. API returns active notifications with per-user read state (seen/dismissed flags)
6. Editor expands notification → auto-marked as seen via POST to `/neos/notifications/api/markSeen`
7. Editor dismisses → POST to `/neos/notifications/api/dismiss`
8. Editor can mark as unread again → POST to `/neos/notifications/api/markUnseen`
9. Editor can mark all as read → POST to `/neos/notifications/api/markAllSeen`
10. Editor can permanently remove a notification for themselves → POST to `/neos/notifications/api/removeForCurrentUser`

## Key Implementation Details

### Markdown Editor (Module.js)
- Custom toolbar with bold, italic, unordered list, ordered list, link, and image buttons
- All formatting uses Range API (no `document.execCommand`)
- Keyboard shortcuts: Ctrl+B (bold), Ctrl+I (italic), Tab inserts 2 spaces
- Live preview updates on every keystroke (simple regex-based Markdown→HTML in browser)
- Image upload: FormData POST to `/neos/notifications/api/uploadImage` with CSRF token, inserts `![alt](url)` on success

### Image Upload (Server-side)

- API endpoint validates MIME type (JPEG, PNG, GIF, WebP only) and size (max 10 MB)
- Stores via Flow's `ResourceManager->importResourceFromContent()`
- Returns public persistent resource URI (not data URLs)
- Separate `UploadNotificationImage` privilege (admin-only)

### Content Module Plugin (Plugin.js)
- MutationObserver on `#neos-application` to detect Neos UI toolbar (15s timeout)
- Bell icon (40x40px) with unread count badge
- Slide-out panel (320px, dark theme) with accordion layout (one expanded at a time)
- Expand state persists across 60s poll refreshes via `expandedItemId`
- HTML sanitization: removes script/style/iframe, event handlers, javascript: URLs
- "Hide" (dismiss), "Mark as unread", "Unhide", and "Delete" (removeForCurrentUser) buttons per notification
- "Mark all read" button in panel header
- Toggle to show/hide dismissed notifications
- Custom tooltip on action buttons

### Notification Lifecycle

- **Draft** → created but not published
- **Published** → `publishedAt` set, visible to editors if within show window
- **Scheduled** → published but `showFrom` is in the future
- **Expired** → published but `showUntil` is in the past
- **Archived** → `archivedAt` set, hidden from editors
- Active notifications cannot be deleted; all other states (draft, archived, expired, scheduled) can be deleted

### Content Rendering
- Markdown→HTML via League\CommonMark with `html_input: strip` and `allow_unsafe_links: false`
- Both markdown source and rendered HTML stored in DB (allows re-editing)

### Security
- CSRF token read from `[data-csrf-token]` attribute, sent via `X-Flow-Csrftoken` header
- Admins: full CRUD + publish/archive + image upload (`ManageNotifications`, `UploadNotificationImage`)
- Editors: read + mark seen/unseen + mark all seen + dismiss + remove for self (`ReadNotifications`)
- Backend module privilege: `Backend.Module.Administration.Notifications` (registered under `management` in Settings.yaml)

## Resolved Issues

- **Settings.yaml Eel wrapper** — `${"resource://..."}` → plain `resource://...` (Eel not evaluated in YAML Settings)
- **CSRF token selector** — `.neos-user-menu[data-csrf-token]` → generic `[data-csrf-token]` (Neos UI React puts it on `#appContainer`)
- **Plugin.js XSS** — titles use `textContent`, content uses `sanitizeHtml()`
- **Plugin.js memory leak** — open/close handlers bound once in `createShell()`, not on every poll
- **Plugin.js silent errors** — all catch blocks now log via `console.warn`
- **Plugin.js UX redesign** — accordion layout, no split detail panel
- **Module.js execCommand removed** — all `document.execCommand()` replaced with Range API
- **Image upload server-side** — Flow persistent resources instead of base64 data URLs in HTML
- **Module.css !important removed** — higher-specificity selectors with `.est-notifications-module` scope; 768px tablet breakpoint
- **Plugin.js MutationObserver** — replaced setTimeout polling with MutationObserver for toolbar detection
- **Policy.yaml scoped privileges** — `ReadNotifications` matches only read/mark/dismiss; `UploadNotificationImage` separate admin-only privilege
- **Regex sanitization replaced** — `sanitizeContent()` replaced by `renderMarkdown()` using League\CommonMark with `html_input: strip`

## Development Notes

- Backend module: `/neos/management/notifications`
- API endpoint: `/neos/notifications/api/{action}`
- API actions: `active`, `unreadCount`, `markSeen`, `markAllSeen`, `markUnseen`, `dismiss`, `removeForCurrentUser`, `uploadImage`
- Admin form: two-column layout (editor left, live preview right) with context-aware action buttons
- List view: 5 filter tabs (active, scheduled, draft, expired, archive) with item count and color-coded status bars
- Notifications sorted by publishedAt descending
- Active notifications cannot be deleted; all other states can
- Database: 2 tables + 3 Doctrine migrations
