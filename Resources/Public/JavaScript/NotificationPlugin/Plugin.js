(function () {
    var API_BASE = "/neos/notifications/api/";
    var CONTENT_ROUTE_HINT = "/neos/content";
    var START_RETRY_DELAY = 500;
    var START_RETRY_LIMIT = 20;
    var POLL_INTERVAL = 60000;
    var PANEL_WIDTH = 360;
    var started = false;

    function getCsrfToken() {
        var el = document.querySelector("[data-csrf-token]");
        return el ? el.getAttribute("data-csrf-token") || "" : "";
    }

    function isContentModule() {
        return window.location.pathname.indexOf(CONTENT_ROUTE_HINT) !== -1 || document.getElementById("neos-application");
    }

    /**
     * Sanitize HTML content from notifications before rendering.
     * Removes script/style/iframe tags and on* event handlers.
     * Note: uses innerHTML intentionally — input comes from admin-created
     * notifications that are already sanitized server-side in NotificationService::sanitizeContent().
     * This is a defense-in-depth measure, not the primary XSS boundary.
     */
    function sanitizeHtml(html) {
        var div = document.createElement("div");
        div.innerHTML = html; // nosec: admin-authored content, sanitized server-side
        var dangerous = div.querySelectorAll("script, style, iframe, object, embed");
        for (var i = 0; i < dangerous.length; i++) {
            dangerous[i].remove();
        }
        var allElements = div.querySelectorAll("*");
        for (var j = 0; j < allElements.length; j++) {
            var el = allElements[j];
            var attrs = Array.from(el.attributes);
            for (var k = 0; k < attrs.length; k++) {
                var name = attrs[k].name.toLowerCase();
                if (name.indexOf("on") === 0 || (name === "href" && attrs[k].value.trim().toLowerCase().indexOf("javascript:") === 0)) {
                    el.removeAttribute(attrs[k].name);
                }
            }
        }
        return div.innerHTML; // nosec: sanitized above
    }

    async function request(path, options) {
        var response = await fetch(API_BASE + path, {
            credentials: "same-origin",
            headers: Object.assign(
                { "X-Requested-With": "XMLHttpRequest" },
                options && options.method === "POST" ? { "X-Flow-Csrftoken": getCsrfToken() } : {}
            ),
            method: options && options.method || "GET",
            body: options && options.body || undefined,
        });

        if (!response.ok) {
            throw new Error("EditorNotifications: request to " + path + " failed with status " + response.status);
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
        var topBar = findTopBarHost();
        if (!topBar || document.getElementById("editor-notifications-badge")) {
            return null;
        }

        var wrapper = document.createElement("div");
        wrapper.className = "editor-notifications-plugin";

        // Build shell DOM using safe DOM methods
        var badge = document.createElement("button");
        badge.id = "editor-notifications-badge";
        badge.className = "editor-notifications-badge";
        badge.type = "button";
        badge.hidden = true;

        var badgeIcon = document.createElement("span");
        badgeIcon.className = "editor-notifications-badge__icon";
        badgeIcon.setAttribute("aria-hidden", "true");
        badge.appendChild(badgeIcon);

        var badgeLabel = document.createElement("span");
        badgeLabel.className = "editor-notifications-badge__label";
        badgeLabel.textContent = "Notificaties";
        badge.appendChild(badgeLabel);

        var badgeCount = document.createElement("span");
        badgeCount.className = "editor-notifications-badge__count";
        badgeCount.textContent = "0";
        badge.appendChild(badgeCount);

        wrapper.appendChild(badge);

        var backdrop = document.createElement("div");
        backdrop.id = "editor-notifications-backdrop";
        backdrop.className = "editor-notifications-backdrop";
        backdrop.hidden = true;
        wrapper.appendChild(backdrop);

        var panel = document.createElement("div");
        panel.id = "editor-notifications-panel";
        panel.className = "editor-notifications-panel";
        panel.hidden = true;

        var header = document.createElement("div");
        header.className = "editor-notifications-panel__header";

        var heading = document.createElement("div");
        heading.className = "editor-notifications-panel__heading";
        var headingStrong = document.createElement("strong");
        headingStrong.textContent = "Notificaties";
        heading.appendChild(headingStrong);
        var countSpan = document.createElement("span");
        countSpan.className = "editor-notifications-panel__count";
        countSpan.textContent = "0 ongelezen";
        heading.appendChild(countSpan);
        header.appendChild(heading);

        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "editor-notifications-panel__close";
        closeBtn.setAttribute("aria-label", "Sluiten");
        closeBtn.textContent = "\u00D7";
        header.appendChild(closeBtn);

        panel.appendChild(header);

        var body = document.createElement("div");
        body.className = "editor-notifications-panel__body";

        var list = document.createElement("div");
        list.className = "editor-notifications-panel__list";
        body.appendChild(list);

        var detail = document.createElement("div");
        detail.className = "editor-notifications-panel__detail";
        var emptyMsg = document.createElement("div");
        emptyMsg.className = "editor-notifications-panel__empty";
        emptyMsg.textContent = "Selecteer een notificatie om de inhoud te bekijken.";
        detail.appendChild(emptyMsg);
        body.appendChild(detail);

        panel.appendChild(body);
        wrapper.appendChild(panel);

        var style = document.createElement("style");
        style.textContent =
            ".editor-notifications-plugin { position: relative; width: 40px; height: 40px; flex: 0 0 40px; order: 2; }" +
            ".editor-notifications-badge { position: relative; width: 40px; height: 40px; border: 0; border-left: 1px solid rgba(255,255,255,.08); border-right: 1px solid rgba(0,0,0,.35); background: #262624; color: #fff; cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center; }" +
            ".editor-notifications-badge:hover { background: #323232; }" +
            ".editor-notifications-badge.is-open { background: #1f1f1d; }" +
            ".editor-notifications-badge__icon { position: relative; width: 14px; height: 14px; border: 2px solid currentColor; border-radius: 8px 8px 3px 3px; box-sizing: border-box; opacity: .95; }" +
            ".editor-notifications-badge__icon::before { content: ''; position: absolute; left: 3px; top: -5px; width: 4px; height: 4px; border: 2px solid currentColor; border-bottom: 0; border-radius: 4px 4px 0 0; }" +
            ".editor-notifications-badge__icon::after { content: ''; position: absolute; left: 3px; bottom: -4px; width: 4px; height: 4px; border-radius: 50%; background: currentColor; }" +
            ".editor-notifications-badge__label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }" +
            ".editor-notifications-badge__count { position: absolute; top: 7px; right: 5px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: #ff7a1a; color: #fff; font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; box-sizing: border-box; }" +
            ".editor-notifications-backdrop { position: fixed; inset: 40px 0 0 0; background: rgba(0, 0, 0, .2); z-index: 1080; }" +
            ".editor-notifications-panel { position: fixed; top: 40px; right: 0; bottom: 0; width: " + PANEL_WIDTH + "px; max-width: min(100vw, " + PANEL_WIDTH + "px); background: #222; color: #fff; border-left: 1px solid #3f3f3f; z-index: 1090; display: flex; flex-direction: column; box-shadow: none; }" +
            ".editor-notifications-panel__header { display: flex; align-items: flex-start; justify-content: space-between; min-height: 61px; padding: 14px 16px; border-bottom: 1px solid #3f3f3f; background: #323232; box-sizing: border-box; }" +
            ".editor-notifications-panel__heading { display: flex; flex-direction: column; gap: 4px; }" +
            ".editor-notifications-panel__heading strong { font-size: 15px; font-weight: 600; }" +
            ".editor-notifications-panel__count { font-size: 12px; color: #adadad; }" +
            ".editor-notifications-panel__close { width: 32px; height: 32px; border: 0; background: transparent; color: #fff; font-size: 26px; line-height: 32px; cursor: pointer; }" +
            ".editor-notifications-panel__close:hover { background: rgba(255,255,255,.08); }" +
            ".editor-notifications-panel__body { display: flex; flex-direction: column; min-height: 0; flex: 1; }" +
            ".editor-notifications-panel__list { border-bottom: 1px solid #3f3f3f; overflow: auto; max-height: 45%; background: #252525; }" +
            ".editor-notifications-panel__detail { flex: 1; overflow: auto; padding: 16px; background: #222; box-sizing: border-box; }" +
            ".editor-notifications-panel__empty { color: #adadad; font-size: 13px; line-height: 1.5; }" +
            ".editor-notification-item { width: 100%; display: block; text-align: left; border: 0; border-bottom: 1px solid #3f3f3f; background: transparent; color: inherit; padding: 14px 16px; cursor: pointer; }" +
            ".editor-notification-item:hover, .editor-notification-item.is-active { background: #323232; }" +
            ".editor-notification-item.is-unread .editor-notification-item__title::before { content: ''; display: inline-block; width: 6px; height: 6px; margin-right: 8px; border-radius: 50%; background: #ff7a1a; vertical-align: middle; }" +
            ".editor-notification-item__title { display: block; font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 4px; }" +
            ".editor-notification-item__date { display: block; color: #adadad; font-size: 12px; }" +
            ".editor-notifications-panel__meta { color: #adadad; font-size: 12px; margin-bottom: 16px; }" +
            ".editor-notifications-panel__content { color: #fff; font-size: 14px; line-height: 1.6; }" +
            ".editor-notifications-panel__content img { max-width: 100%; height: auto; }" +
            ".editor-notifications-panel__content a { color: #00b5ff; }" +
            ".editor-notifications-panel__detailActions { display: flex; gap: 8px; margin-top: 20px; }" +
            ".editor-notifications-panel__detailActions button," +
            ".editor-notifications-panel__detailActions a { min-height: 32px; padding: 0 12px; border: 0; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }" +
            ".editor-notifications-panel__dismiss { background: #3f3f3f; color: #fff; }" +
            ".editor-notifications-panel__dismiss:hover { background: #4b4b4b; }" +
            ".editor-notifications-panel__manage { background: #00b5ff; color: #141414; }" +
            ".editor-notifications-panel__manage:hover { background: #39c6ff; }" +
            ".editor-notifications-toast { position: fixed; right: 24px; bottom: 24px; z-index: 1200; background: #111827; color: #fff; padding: 16px 18px; border-radius: 14px; box-shadow: 0 18px 40px rgba(0,0,0,.35); max-width: 320px; cursor: pointer; }";
        document.head.appendChild(style);

        var rightActions = topBar.matches('[class*="rightSidedActions"]') ? topBar : topBar.querySelector('[class*="rightSidedActions"]');
        var publishWrapper = rightActions ? Array.from(rightActions.children).find(function (child) {
            return child.id === "neos-PublishDropDown" || child.querySelector("#neos-PublishDropDown");
        }) : null;

        if (rightActions && publishWrapper) {
            rightActions.insertBefore(wrapper, publishWrapper);
        } else {
            topBar.appendChild(wrapper);
        }

        // Bind open/close handlers once (not on every renderPanel call)
        function setOpenState(isOpen) {
            panel.hidden = !isOpen;
            backdrop.hidden = !isOpen;
            badge.classList.toggle("is-open", isOpen);
        }

        badge.addEventListener("click", function () {
            setOpenState(panel.hidden);
        });
        closeBtn.addEventListener("click", function () {
            setOpenState(false);
        });
        backdrop.addEventListener("click", function () {
            setOpenState(false);
        });

        return wrapper;
    }

    function renderPanel(wrapper, data) {
        var badge = wrapper.querySelector("#editor-notifications-badge");
        var countEl = badge.querySelector(".editor-notifications-badge__count");
        var list = wrapper.querySelector(".editor-notifications-panel__list");
        var detail = wrapper.querySelector(".editor-notifications-panel__detail");
        var countLabel = wrapper.querySelector(".editor-notifications-panel__count");

        countEl.textContent = String(data.count);
        badge.hidden = data.items.length === 0 && data.count === 0;
        countLabel.textContent = data.count === 0 ? "Geen ongelezen notificaties" : data.count + " ongelezen";

        // Clear list safely
        while (list.firstChild) {
            list.removeChild(list.firstChild);
        }

        data.items.forEach(function (item, index) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "editor-notification-item" + (item.isSeen ? "" : " is-unread");

            var titleSpan = document.createElement("span");
            titleSpan.className = "editor-notification-item__title";
            titleSpan.textContent = item.title;

            var dateSpan = document.createElement("span");
            dateSpan.className = "editor-notification-item__date";
            dateSpan.textContent = item.publishedAt ? new Date(item.publishedAt).toLocaleString("nl-NL") : "Concept";

            button.appendChild(titleSpan);
            button.appendChild(dateSpan);

            button.addEventListener("click", async function () {
                try {
                    await request("markSeen", {
                        method: "POST",
                        body: new URLSearchParams({ notificationIdentifier: item.identifier }),
                    });
                } catch (err) {
                    console.warn("EditorNotifications: failed to mark as seen", err);
                }
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
            while (detail.firstChild) {
                detail.removeChild(detail.firstChild);
            }
            var emptyMsg = document.createElement("div");
            emptyMsg.className = "editor-notifications-panel__empty";
            emptyMsg.textContent = "Er zijn momenteel geen actieve notificaties.";
            detail.appendChild(emptyMsg);
        }
    }

    function renderDetail(detail, item) {
        while (detail.firstChild) {
            detail.removeChild(detail.firstChild);
        }

        var heading = document.createElement("h3");
        heading.textContent = item.title;
        detail.appendChild(heading);

        var meta = document.createElement("div");
        meta.className = "editor-notifications-panel__meta";
        meta.textContent = item.publishedAt ? new Date(item.publishedAt).toLocaleString("nl-NL") : "";
        detail.appendChild(meta);

        // Content uses sanitizeHtml — admin-authored, server-side sanitized, defense-in-depth
        var content = document.createElement("div");
        content.className = "editor-notifications-panel__content";
        var sanitized = sanitizeHtml(item.content);
        content.innerHTML = sanitized; // nosec: sanitized by sanitizeHtml + server-side
        detail.appendChild(content);

        var actions = document.createElement("div");
        actions.className = "editor-notifications-panel__detailActions";

        var dismissBtn = document.createElement("button");
        dismissBtn.type = "button";
        dismissBtn.className = "editor-notifications-panel__dismiss";
        dismissBtn.textContent = "Niet meer tonen";
        dismissBtn.addEventListener("click", async function () {
            try {
                await request("dismiss", {
                    method: "POST",
                    body: new URLSearchParams({ notificationIdentifier: item.identifier }),
                });
            } catch (err) {
                console.warn("EditorNotifications: failed to dismiss", err);
            }
            refresh(document.querySelector(".editor-notifications-plugin"), false);
        });
        actions.appendChild(dismissBtn);

        var manageLink = document.createElement("a");
        manageLink.className = "editor-notifications-panel__manage";
        manageLink.href = "/neos/administration/notifications";
        manageLink.textContent = "Beheer";
        actions.appendChild(manageLink);

        detail.appendChild(actions);
    }

    function showToast(wrapper, count) {
        if (!count || document.querySelector(".editor-notifications-toast")) {
            return;
        }

        var toast = document.createElement("button");
        toast.type = "button";
        toast.className = "editor-notifications-toast";

        var strong = document.createElement("strong");
        strong.textContent = count + " nieuwe notificatie" + (count === 1 ? "" : "s");
        toast.appendChild(strong);

        var sub = document.createElement("div");
        sub.textContent = "Klik om ze te bekijken.";
        toast.appendChild(sub);

        toast.addEventListener("click", function () {
            var panel = wrapper.querySelector("#editor-notifications-panel");
            var backdropEl = wrapper.querySelector("#editor-notifications-backdrop");
            var badgeEl = wrapper.querySelector("#editor-notifications-badge");
            if (panel) panel.hidden = false;
            if (backdropEl) backdropEl.hidden = false;
            if (badgeEl) badgeEl.classList.add("is-open");
            toast.remove();
        });
        document.body.appendChild(toast);
        setTimeout(function () {
            if (toast.parentNode) toast.remove();
        }, 10000);
    }

    async function refresh(wrapper, allowToast) {
        var data = await request("active");
        renderPanel(wrapper, data);
        if (allowToast && data.count > 0) {
            showToast(wrapper, data.count);
        }
    }

    async function boot() {
        if (started || !isContentModule()) {
            return;
        }

        var wrapper = createShell();
        if (!wrapper) {
            return;
        }

        started = true;

        try {
            await refresh(wrapper, true);
            window.setInterval(function () {
                refresh(wrapper, false).catch(function (err) {
                    console.warn("EditorNotifications: poll failed", err);
                });
            }, POLL_INTERVAL);
        } catch (error) {
            console.warn("EditorNotifications: initial load failed", error);
        }
    }

    function start(attempt) {
        attempt = attempt || 0;
        boot().catch(function (err) {
            console.warn("EditorNotifications: boot attempt " + attempt + " failed", err);
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
