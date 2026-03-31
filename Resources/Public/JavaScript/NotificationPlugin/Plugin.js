(function () {
    const API_BASE = "/neos/notifications/api/";
    const CONTENT_ROUTE_HINT = "/neos/content";
    const START_RETRY_DELAY = 500;
    const START_RETRY_LIMIT = 20;
    const PANEL_WIDTH = 360;
    let started = false;

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

    function findTopBarHost() {
        return (
            document.querySelector("#neos-top-bar") ||
            document.querySelector('#neos-application [class*="primaryToolbar__rightSidedActions"]') ||
            document.querySelector('#neos-application [class*="primaryToolbar"]')
        );
    }

    function createShell() {
        const topBar = findTopBarHost();
        if (!topBar || document.getElementById("editor-notifications-badge")) {
            return null;
        }

        const wrapper = document.createElement("div");
        wrapper.className = "editor-notifications-plugin";
        wrapper.innerHTML = `
            <button id="editor-notifications-badge" class="editor-notifications-badge" type="button" hidden>
                <span class="editor-notifications-badge__icon" aria-hidden="true"></span>
                <span class="editor-notifications-badge__label">Notificaties</span>
                <span class="editor-notifications-badge__count">0</span>
            </button>
            <div id="editor-notifications-backdrop" class="editor-notifications-backdrop" hidden></div>
            <div id="editor-notifications-panel" class="editor-notifications-panel" hidden>
                <div class="editor-notifications-panel__header">
                    <div class="editor-notifications-panel__heading">
                        <strong>Notificaties</strong>
                        <span class="editor-notifications-panel__count">0 ongelezen</span>
                    </div>
                    <button type="button" class="editor-notifications-panel__close" aria-label="Sluiten">×</button>
                </div>
                <div class="editor-notifications-panel__body">
                    <div class="editor-notifications-panel__list"></div>
                    <div class="editor-notifications-panel__detail">
                        <div class="editor-notifications-panel__empty">Selecteer een notificatie om de inhoud te bekijken.</div>
                    </div>
                </div>
            </div>
        `;

        const style = document.createElement("style");
        style.textContent = `
            .editor-notifications-plugin { position: relative; width: 40px; height: 40px; flex: 0 0 40px; order: 2; }
            .editor-notifications-badge { position: relative; width: 40px; height: 40px; border: 0; border-left: 1px solid rgba(255,255,255,.08); border-right: 1px solid rgba(0,0,0,.35); background: #262624; color: #fff; cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
            .editor-notifications-badge:hover { background: #323232; }
            .editor-notifications-badge.is-open { background: #1f1f1d; }
            .editor-notifications-badge__icon { position: relative; width: 14px; height: 14px; border: 2px solid currentColor; border-radius: 8px 8px 3px 3px; box-sizing: border-box; opacity: .95; }
            .editor-notifications-badge__icon::before { content: ""; position: absolute; left: 3px; top: -5px; width: 4px; height: 4px; border: 2px solid currentColor; border-bottom: 0; border-radius: 4px 4px 0 0; }
            .editor-notifications-badge__icon::after { content: ""; position: absolute; left: 3px; bottom: -4px; width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
            .editor-notifications-badge__label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
            .editor-notifications-badge__count { position: absolute; top: 7px; right: 5px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: #ff7a1a; color: #fff; font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; box-sizing: border-box; }
            .editor-notifications-backdrop { position: fixed; inset: 40px 0 0 0; background: rgba(0, 0, 0, .2); z-index: 1080; }
            .editor-notifications-panel { position: fixed; top: 40px; right: 0; bottom: 0; width: ${PANEL_WIDTH}px; max-width: min(100vw, ${PANEL_WIDTH}px); background: #222; color: #fff; border-left: 1px solid #3f3f3f; z-index: 1090; display: flex; flex-direction: column; box-shadow: none; }
            .editor-notifications-panel__header { display: flex; align-items: flex-start; justify-content: space-between; min-height: 61px; padding: 14px 16px; border-bottom: 1px solid #3f3f3f; background: #323232; box-sizing: border-box; }
            .editor-notifications-panel__heading { display: flex; flex-direction: column; gap: 4px; }
            .editor-notifications-panel__heading strong { font-size: 15px; font-weight: 600; }
            .editor-notifications-panel__count { font-size: 12px; color: #adadad; }
            .editor-notifications-panel__close { width: 32px; height: 32px; border: 0; background: transparent; color: #fff; font-size: 26px; line-height: 32px; cursor: pointer; }
            .editor-notifications-panel__close:hover { background: rgba(255,255,255,.08); }
            .editor-notifications-panel__body { display: flex; flex-direction: column; min-height: 0; flex: 1; }
            .editor-notifications-panel__list { border-bottom: 1px solid #3f3f3f; overflow: auto; max-height: 45%; background: #252525; }
            .editor-notifications-panel__detail { flex: 1; overflow: auto; padding: 16px; background: #222; box-sizing: border-box; }
            .editor-notifications-panel__empty { color: #adadad; font-size: 13px; line-height: 1.5; }
            .editor-notification-item { width: 100%; display: block; text-align: left; border: 0; border-bottom: 1px solid #3f3f3f; background: transparent; color: inherit; padding: 14px 16px; cursor: pointer; }
            .editor-notification-item:hover, .editor-notification-item.is-active { background: #323232; }
            .editor-notification-item.is-unread .editor-notification-item__title::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 8px; border-radius: 50%; background: #ff7a1a; vertical-align: middle; }
            .editor-notification-item__title { display: block; font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 4px; }
            .editor-notification-item__date { display: block; color: #adadad; font-size: 12px; }
            .editor-notifications-panel__meta { color: #adadad; font-size: 12px; margin-bottom: 16px; }
            .editor-notifications-panel__content { color: #fff; font-size: 14px; line-height: 1.6; }
            .editor-notifications-panel__content img { max-width: 100%; height: auto; }
            .editor-notifications-panel__content a { color: #00b5ff; }
            .editor-notifications-panel__detailActions { display: flex; gap: 8px; margin-top: 20px; }
            .editor-notifications-panel__detailActions button,
            .editor-notifications-panel__detailActions a { min-height: 32px; padding: 0 12px; border: 0; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }
            .editor-notifications-panel__dismiss { background: #3f3f3f; color: #fff; }
            .editor-notifications-panel__dismiss:hover { background: #4b4b4b; }
            .editor-notifications-panel__manage { background: #00b5ff; color: #141414; }
            .editor-notifications-panel__manage:hover { background: #39c6ff; }
            .editor-notifications-toast { position: fixed; right: 24px; bottom: 24px; z-index: 1200; background: #111827; color: #fff; padding: 16px 18px; border-radius: 14px; box-shadow: 0 18px 40px rgba(0,0,0,.35); max-width: 320px; cursor: pointer; }
        `;
        document.head.appendChild(style);

        const rightActions = topBar.matches('[class*="rightSidedActions"]') ? topBar : topBar.querySelector('[class*="rightSidedActions"]');
        const publishWrapper = rightActions ? Array.from(rightActions.children).find(function (child) {
            return child.id === "neos-PublishDropDown" || child.querySelector("#neos-PublishDropDown");
        }) : null;

        if (rightActions && publishWrapper) {
            rightActions.insertBefore(wrapper, publishWrapper);
        } else {
            topBar.appendChild(wrapper);
        }

        return wrapper;
    }

    function renderPanel(wrapper, data) {
        const badge = wrapper.querySelector("#editor-notifications-badge");
        const count = badge.querySelector(".editor-notifications-badge__count");
        const panel = wrapper.querySelector("#editor-notifications-panel");
        const backdrop = wrapper.querySelector("#editor-notifications-backdrop");
        const list = wrapper.querySelector(".editor-notifications-panel__list");
        const detail = wrapper.querySelector(".editor-notifications-panel__detail");
        const countLabel = wrapper.querySelector(".editor-notifications-panel__count");

        count.textContent = String(data.count);
        badge.hidden = data.count === 0;
        countLabel.textContent = data.count === 0 ? "Geen ongelezen notificaties" : `${data.count} ongelezen${data.count === 1 ? "" : ""}`;
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
                list.querySelectorAll(".editor-notification-item").forEach(function (entry) {
                    entry.classList.remove("is-active");
                });
                button.classList.add("is-active");
                renderDetail(detail, item);
                refresh(wrapper, false);
            });
            list.appendChild(button);

            if (index === 0) {
                button.classList.add("is-active");
                renderDetail(detail, item);
            }
        });

        if (data.items.length === 0) {
            detail.innerHTML = '<div class="editor-notifications-panel__empty">Er zijn momenteel geen actieve notificaties.</div>';
        }

        function setOpenState(isOpen) {
            panel.hidden = !isOpen;
            backdrop.hidden = !isOpen;
            badge.classList.toggle("is-open", isOpen);
        }

        badge.onclick = function () {
            setOpenState(panel.hidden);
        };
        wrapper.querySelector(".editor-notifications-panel__close").onclick = function () {
            setOpenState(false);
        };
        backdrop.onclick = function () {
            setOpenState(false);
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

    async function boot() {
        if (started || !isContentModule()) {
            return;
        }

        if (!isContentModule()) {
            return;
        }

        const wrapper = createShell();
        if (!wrapper) {
            return;
        }

        started = true;

        try {
            await refresh(wrapper, true);
            window.setInterval(function () {
                refresh(wrapper, false);
            }, 60000);
        } catch (error) {
            // Keep the content module usable even if the notification endpoint is unavailable.
        }
    }

    function start(attempt = 0) {
        boot().catch(function () {
            // Keep the content module usable even if the notification endpoint is unavailable.
        });

        if (started || attempt >= START_RETRY_LIMIT) {
            return;
        }

        window.setTimeout(function () {
            start(attempt + 1);
        }, START_RETRY_DELAY);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
