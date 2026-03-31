(function () {
    function initEditor(root) {
        const editor = root.querySelector("[data-editor-surface]");
        const source = root.querySelector("[data-editor-source]");
        const preview = document.getElementById(root.getAttribute("data-preview-target"));
        const previewTitle = document.getElementById(root.getAttribute("data-preview-title-target"));
        const previewMeta = document.getElementById(root.getAttribute("data-preview-meta-target"));
        const uploadInput = root.querySelector("[data-editor-upload-input]");
        const titleInput = root.querySelector('input[name="moduleArguments[title]"]');
        const showFromInput = root.querySelector('input[name="moduleArguments[showFrom]"]');
        const showUntilInput = root.querySelector('input[name="moduleArguments[showUntil]"]');

        if (!editor || !source || !preview) {
            return;
        }

        let savedRange = null;
        editor.innerHTML = source.value || editor.innerHTML || "";
        syncPreview();

        function saveSelection() {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                return;
            }

            const range = selection.getRangeAt(0);
            if (!editor.contains(range.commonAncestorContainer)) {
                return;
            }

            savedRange = range.cloneRange();
        }

        function hasActiveEditorSelection() {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                return false;
            }

            const range = selection.getRangeAt(0);
            return editor.contains(range.commonAncestorContainer);
        }

        function restoreSelection() {
            if (hasActiveEditorSelection()) {
                return;
            }

            if (!savedRange) {
                editor.focus();
                return;
            }

            const selection = window.getSelection();
            if (!selection) {
                return;
            }

            selection.removeAllRanges();
            selection.addRange(savedRange);
        }

        function getEditorRange() {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                if (editor.contains(range.commonAncestorContainer)) {
                    return range;
                }
            }

            if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
                return savedRange.cloneRange();
            }

            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            return range;
        }

        function selectRange(range) {
            const selection = window.getSelection();
            if (!selection) {
                return;
            }

            selection.removeAllRanges();
            selection.addRange(range);
            savedRange = range.cloneRange();
        }

        function createList(type) {
            const range = getEditorRange();
            if (!range) {
                return false;
            }

            const fragment = range.cloneContents();
            const fragmentContainer = document.createElement("div");
            fragmentContainer.appendChild(fragment);
            const normalizedText = fragmentContainer.innerHTML
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<(div|p|li|ul|ol|blockquote|h[1-6])[^>]*>/gi, "\n")
                .replace(/<\/(div|p|li|ul|ol|blockquote|h[1-6])>/gi, "\n")
                .replace(/<li[^>]*>/gi, "")
                .replace(/<[^>]+>/g, "")
                .replace(/\u00a0/g, " ");
            const selectedText = normalizedText.trim() || range.toString().trim();
            const lines = selectedText
                ? selectedText.split(/\n+/).map((line) => line.trim()).filter(Boolean)
                : [""];

            const list = document.createElement(type);
            lines.forEach((line) => {
                const item = document.createElement("li");
                if (line) {
                    item.textContent = line;
                } else {
                    item.appendChild(document.createElement("br"));
                }
                list.appendChild(item);
            });

            range.deleteContents();
            range.insertNode(list);

            const cursorTarget = list.querySelector("li");
            if (cursorTarget) {
                const newRange = document.createRange();
                newRange.selectNodeContents(cursorTarget);
                newRange.collapse(cursorTarget.textContent.length === 0);
                selectRange(newRange);
            }

            return true;
        }

        function applyCommand(command) {
            if (command === "insertUnorderedList" || command === "insertOrderedList") {
                restoreSelection();
                editor.focus();
                createList(command === "insertOrderedList" ? "ol" : "ul");
                sync();
                editor.focus();
                saveSelection();
                return;
            }

            restoreSelection();
            editor.focus();
            document.execCommand(command, false);

            sync();
            editor.focus();
            saveSelection();
        }

        function formatDate(value) {
            if (!value) {
                return "";
            }

            const date = new Date(value);
            if (Number.isNaN(date.getTime())) {
                return "";
            }

            return new Intl.DateTimeFormat("nl-NL", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }).format(date);
        }

        function syncPreview() {
            const title = titleInput && titleInput.value.trim()
                ? titleInput.value.trim()
                : "Nog geen titel ingevuld";
            const body = source.value.trim();
            const showFrom = formatDate(showFromInput && showFromInput.value);
            const showUntil = formatDate(showUntilInput && showUntilInput.value);

            if (previewTitle) {
                previewTitle.textContent = title;
            }

            if (previewMeta) {
                if (showFrom && showUntil) {
                    previewMeta.textContent = "Zichtbaar van " + showFrom + " tot " + showUntil;
                } else if (showFrom) {
                    previewMeta.textContent = "Zichtbaar vanaf " + showFrom;
                } else if (showUntil) {
                    previewMeta.textContent = "Zichtbaar tot " + showUntil;
                } else {
                    previewMeta.textContent = "Nog niet ingepland";
                }
            }

            preview.innerHTML = body || [
                "<div class=\"est-previewEmpty\">",
                "<strong>Hier verschijnt je bericht</strong>",
                "<p>Begin met een korte samenvatting, voeg daarna eventueel een lijst of screenshot toe.</p>",
                "</div>"
            ].join("");
            preview.classList.toggle("is-empty", body === "");
            editor.classList.toggle("is-empty", editor.textContent.trim() === "" && editor.querySelectorAll("img, ul, ol, blockquote").length === 0);
        }

        function sync() {
            source.value = editor.innerHTML.trim();
            syncPreview();
        }

        root.querySelectorAll("[data-editor-command]").forEach((button) => {
            button.addEventListener("mousedown", function (event) {
                event.preventDefault();
            });
            button.addEventListener("click", function () {
                applyCommand(button.getAttribute("data-editor-command"));
            });
        });

        root.querySelector("[data-editor-link]")?.addEventListener("mousedown", function (event) {
            event.preventDefault();
            saveSelection();
        });

        root.querySelector("[data-editor-link]")?.addEventListener("click", function () {
            restoreSelection();
            const url = window.prompt("Voer een URL in");
            if (!url) {
                return;
            }
            document.execCommand("createLink", false, url);
            sync();
            editor.focus();
            saveSelection();
        });

        root.querySelector("[data-editor-image-url]")?.addEventListener("mousedown", function (event) {
            event.preventDefault();
            saveSelection();
        });

        root.querySelector("[data-editor-image-url]")?.addEventListener("click", function () {
            restoreSelection();
            const url = window.prompt("Voer de URL van een afbeelding in");
            if (!url) {
                return;
            }
            document.execCommand("insertImage", false, url);
            sync();
            editor.focus();
            saveSelection();
        });

        root.querySelector("[data-editor-upload]")?.addEventListener("mousedown", function (event) {
            event.preventDefault();
            saveSelection();
        });

        root.querySelector("[data-editor-upload]")?.addEventListener("click", function () {
            uploadInput?.click();
        });

        uploadInput?.addEventListener("change", function () {
            const file = uploadInput.files && uploadInput.files[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.onload = function (event) {
                const result = event.target && event.target.result;
                if (typeof result === "string") {
                    restoreSelection();
                    document.execCommand("insertImage", false, result);
                    sync();
                    saveSelection();
                }
            };
            reader.readAsDataURL(file);
            uploadInput.value = "";
        });

        editor.addEventListener("input", sync);
        editor.addEventListener("mouseup", saveSelection);
        editor.addEventListener("keyup", saveSelection);
        editor.addEventListener("focus", saveSelection);
        document.addEventListener("selectionchange", saveSelection);
        titleInput?.addEventListener("input", syncPreview);
        showFromInput?.addEventListener("input", syncPreview);
        showUntilInput?.addEventListener("input", syncPreview);
        root.addEventListener("submit", sync);
        editor.addEventListener("focus", function () {
            editor.classList.remove("is-empty");
        });
        editor.addEventListener("blur", syncPreview);
    }

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("[data-notification-editor]").forEach(initEditor);
    });
})();
