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

## Known Issues

### CRITICAL: Plugin.js likely not loading in content module

**File:** `Configuration/Settings.yaml:27`

```yaml
resource: '${"resource://UpAssist.Neos.EditorNotifications/Public/JavaScript/NotificationPlugin/Plugin.js"}'
```

The resource URI is wrapped in Eel syntax `${"..."}`. Eel expressions are NOT evaluated in YAML Settings — only in Fusion. The Neos UI resource handler expects plain `resource://...` format. This likely prevents Plugin.js from loading in the content module entirely.

**Fix:** Change to `resource: 'resource://UpAssist.Neos.EditorNotifications/Public/JavaScript/NotificationPlugin/Plugin.js'`

### HIGH: Custom rich text editor (Module.js) is unreliable

- Uses deprecated `document.execCommand()` — inconsistent behavior across browsers
- Manual DOM manipulation for lists (lines 94-138) is fragile
- No fallback when commands fail silently
- Image upload stores base64 data URLs directly in content — large images create enormous HTML strings in database
- Selection/range management can reference detached DOM nodes after external changes

**Recommendation:** Replace with an established editor library (CKEditor, TinyMCE, Tiptap) or simplify to textarea with markdown.

### HIGH: Plugin.js content module integration issues

- **Fragile toolbar detection** (lines 34-39): uses `[class*="primaryToolbar"]` CSS class substring matching on Neos UI React components — breaks on any Neos UI class name change
- **XSS vulnerability** (lines 110, 141-144): `innerHTML` renders unsanitized notification `title` and `content`
- **Memory leak** (lines 132-137): `badge.onclick` and close-button handler are reassigned on every `renderPanel()` call (every 60s poll cycle) without cleanup
- **Duplicate guard** (lines 188+192): `isContentModule()` is checked twice
- **Silent errors** (lines 208-215): all errors are swallowed without logging — impossible to debug in production
- **Hardcoded locale** (line 111): `toLocaleString("nl-NL")` — not configurable for multi-language setups

### MEDIUM: Module.css specificity wars

- 6+ `!important` overrides fighting default Neos backend CSS
- Only one breakpoint at 1100px, no mobile support
- Iteratively patched, resulting in messy overrides

### MEDIUM: Weak HTML sanitization in service

`sanitizeContent()` (NotificationService.php:211-218) uses regex-based cleaning:
- Strips `<script>` and `<style>` tags
- Removes `on*` event handlers and `javascript:` URIs
- Can be bypassed with nested tags, encoded entities, or edge cases

Consider using a proper HTML sanitizer library (e.g., `HTMLPurifier`).

### LOW: Policy.yaml naming mismatch

`ReadNotifications` privilege matches `.*Action()` — grants editors write access to `markSeen` and `dismiss` actions. Functionally correct but misleading. Consider splitting into `ReadNotifications` and `ManageReadState`.

## What to Keep vs. Replace

### Keep (solid foundation)
- `Notification` and `NotificationReadState` domain models
- `NotificationRepository` and `NotificationReadStateRepository`
- `NotificationService` (business logic, read state management)
- `NotificationModuleController` (CRUD, publish/archive flow)
- `NotificationApiController` (JSON API structure)
- Database migration (`Version20260331151406.php`)
- `Routes.yaml`, `Policy.yaml` configuration
- `Index.fusion` (backend notification list)
- `FlashMessages.fusion`

### Replace or heavily refactor
- `Module.js` — replace custom editor with established library or simplify to textarea
- `Plugin.js` — fix Settings.yaml first, then address XSS, memory leaks, error handling
- `Module.css` — clean rewrite without specificity hacks
- `Form.fusion` — update toolbar markup to match new editor choice
- `Settings.yaml` line 27 — remove Eel wrapper from resource URI

## Development Notes

- Backend module runs at `/neos/administration/notifications`
- API endpoint: `/neos/notifications/api/{action}` (active, unreadCount, markSeen, dismiss)
- Plugin.js retries boot every 500ms up to 20 times (10s window) to wait for Neos UI to render
- Notifications are sorted: unread first, then by publishedAt descending
- Only drafts can be deleted; published notifications must be archived first
