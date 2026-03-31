(function () {
    function initEditor(root) {
        const editor = root.querySelector("[data-editor-surface]");
        const source = root.querySelector("[data-editor-source]");
        const preview = document.getElementById(root.getAttribute("data-preview-target"));
        const uploadInput = root.querySelector("[data-editor-upload-input]");

        if (!editor || !source || !preview) {
            return;
        }

        editor.innerHTML = source.value || editor.innerHTML || "";
        preview.innerHTML = editor.innerHTML;

        function sync() {
            source.value = editor.innerHTML.trim();
            preview.innerHTML = source.value;
        }

        root.querySelectorAll("[data-editor-command]").forEach((button) => {
            button.addEventListener("click", function () {
                document.execCommand(button.getAttribute("data-editor-command"), false);
                sync();
                editor.focus();
            });
        });

        root.querySelector("[data-editor-link]")?.addEventListener("click", function () {
            const url = window.prompt("Voer een URL in");
            if (!url) {
                return;
            }
            document.execCommand("createLink", false, url);
            sync();
            editor.focus();
        });

        root.querySelector("[data-editor-image-url]")?.addEventListener("click", function () {
            const url = window.prompt("Voer de URL van een afbeelding in");
            if (!url) {
                return;
            }
            document.execCommand("insertImage", false, url);
            sync();
            editor.focus();
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
                    document.execCommand("insertImage", false, result);
                    sync();
                }
            };
            reader.readAsDataURL(file);
            uploadInput.value = "";
        });

        editor.addEventListener("input", sync);
        root.addEventListener("submit", sync);
    }

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("[data-notification-editor]").forEach(initEditor);
    });
})();
