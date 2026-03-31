(function () {
    var MAX_IMAGE_WIDTH = 800;
    var IMAGE_QUALITY = 0.8;

    function initEditor(root) {
        var editor = root.querySelector("[data-editor-surface]");
        var source = root.querySelector("[data-editor-source]");
        var preview = document.getElementById(root.getAttribute("data-preview-target"));
        var previewTitle = document.getElementById(root.getAttribute("data-preview-title-target"));
        var previewMeta = document.getElementById(root.getAttribute("data-preview-meta-target"));
        var uploadInput = root.querySelector("[data-editor-upload-input]");
        var titleInput = root.querySelector('input[name="moduleArguments[title]"]');
        var showFromInput = root.querySelector('input[name="moduleArguments[showFrom]"]');
        var showUntilInput = root.querySelector('input[name="moduleArguments[showUntil]"]');

        if (!editor || !source || !preview) {
            return;
        }

        var savedRange = null;
        // nosec: source.value is admin-authored content from server, not user input
        editor.innerHTML = source.value || editor.innerHTML || "";
        syncPreview();

        // ── Selection helpers ────────────────────────────────────────

        function saveSelection() {
            var selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                return;
            }

            var range = selection.getRangeAt(0);
            if (!editor.contains(range.commonAncestorContainer)) {
                return;
            }

            savedRange = range.cloneRange();
        }

        function hasActiveEditorSelection() {
            var selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                return false;
            }

            var range = selection.getRangeAt(0);
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

            var selection = window.getSelection();
            if (!selection) {
                return;
            }

            selection.removeAllRanges();
            selection.addRange(savedRange);
        }

        function getEditorRange() {
            var selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                var range = selection.getRangeAt(0);
                if (editor.contains(range.commonAncestorContainer)) {
                    return range;
                }
            }

            if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
                return savedRange.cloneRange();
            }

            var range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            return range;
        }

        function selectRange(range) {
            var selection = window.getSelection();
            if (!selection) {
                return;
            }

            selection.removeAllRanges();
            selection.addRange(range);
            savedRange = range.cloneRange();
        }

        // ── Inline formatting (replaces document.execCommand) ────────

        function getClosestTag(tagName) {
            var range = getEditorRange();
            var node = range.commonAncestorContainer;
            if (node.nodeType === Node.TEXT_NODE) {
                node = node.parentNode;
            }
            var upper = tagName.toUpperCase();
            while (node && node !== editor) {
                if (node.nodeType === Node.ELEMENT_NODE && node.tagName === upper) {
                    return node;
                }
                node = node.parentNode;
            }
            return null;
        }

        function unwrapElement(el) {
            var parent = el.parentNode;
            while (el.firstChild) {
                parent.insertBefore(el.firstChild, el);
            }
            parent.removeChild(el);
            parent.normalize();
        }

        function toggleInlineFormat(tagName) {
            restoreSelection();
            editor.focus();

            var existing = getClosestTag(tagName);
            if (existing) {
                unwrapElement(existing);
                sync();
                saveSelection();
                return;
            }

            var range = getEditorRange();
            if (!range) {
                return;
            }

            var wrapper = document.createElement(tagName);

            if (range.collapsed) {
                wrapper.appendChild(document.createTextNode("\u200B"));
                range.insertNode(wrapper);
                var r = document.createRange();
                r.setStart(wrapper.firstChild, 1);
                r.collapse(true);
                selectRange(r);
            } else {
                try {
                    range.surroundContents(wrapper);
                } catch (e) {
                    var contents = range.extractContents();
                    wrapper.appendChild(contents);
                    range.insertNode(wrapper);
                }
                var r = document.createRange();
                r.selectNodeContents(wrapper);
                selectRange(r);
            }

            sync();
            saveSelection();
        }

        // ── List creation ────────────────────────────────────────────

        function createList(type) {
            editor.focus();
            restoreSelection();

            // Get selected text or current line text
            var range = getEditorRange();
            var selectedText = range ? range.toString().trim() : "";

            // Split into lines for multi-line selections
            var lines = selectedText
                ? selectedText.split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean)
                : [];

            // Build the list HTML
            var listHtml;
            if (lines.length > 0) {
                var itemsHtml = lines.map(function (line) {
                    // Escape HTML in the line text
                    var escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    return "<li>" + escaped + "</li>";
                }).join("");
                listHtml = "<" + type + ">" + itemsHtml + "</" + type + ">";
            } else {
                listHtml = "<" + type + "><li><br></li></" + type + ">";
            }

            // Delete selected content if any
            if (range && !range.collapsed) {
                range.deleteContents();
            }

            // Insert the list HTML at the cursor position using a temporary marker
            // This is more reliable than insertNode for contenteditable lists
            var marker = document.createElement("span");
            marker.id = "est-list-insert-marker";
            if (range) {
                range.insertNode(marker);
            } else {
                editor.appendChild(marker);
            }

            // Replace marker with list HTML
            // nosec: listHtml is built from escaped user text, not external input
            marker.outerHTML = listHtml;

            // Place cursor in the first list item
            var insertedList = editor.querySelector(type + ":last-of-type");
            if (insertedList) {
                var firstLi = insertedList.querySelector("li");
                if (firstLi) {
                    var sel = window.getSelection();
                    var newRange = document.createRange();
                    newRange.setStart(firstLi, 0);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    savedRange = newRange.cloneRange();
                }
            }

            sync();
        }

        // ── Link insertion (Range API) ───────────────────────────────

        function insertLink(url) {
            restoreSelection();
            editor.focus();

            var range = getEditorRange();
            if (!range || !url) {
                return;
            }

            var anchor = document.createElement("a");
            anchor.href = url;
            anchor.target = "_blank";
            anchor.rel = "noopener";

            if (range.collapsed) {
                anchor.textContent = url;
                range.insertNode(anchor);
            } else {
                try {
                    range.surroundContents(anchor);
                } catch (e) {
                    var contents = range.extractContents();
                    anchor.appendChild(contents);
                    range.insertNode(anchor);
                }
            }

            var r = document.createRange();
            r.setStartAfter(anchor);
            r.collapse(true);
            selectRange(r);

            sync();
            saveSelection();
        }

        // ── Image insertion (DOM-based) ──────────────────────────────

        function insertImage(url) {
            restoreSelection();
            editor.focus();

            var range = getEditorRange();
            if (!range || !url) {
                return;
            }

            var img = document.createElement("img");
            img.src = url;
            img.alt = "";

            range.collapse(false);
            range.insertNode(img);

            var r = document.createRange();
            r.setStartAfter(img);
            r.collapse(true);
            selectRange(r);

            sync();
            saveSelection();
        }

        // ── Client-side image compression + insert ─────────────────

        function compressAndInsertImage(file) {
            var reader = new FileReader();
            reader.onload = function (e) {
                var img = new Image();
                img.onload = function () {
                    var width = img.width;
                    var height = img.height;

                    // Downscale if wider than MAX_IMAGE_WIDTH
                    if (width > MAX_IMAGE_WIDTH) {
                        height = Math.round(height * (MAX_IMAGE_WIDTH / width));
                        width = MAX_IMAGE_WIDTH;
                    }

                    var canvas = document.createElement("canvas");
                    canvas.width = width;
                    canvas.height = height;
                    var ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, width, height);

                    var dataUrl = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
                    restoreSelection();
                    insertImage(dataUrl);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        // ── Image resize popover ─────────────────────────────────────

        var imageResizePopover = null;
        var activeResizeImage = null;

        function createImageResizePopover() {
            var popover = document.createElement("div");
            popover.className = "est-image-resize-popover";
            popover.style.cssText = "position:absolute;z-index:10000;background:#333;border-radius:4px;padding:4px 6px;display:flex;gap:4px;box-shadow:0 2px 8px rgba(0,0,0,0.3);";
            var sizes = [
                { label: "25%", value: "25%" },
                { label: "50%", value: "50%" },
                { label: "75%", value: "75%" },
                { label: "100%", value: "100%" }
            ];
            sizes.forEach(function (size) {
                var btn = document.createElement("button");
                btn.type = "button";
                btn.textContent = size.label;
                btn.style.cssText = "background:#555;color:#fff;border:none;border-radius:3px;padding:3px 8px;cursor:pointer;font-size:12px;line-height:1.4;";
                btn.addEventListener("mousedown", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                });
                btn.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (activeResizeImage) {
                        activeResizeImage.style.maxWidth = size.value;
                        activeResizeImage.style.width = size.value;
                        sync();
                    }
                    dismissImageResizePopover();
                });
                popover.appendChild(btn);
            });
            return popover;
        }

        function showImageResizePopover(img) {
            dismissImageResizePopover();
            activeResizeImage = img;
            imageResizePopover = createImageResizePopover();
            document.body.appendChild(imageResizePopover);

            var rect = img.getBoundingClientRect();
            var popoverWidth = 200;
            var left = rect.left + (rect.width / 2) - (popoverWidth / 2);
            var top = rect.top - 36;
            if (top < 0) {
                top = rect.bottom + 4;
            }
            imageResizePopover.style.left = (left + window.scrollX) + "px";
            imageResizePopover.style.top = (top + window.scrollY) + "px";
        }

        function dismissImageResizePopover() {
            if (imageResizePopover && imageResizePopover.parentNode) {
                imageResizePopover.parentNode.removeChild(imageResizePopover);
            }
            imageResizePopover = null;
            activeResizeImage = null;
        }

        editor.addEventListener("click", function (e) {
            if (e.target && e.target.tagName === "IMG" && editor.contains(e.target)) {
                showImageResizePopover(e.target);
            } else {
                dismissImageResizePopover();
            }
        });

        document.addEventListener("mousedown", function (e) {
            if (imageResizePopover && !imageResizePopover.contains(e.target) && !(e.target && e.target.tagName === "IMG" && editor.contains(e.target))) {
                dismissImageResizePopover();
            }
        });

        // ── Command dispatcher ───────────────────────────────────────

        function applyCommand(command) {
            if (command === "bold") {
                toggleInlineFormat("strong");
                return;
            }

            if (command === "italic") {
                toggleInlineFormat("em");
                return;
            }

            if (command === "insertUnorderedList" || command === "insertOrderedList") {
                createList(command === "insertOrderedList" ? "ol" : "ul");
                return;
            }
        }

        // ── Preview sync ─────────────────────────────────────────────

        function formatDate(value) {
            if (!value) {
                return "";
            }

            var date = new Date(value);
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
            var title = titleInput && titleInput.value.trim()
                ? titleInput.value.trim()
                : "Nog geen titel ingevuld";
            var body = source.value.trim();
            var showFrom = formatDate(showFromInput && showFromInput.value);
            var showUntil = formatDate(showUntilInput && showUntilInput.value);

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

            // nosec: body is admin-authored HTML from the editor, server-side sanitized before storage
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
            // nosec: editor.innerHTML is the admin's own contenteditable output
            source.value = editor.innerHTML.trim();
            syncPreview();
        }

        // ── Event bindings ───────────────────────────────────────────

        root.querySelectorAll("[data-editor-command]").forEach(function (button) {
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
            var url = window.prompt("Voer een URL in");
            if (url) {
                insertLink(url);
            }
        });

        root.querySelector("[data-editor-image-url]")?.addEventListener("mousedown", function (event) {
            event.preventDefault();
            saveSelection();
        });

        root.querySelector("[data-editor-image-url]")?.addEventListener("click", function () {
            var url = window.prompt("Voer de URL van een afbeelding in");
            if (url) {
                restoreSelection();
                insertImage(url);
            }
        });

        root.querySelector("[data-editor-upload]")?.addEventListener("mousedown", function (event) {
            event.preventDefault();
            saveSelection();
        });

        root.querySelector("[data-editor-upload]")?.addEventListener("click", function () {
            uploadInput?.click();
        });

        uploadInput?.addEventListener("change", function () {
            var file = uploadInput.files && uploadInput.files[0];
            if (!file) {
                return;
            }

            compressAndInsertImage(file);
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

    function initConfirmActions() {
        document.querySelectorAll(".est-confirmAction").forEach(function (button) {
            button.addEventListener("click", function (event) {
                var message = button.getAttribute("data-confirm-message") || "Weet je het zeker?";
                if (!window.confirm(message)) {
                    event.preventDefault();
                }
            });
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("[data-notification-editor]").forEach(initEditor);
        initConfirmActions();
    });
})();
