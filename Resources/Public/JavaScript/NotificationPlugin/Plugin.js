(function () {
    const API_BASE = "/neos/notifications/api/";
    const TOP_BAR_SELECTOR = "#neos-top-bar";
    const CONTENT_ROUTE_HINT = "/neos/content";

    function getCsrfToken() {
        const userMenu = document.querySelector(".neos-user-menu[data-csrf-token]");
        return userMenu ? userMenu.getAttribute("data-csrf-token") || "" : "";
    }

    function isContentModule() {
        return window.location.pathname.indexOf(CONTENT_ROUTE_HINT) !== -1 || document.getElementById("neos-application");
    }

    async function request(path, options) {
        const response = await fetch(API_BASE + path, {
            credentials: "same-origin",
            headers: {
                "X-Requested-With": "XMLHttpRequest",
                ...(options && options.method === "POST" ? { "X-Flow-Csrftoken": getCsrfToken() } : {}),
            },
            ...options,
        });

        if (!response.ok) {
            throw new Error("Request failed");
        }

        return response.json();
    }

    function createShell() {
        const topBar = document.querySelector(TOP_BAR_SELECTOR);
        if (!topBar || document.getElementById("editor-notifications-badge")) {
            return null;
        }

        const wrapper = document.createElement("div");
        wrapper.className = "editor-notifications-plugin";
        wrapper.innerHTML = `
            <button id="editor-notifications-badge" class="editor-notifications-badge" type="button" hidden>
                <span class="editor-notifications-badge__icon">bell</span>
                <span class="editor-notifications-badge__count">0</span>
            </button>
            <div id="editor-notifications-panel" class="editor-notifications-panel" hidden>
                <div class="editor-notifications-panel__header">
                    <strong>Nieuwe notificaties</strong>
                    <button type="button" class="editor-notifications-panel__close">Sluiten</button>
                </div>
                <div class="editor-notifications-panel__list"></div>
                <div class="editor-notifications-panel__detail">
                    <div class="editor-notifications-panel__empty">Selecteer een notificatie om de inhoud te bekijken.</div>
                </div>
            </div>
        `;

        const style = document.createElement("style");
        style.textContent = `
            .editor-notifications-plugin { position: relative; margin-left: 12px; }
            .editor-notifications-badge { display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 999px; background: #d4572d; color: #fff; padding: 8px 12px; cursor: pointer; }
            .editor-notifications-badge__icon { font-size: 0; width: 10px; height: 10px; border-radius: 50%; background: currentColor; opacity: .85; }
            .editor-notifications-panel { position: absolute; right: 0; top: calc(100% + 10px); z-index: 1100; width: 760px; max-width: calc(100vw - 40px); background: #fff; color: #1b1b1b; border-radius: 14px; box-shadow: 0 25px 60px rgba(0,0,0,.25); overflow: hidden; }
            .editor-notifications-panel__header { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; border-bottom: 1px solid #e8e8e8; }
            .editor-notifications-panel__close { border: 0; background: transparent; cursor: pointer; color: #666; }
            .editor-notifications-panel__list { width: 32%; float: left; max-height: 460px; overflow: auto; border-right: 1px solid #e8e8e8; }
            .editor-notifications-panel__detail { margin-left: 32%; padding: 18px; min-height: 240px; max-height: 460px; overflow: auto; }
            .editor-notification-item { width: 100%; display: block; text-align: left; border: 0; background: #fff; padding: 14px 16px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
            .editor-notification-item.is-unread { background: #fff6ed; }
            .editor-notification-item__title { display: block; font-weight: 700; margin-bottom: 4px; }
            .editor-notification-item__date { display: block; color: #7b7b7b; font-size: 12px; }
            .editor-notifications-panel__detail img { max-width: 100%; height: auto; border-radius: 10px; }
            .editor-notifications-panel__detailActions { display: flex; gap: 10px; margin-top: 18px; }
            .editor-notifications-panel__detailActions button { border: 0; border-radius: 999px; padding: 10px 14px; cursor: pointer; }
            .editor-notifications-panel__dismiss { background: #f2f2f2; color: #333; }
            .editor-notifications-panel__manage { background: #111827; color: #fff; text-decoration: none; padding: 10px 14px; border-radius: 999px; }
            .editor-notifications-toast { position: fixed; right: 24px; bottom: 24px; z-index: 1200; background: #111827; color: #fff; padding: 16px 18px; border-radius: 14px; box-shadow: 0 18px 40px rgba(0,0,0,.35); max-width: 320px; cursor: pointer; }
        `;
        document.head.appendChild(style);

        topBar.appendChild(wrapper);
        return wrapper;
    }

    function renderPanel(wrapper, data) {
        const badge = wrapper.querySelector("#editor-notifications-badge");
        const count = badge.querySelector(".editor-notifications-badge__count");
        const panel = wrapper.querySelector("#editor-notifications-panel");
        const list = wrapper.querySelector(".editor-notifications-panel__list");
        const detail = wrapper.querySelector(".editor-notifications-panel__detail");

        count.textContent = String(data.count);
        badge.hidden = data.count === 0;
        list.innerHTML = "";

        data.items.forEach((item, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "editor-notification-item" + (item.isSeen ? "" : " is-unread");
            button.innerHTML = `
                <span class="editor-notification-item__title">${item.title}</span>
                <span class="editor-notification-item__date">${item.publishedAt ? new Date(item.publishedAt).toLocaleString("nl-NL") : "Concept"}</span>
            `;
            button.addEventListener("click", async function () {
                await request("markSeen", {
                    method: "POST",
                    body: new URLSearchParams({ notificationIdentifier: item.identifier }),
                });
                renderDetail(detail, item);
                refresh(wrapper, false);
            });
            list.appendChild(button);

            if (index === 0) {
                renderDetail(detail, item);
            }
        });

        if (data.items.length === 0) {
            detail.innerHTML = '<div class="editor-notifications-panel__empty">Er zijn momenteel geen actieve notificaties.</div>';
        }

        badge.onclick = function () {
            panel.hidden = !panel.hidden;
        };
        wrapper.querySelector(".editor-notifications-panel__close").onclick = function () {
            panel.hidden = true;
        };
    }

    function renderDetail(detail, item) {
        detail.innerHTML = `
            <h3>${item.title}</h3>
            <div class="editor-notifications-panel__meta">${item.publishedAt ? new Date(item.publishedAt).toLocaleString("nl-NL") : ""}</div>
            <div class="editor-notifications-panel__content">${item.content}</div>
            <div class="editor-notifications-panel__detailActions">
                <button type="button" class="editor-notifications-panel__dismiss">Niet meer tonen</button>
                <a class="editor-notifications-panel__manage" href="/neos/administration/notifications">Beheer</a>
            </div>
        `;

        detail.querySelector(".editor-notifications-panel__dismiss").addEventListener("click", async function () {
            await request("dismiss", {
                method: "POST",
                body: new URLSearchParams({ notificationIdentifier: item.identifier }),
            });
            refresh(document.querySelector(".editor-notifications-plugin"), false);
        });
    }

    function showToast(wrapper, count) {
        if (!count || document.querySelector(".editor-notifications-toast")) {
            return;
        }

        const toast = document.createElement("button");
        toast.type = "button";
        toast.className = "editor-notifications-toast";
        toast.innerHTML = `<strong>${count} nieuwe notificatie${count === 1 ? "" : "s"}</strong><div>Klik om ze te bekijken.</div>`;
        toast.addEventListener("click", function () {
            wrapper.querySelector("#editor-notifications-panel").hidden = false;
            toast.remove();
        });
        document.body.appendChild(toast);
        setTimeout(function () {
            toast.remove();
        }, 10000);
    }

    async function refresh(wrapper, allowToast) {
        const data = await request("active");
        renderPanel(wrapper, data);
        if (allowToast && data.count > 0) {
            showToast(wrapper, data.count);
        }
    }

    async function start() {
        if (!isContentModule()) {
            return;
        }

        const wrapper = createShell();
        if (!wrapper) {
            return;
        }

        try {
            await refresh(wrapper, true);
            window.setInterval(function () {
                refresh(wrapper, false);
            }, 60000);
        } catch (error) {
            // Keep the content module usable even if the notification endpoint is unavailable.
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
