# CLAUDE.md — UpAssist.Neos.EditorNotifications

## Package Overview

Neos CMS backend module + content module plugin for editor notifications. Allows admins to create rich-text notifications that are shown to editors in the Neos content module.

## Architecture

```
Classes/
├── Api/Controller/
│   └── NotificationApiController.php    # JSON API for content module (read, markSeen, dismiss)
├── Controller/Backend/Module/
│   └── NotificationModuleController.php # Admin backend module (CRUD, publish, archive)
├── Domain/
│   ├── Model/
│   │   ├── Notification.php             # Title, content (HTML), showFrom/Until, publishedAt, archivedAt
│   │   └── NotificationReadState.php    # Per-user seen/dismissed state (ManyToOne → Notification + User)
│   └── Repository/
│       ├── NotificationRepository.php   # Filters: active, draft, scheduled, expired, archived
│       └── NotificationReadStateRepository.php
└── Service/
    └── NotificationService.php          # Business logic, sanitization, read state management

Configuration/
├── Settings.yaml    # Backend module registration + Neos UI JS resource
├── Routes.yaml      # API route: /neos/notifications/api/{@action}
└── Policy.yaml      # Privileges for admin (ManageNotifications) and editor (ReadNotifications)

Resources/
├── Private/Fusion/
│   ├── Backend/Index.fusion   # Notification list with filters + pagination
│   ├── Backend/Form.fusion    # Create/edit form with custom rich text editor + preview
│   └── Component/FlashMessages.fusion
└── Public/
    ├── JavaScript/Module/Module.js              # Custom rich text editor for admin form
    ├── JavaScript/NotificationPlugin/Plugin.js  # Content module notification badge + panel
    └── Styles/Module.css                        # Admin module styling
```

## Data Flow

1. Admin creates notification via backend module → `NotificationModuleController` → `NotificationService` → DB
2. Admin publishes notification (sets `publishedAt`)
3. Editor opens content module → Plugin.js polls `/neos/notifications/api/active` every 60s
4. API returns active notifications with per-user read state
5. Editor clicks notification → POST to `/neos/notifications/api/markSeen`
6. Editor dismisses → POST to `/neos/notifications/api/dismiss`

## What Works

- Domain layer (models, repositories, service) is solid and well-structured
- Backend module CRUD flow (create, edit, publish, unpublish, archive, delete)
- Database migration and schema
- Flash messages in Neos style
- API routing (`{@action}` syntax correct, `@subpackage: 'Api'` maps correctly)
- CSRF protection (token from `.neos-user-menu[data-csrf-token]`, sent via `X-Flow-Csrftoken` header)
- Persistence (Flow auto-flushes `persistAll()` at end of request — no manual flush needed)
- Policy permissions (editors can read + mark/dismiss via `ReadNotifications` privilege)
- Package route positioning (`before Neos.Neos` in Settings.yaml)

## Resolved Issues

- **Settings.yaml Eel wrapper** — resource URI was `${"resource://..."}`, Eel is not evaluated in YAML Settings. Fixed: plain `resource://...`
- **CSRF token selector** — was `.neos-user-menu[data-csrf-token]` but Neos UI (React) puts it on `#appContainer`. Fixed: generic `[data-csrf-token]`
- **Plugin.js XSS** — titles now use `textContent`, content uses `sanitizeHtml()` defense-in-depth
- **Plugin.js memory leak** — open/close handlers now bound once in `createShell()`, not on every poll
- **Plugin.js silent errors** — all catch blocks now log via `console.warn`
- **Plugin.js duplicate check** — removed redundant `isContentModule()` call
- **Plugin.js UX redesign** — accordion layout (expand-on-click), no split detail panel, no "Beheer" link, "Verbergen" instead of "Niet meer tonen"

## Remaining Issues

### HIGH: Custom rich text editor (Module.js) is unreliable

- Uses deprecated `document.execCommand()` — inconsistent behavior across browsers
- Manual DOM manipulation for lists is fragile
- Image upload stores base64 data URLs directly in content — large images create enormous HTML strings in database

**Recommendation:** Replace with an established editor library (CKEditor, TinyMCE, Tiptap) or simplify to textarea with markdown.

### MEDIUM: Module.css specificity wars

- 6+ `!important` overrides fighting default Neos backend CSS
- Only one breakpoint at 1100px, no mobile support

### MEDIUM: Weak HTML sanitization in service

`sanitizeContent()` (NotificationService.php:211-218) uses regex-based cleaning. Can be bypassed with nested tags or encoded entities. Consider `HTMLPurifier`.

### LOW: Plugin.js toolbar detection is fragile

Uses `[class*="primaryToolbar"]` CSS class substring matching on Neos UI React components — breaks if Neos UI changes class naming.

### LOW: Policy.yaml naming mismatch

`ReadNotifications` privilege matches `.*Action()` — grants editors write access to `markSeen` and `dismiss`. Functionally correct but misleading name.

## Development Notes

- Backend module runs at `/neos/administration/notifications`
- API endpoint: `/neos/notifications/api/{action}` (active, unreadCount, markSeen, dismiss)
- CSRF token: read from `[data-csrf-token]` attribute (Neos UI puts it on `#appContainer`)
- Plugin.js retries boot every 500ms up to 20 times (10s window) to wait for Neos UI to render
- Notifications are sorted: unread first, then by publishedAt descending
- Expand state persists across 60s poll refreshes via `expandedItemId`
- Only drafts can be deleted; published notifications must be archived first
