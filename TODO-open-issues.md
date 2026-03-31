# Open Issues — UpAssist.Neos.EditorNotifications

Kopieer dit in een nieuwe Claude-thread als instructie.

---

## 1. Rich text editor (Module.js) vervangen

**Wat:** De custom rich text editor in `Resources/Public/JavaScript/Module/Module.js` gebruikt `document.execCommand()` (deprecated) en handmatige DOM-manipulatie voor lijsten. Dit is onbetrouwbaar in Safari/WebKit en zorgt voor inconsistent gedrag bij bold, italic, lijsten en links.

**Daarnaast:** Image upload slaat base64 data URLs direct op in de notification content. Grote screenshots worden enorme HTML-strings in de database.

**Gewenste aanpak:**
- Vervang de custom contenteditable-editor door een bestaande library. Opties:
  - **Tiptap** (ProseMirror-gebaseerd, modern, goed voor embeds)
  - **TinyMCE** (bewezen, veel formatting-opties)
  - Of simpeler: vervang door een `<textarea>` met Markdown-invoer (en render HTML server-side met een Markdown parser)
- Voor afbeeldingen: upload naar Flow persistent resources (via een upload API endpoint) in plaats van base64 inline
- Pas `Form.fusion` aan zodat de toolbar-buttons matchen met de nieuwe editor
- Het preview-paneel in het formulier kan blijven, maar moet de output van de nieuwe editor tonen

**Relevante bestanden:**
- `Resources/Public/JavaScript/Module/Module.js` — volledig vervangen
- `Resources/Private/Fusion/Backend/Form.fusion` — toolbar + editor markup aanpassen
- `Resources/Public/Styles/Module.css` — editor-gerelateerde styles herschrijven

---

## 2. Module.css opschonen

**Wat:** De admin module styling in `Resources/Public/Styles/Module.css` heeft 6+ `!important` overrides die tegen standaard Neos backend CSS vechten. Er is maar 1 breakpoint (1100px) en geen mobiele ondersteuning. Het is iteratief gepatcht en daardoor rommelig.

**Gewenste aanpak:**
- Herschrijf de CSS met een schoon specificity-model — gebruik de `.est-notifications-*` prefix consequent en vermijd `!important`
- Voeg een breakpoint toe voor tablet/telefoon (~768px)
- Test de module in de Neos backend bij `mainStylesheet: 'Lite'` setting (dit beperkt welke Neos CSS wordt geladen)

**Relevant bestand:**
- `Resources/Public/Styles/Module.css`

---

## 3. Toolbar-detectie in Plugin.js robuuster maken

**Wat:** Plugin.js zoekt de Neos top bar via CSS class substring matching:
```js
document.querySelector('[class*="primaryToolbar__rightSidedActions"]')
```
Dit werkt nu, maar breekt zodra Neos UI zijn CSS module class names wijzigt (wat bij elke build kan).

**Gewenste aanpak:**
- Gebruik stabielere selectors: `#neos-top-bar` (legacy) of `#neos-application` + MutationObserver om te wachten tot de toolbar-elementen verschijnen
- Als alternatief: gebruik de Neos UI extensibility API (als beschikbaar in Neos 8.3) om de badge als React-component te registreren in plaats van DOM-injectie

**Relevant bestand:**
- `Resources/Public/JavaScript/NotificationPlugin/Plugin.js` — functie `findTopBarHost()`
