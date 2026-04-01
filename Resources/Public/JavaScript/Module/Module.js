(function () {
    function getTranslations(el) {
        var host = el.closest("[data-translations]");
        try { return JSON.parse(host ? host.getAttribute("data-translations") : "{}"); } catch (e) { return {}; }
    }
    function t(tr, key, fallback, reps) {
        var text = tr[key] || fallback;
        if (reps) { for (var i = 0; i < reps.length; i++) { text = text.replace("{" + i + "}", reps[i]); } }
        return text;
    }

    function initMarkdownEditor(root) {
        var translations = getTranslations(root);
        var editor = root.querySelector("[data-md-editor]");
        var preview = document.getElementById(root.getAttribute("data-preview-target"));
        var previewTitle = document.getElementById(root.getAttribute("data-preview-title-target"));
        var previewMeta = document.getElementById(root.getAttribute("data-preview-meta-target"));
        var titleInput = root.querySelector('input[name="moduleArguments[title]"]');
        var showFromInput = root.querySelector('input[name="moduleArguments[showFrom]"]');
        var showUntilInput = root.querySelector('input[name="moduleArguments[showUntil]"]');

        if (!editor || !preview) {
            return;
        }

        syncPreview();

        // ── Markdown toolbar actions ─────────────────────────────────

        function wrapSelection(before, after) {
            var start = editor.selectionStart;
            var end = editor.selectionEnd;
            var text = editor.value;
            var selected = text.substring(start, end);

            editor.value = text.substring(0, start) + before + selected + after + text.substring(end);
            editor.selectionStart = start + before.length;
            editor.selectionEnd = end + before.length;
            editor.focus();
            syncPreview();
        }

        function prefixLines(prefix) {
            var start = editor.selectionStart;
            var end = editor.selectionEnd;
            var text = editor.value;

            // Expand selection to full lines
            var lineStart = text.lastIndexOf("\n", start - 1) + 1;
            var lineEnd = text.indexOf("\n", end);
            if (lineEnd === -1) lineEnd = text.length;

            var selectedLines = text.substring(lineStart, lineEnd);
            var lines = selectedLines.split("\n");

            var prefixed = lines.map(function (line, i) {
                if (typeof prefix === "function") {
                    return prefix(line, i);
                }
                return prefix + line;
            }).join("\n");

            editor.value = text.substring(0, lineStart) + prefixed + text.substring(lineEnd);
            editor.selectionStart = lineStart;
            editor.selectionEnd = lineStart + prefixed.length;
            editor.focus();
            syncPreview();
        }

        function handleAction(action) {
            switch (action) {
                case "bold":
                    wrapSelection("**", "**");
                    break;
                case "italic":
                    wrapSelection("*", "*");
                    break;
                case "ul":
                    prefixLines("- ");
                    break;
                case "ol":
                    prefixLines(function (line, i) {
                        return (i + 1) + ". " + line;
                    });
                    break;
                case "link":
                    var url = window.prompt(t(translations, "js.enterUrl", "Enter a URL"));
                    if (url) {
                        var start = editor.selectionStart;
                        var end = editor.selectionEnd;
                        var selected = editor.value.substring(start, end) || t(translations, "js.linkText", "link text");
                        wrapSelection("[", "](" + url + ")");
                        if (start === end) {
                            // No selection — insert placeholder text
                            var text = editor.value;
                            editor.value = text.substring(0, start) + "[" + selected + "](" + url + ")" + text.substring(start);
                            editor.selectionStart = start + 1;
                            editor.selectionEnd = start + 1 + selected.length;
                            editor.focus();
                            syncPreview();
                        }
                    }
                    break;
                case "image":
                    var fileInput = root.querySelector("[data-md-image-upload]");
                    if (fileInput) {
                        fileInput.click();
                    }
                    break;
            }
        }

        // ── Toolbar button bindings ──────────────────────────────────

        root.querySelectorAll("[data-md-action]").forEach(function (button) {
            button.addEventListener("click", function (e) {
                e.preventDefault();
                handleAction(button.getAttribute("data-md-action"));
            });
        });

        // ── Image file upload ────────────────────────────────────────

        var fileInput = root.querySelector("[data-md-image-upload]");
        if (fileInput) {
            fileInput.addEventListener("change", function () {
                var file = fileInput.files[0];
                if (!file) return;

                var formData = new FormData();
                formData.append("file", file);

                var csrfToken = document.querySelector("[data-csrf-token]");
                var token = csrfToken ? csrfToken.getAttribute("data-csrf-token") : "";

                var imageButton = root.querySelector('[data-md-action="image"]');
                if (imageButton) {
                    imageButton.disabled = true;
                    imageButton.querySelector("i").className = "fas fa-spinner fa-spin";
                }

                fetch("/neos/notifications/api/uploadImage", {
                    method: "POST",
                    headers: { "X-Flow-Csrftoken": token },
                    body: formData
                })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (data.success && data.url) {
                        var pos = editor.selectionStart;
                        var text = editor.value;
                        var insert = "![image](" + data.url + ")";
                        editor.value = text.substring(0, pos) + insert + text.substring(pos);
                        editor.selectionStart = editor.selectionEnd = pos + insert.length;
                        editor.focus();
                        syncPreview();
                    } else {
                        window.alert(t(translations, "js.uploadFailed", "Upload failed: {0}", [data.error || t(translations, "js.unknownError", "unknown error")]));
                    }
                })
                .catch(function () {
                    window.alert(t(translations, "js.uploadNetworkError", "Upload failed: network error"));
                })
                .finally(function () {
                    if (imageButton) {
                        imageButton.disabled = false;
                        imageButton.querySelector("i").className = "fas fa-image";
                    }
                    fileInput.value = "";
                });
            });
        }

        // ── Keyboard shortcuts ───────────────────────────────────────

        editor.addEventListener("keydown", function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === "b") {
                e.preventDefault();
                handleAction("bold");
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "i") {
                e.preventDefault();
                handleAction("italic");
            }
        });

        // ── Tab key inserts spaces ───────────────────────────────────

        editor.addEventListener("keydown", function (e) {
            if (e.key === "Tab") {
                e.preventDefault();
                var start = editor.selectionStart;
                var text = editor.value;
                editor.value = text.substring(0, start) + "  " + text.substring(start);
                editor.selectionStart = editor.selectionEnd = start + 2;
                syncPreview();
            }
        });

        // ── Simple markdown → HTML for live preview ──────────────────

        function markdownToHtml(md) {
            if (!md.trim()) return "";

            var html = md
                // Escape HTML entities
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                // Bold
                .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                // Italic
                .replace(/\*(.+?)\*/g, "<em>$1</em>")
                // Images (before links)
                .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;height:auto">')
                // Links
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

            // Process blocks: lists and paragraphs
            var lines = html.split("\n");
            var result = [];
            var inUl = false;
            var inOl = false;

            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                var ulMatch = line.match(/^[-*]\s+(.*)/);
                var olMatch = line.match(/^\d+\.\s+(.*)/);

                if (ulMatch) {
                    if (!inUl) { result.push("<ul>"); inUl = true; }
                    if (inOl) { result.push("</ol>"); inOl = false; }
                    result.push("<li>" + ulMatch[1] + "</li>");
                } else if (olMatch) {
                    if (!inOl) { result.push("<ol>"); inOl = true; }
                    if (inUl) { result.push("</ul>"); inUl = false; }
                    result.push("<li>" + olMatch[1] + "</li>");
                } else {
                    if (inUl) { result.push("</ul>"); inUl = false; }
                    if (inOl) { result.push("</ol>"); inOl = false; }
                    if (line.trim() === "") {
                        result.push("");
                    } else {
                        result.push("<p>" + line + "</p>");
                    }
                }
            }
            if (inUl) result.push("</ul>");
            if (inOl) result.push("</ol>");

            return result.join("\n");
        }

        // ── Preview sync ─────────────────────────────────────────────

        function formatDate(value) {
            if (!value) return "";
            var date = new Date(value);
            if (Number.isNaN(date.getTime())) return "";
            return new Intl.DateTimeFormat("nl-NL", {
                day: "2-digit", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit"
            }).format(date);
        }

        function syncPreview() {
            var title = titleInput && titleInput.value.trim()
                ? titleInput.value.trim()
                : t(translations, "preview.defaultTitle", "No title entered yet");
            var markdown = editor.value.trim();
            var showFrom = formatDate(showFromInput && showFromInput.value);
            var showUntil = formatDate(showUntilInput && showUntilInput.value);

            if (previewTitle) {
                previewTitle.textContent = title;
            }

            if (previewMeta) {
                if (showFrom && showUntil) {
                    previewMeta.textContent = t(translations, "preview.visibleFromTo", "Visible from {0} until {1}", [showFrom, showUntil]);
                } else if (showFrom) {
                    previewMeta.textContent = t(translations, "preview.visibleFrom", "Visible from {0}", [showFrom]);
                } else if (showUntil) {
                    previewMeta.textContent = t(translations, "preview.visibleUntil", "Visible until {0}", [showUntil]);
                } else {
                    previewMeta.textContent = t(translations, "preview.defaultMeta", "Not yet scheduled");
                }
            }

            var emptyHtml = '<div class="est-previewEmpty"><strong>' +
                t(translations, "preview.heading", "Your message appears here") +
                '</strong><p>' +
                t(translations, "preview.text", "Write markdown in the text field on the left.") +
                '</p></div>';
            // nosec: markdownToHtml escapes all HTML entities before processing
            preview.innerHTML = markdown ? markdownToHtml(markdown) : emptyHtml;
            preview.classList.toggle("is-empty", markdown === "");
        }

        // ── Event bindings ───────────────────────────────────────────

        editor.addEventListener("input", syncPreview);
        titleInput?.addEventListener("input", syncPreview);
        showFromInput?.addEventListener("input", syncPreview);
        showUntilInput?.addEventListener("input", syncPreview);
    }

    function initConfirmActions() {
        document.querySelectorAll(".est-confirmAction").forEach(function (button) {
            button.addEventListener("click", function (event) {
                var tr = getTranslations(button);
                var message = button.getAttribute("data-confirm-message") || t(tr, "confirm.default", "Are you sure?");
                if (!window.confirm(message)) {
                    event.preventDefault();
                }
            });
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("[data-notification-editor]").forEach(initMarkdownEditor);
        initConfirmActions();
    });
})();
