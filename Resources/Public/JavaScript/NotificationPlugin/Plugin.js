(function () {
    var API_BASE = "/neos/notifications/api/";
    var CONTENT_ROUTE_HINT = "/neos/content";
    var START_RETRY_DELAY = 500;
    var START_RETRY_LIMIT = 20;
    var POLL_INTERVAL = 60000;
    var PANEL_WIDTH = 380;
    var started = false;
    var expandedItemId = null;

    function getCsrfToken() {
        var el = document.querySelector("[data-csrf-token]");
        return el ? el.getAttribute("data-csrf-token") || "" : "";
    }

    function isContentModule() {
        return window.location.pathname.indexOf(CONTENT_ROUTE_HINT) !== -1 || document.getElementById("neos-application");
    }

    function sanitizeHtml(html) {
        var div = document.createElement("div");
        div.innerHTML = html; // nosec: admin-authored, server-side sanitized
        var dangerous = div.querySelectorAll("script, style, iframe, object, embed");
        for (var i = 0; i < dangerous.length; i++) { dangerous[i].remove(); }
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
            throw new Error("EditorNotifications: " + path + " failed (" + response.status + ")");
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

    function injectStyles() {
        var style = document.createElement("style");
        style.textContent =
            // Badge — sits in the Neos top bar
            ".editor-notifications-plugin { position: relative; width: 40px; height: 40px; flex: 0 0 40px; }" +
            ".editor-notifications-badge { position: relative; width: 40px; height: 40px; border: 0; border-left: 1px solid rgba(255,255,255,.08); border-right: 1px solid rgba(0,0,0,.35); background: #262624; color: #fff; cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center; }" +
            ".editor-notifications-badge:hover { background: #323232; }" +
            ".editor-notifications-badge.is-open { background: #1f1f1d; }" +
            // Bell icon via CSS shapes
            ".editor-notifications-badge__icon { position: relative; width: 14px; height: 14px; border: 2px solid currentColor; border-radius: 8px 8px 3px 3px; box-sizing: border-box; opacity: .95; }" +
            ".editor-notifications-badge__icon::before { content: ''; position: absolute; left: 3px; top: -5px; width: 4px; height: 4px; border: 2px solid currentColor; border-bottom: 0; border-radius: 4px 4px 0 0; }" +
            ".editor-notifications-badge__icon::after { content: ''; position: absolute; left: 3px; bottom: -4px; width: 4px; height: 4px; border-radius: 50%; background: currentColor; }" +
            ".editor-notifications-badge__label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }" +
            ".editor-notifications-badge__count { position: absolute; top: 7px; right: 5px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: #ff7a1a; color: #fff; font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; box-sizing: border-box; }" +
            ".editor-notifications-badge__count.is-zero { display: none; }" +
            // Backdrop — hidden by default, shown via .is-visible
            ".editor-notifications-backdrop { display: none; position: fixed; inset: 40px 0 0 0; background: rgba(0,0,0,.25); z-index: 1080; }" +
            ".editor-notifications-backdrop.is-visible { display: block; }" +
            // Panel — hidden by default, shown via .is-visible
            ".editor-notifications-panel { display: none; position: fixed; top: 40px; right: 0; bottom: 0; width: " + PANEL_WIDTH + "px; max-width: calc(100vw - 40px); background: #222; color: #fff; border-left: 1px solid #3f3f3f; z-index: 1090; flex-direction: column; }" +
            ".editor-notifications-panel.is-visible { display: flex; }" +
            // Header
            ".editor-notifications-panel__header { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 0 16px; height: 40px; min-height: 40px; border-bottom: 1px solid #3f3f3f; background: #1a1a1a; box-sizing: border-box; }" +
            ".editor-notifications-panel__header strong { font-size: 14px; font-weight: 600; }" +
            ".editor-notifications-panel__header span { font-size: 12px; color: #999; margin-left: 8px; }" +
            ".editor-notifications-panel__close { width: 36px; height: 36px; border: 0; background: transparent; color: #fff; font-size: 20px; line-height: 36px; text-align: center; cursor: pointer; border-radius: 4px; flex: 0 0 36px; }" +
            ".editor-notifications-panel__close:hover { background: rgba(255,255,255,.1); }" +
            // Scrollable notification list
            ".editor-notifications-panel__list { flex: 1; overflow: auto; }" +
            ".editor-notifications-panel__empty { color: #999; font-size: 13px; padding: 24px 16px; line-height: 1.5; }" +
            // Notification item (accordion)
            ".editor-notification-item { border-bottom: 1px solid #3f3f3f; }" +
            ".editor-notification-item__header { width: 100%; display: flex; align-items: flex-start; gap: 10px; text-align: left; border: 0; background: transparent; color: #fff; padding: 14px 16px; cursor: pointer; }" +
            ".editor-notification-item__header:hover { background: #2a2a2a; }" +
            ".editor-notification-item.is-expanded > .editor-notification-item__header { background: #2a2a2a; }" +
            ".editor-notification-item__dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: 0 0 8px; }" +
            ".editor-notification-item.is-unread .editor-notification-item__dot { background: #ff7a1a; }" +
            ".editor-notification-item:not(.is-unread) .editor-notification-item__dot { background: #555; }" +
            ".editor-notification-item__info { flex: 1; min-width: 0; }" +
            ".editor-notification-item__title { display: block; font-size: 14px; font-weight: 600; margin-bottom: 2px; }" +
            ".editor-notification-item__date { display: block; color: #999; font-size: 12px; }" +
            ".editor-notification-item__chevron { width: 16px; height: 16px; margin-top: 2px; flex: 0 0 16px; color: #999; transition: transform .15s; }" +
            ".editor-notification-item.is-expanded .editor-notification-item__chevron { transform: rotate(90deg); }" +
            // Expanded content
            ".editor-notification-item__body { display: none; padding: 0 16px 16px 34px; }" +
            ".editor-notification-item.is-expanded .editor-notification-item__body { display: block; }" +
            ".editor-notification-item__content { font-size: 14px; line-height: 1.6; color: #ddd; }" +
            ".editor-notification-item__content img { max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0; }" +
            ".editor-notification-item__content a { color: #00b5ff; }" +
            ".editor-notification-item__actions { margin-top: 12px; }" +
            ".editor-notification-item__dismiss { border: 0; background: #3f3f3f; color: #fff; padding: 6px 14px; font-size: 13px; cursor: pointer; border-radius: 3px; }" +
            ".editor-notification-item__dismiss:hover { background: #555; }" +
            // Toast
            ".editor-notifications-toast { position: fixed; right: 24px; bottom: 24px; z-index: 1200; background: #111827; color: #fff; padding: 16px 18px; border-radius: 14px; box-shadow: 0 18px 40px rgba(0,0,0,.35); max-width: 320px; cursor: pointer; }";
        document.head.appendChild(style);
    }

    function createShell() {
        var topBar = findTopBarHost();
        if (!topBar || document.getElementById("editor-notifications-badge")) {
            return null;
        }

        injectStyles();

        var wrapper = document.createElement("div");
        wrapper.className = "editor-notifications-plugin";

        // Badge
        var badge = document.createElement("button");
        badge.id = "editor-notifications-badge";
        badge.className = "editor-notifications-badge";
        badge.type = "button";
        badge.style.display = "none";

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

        // Backdrop
        var backdrop = document.createElement("div");
        backdrop.id = "editor-notifications-backdrop";
        backdrop.className = "editor-notifications-backdrop";
        wrapper.appendChild(backdrop);

        // Panel
        var panel = document.createElement("div");
        panel.id = "editor-notifications-panel";
        panel.className = "editor-notifications-panel";

        // Header
        var header = document.createElement("div");
        header.className = "editor-notifications-panel__header";

        var headerLeft = document.createElement("div");
        var headingStrong = document.createElement("strong");
        headingStrong.textContent = "Notificaties";
        headerLeft.appendChild(headingStrong);
        var countSpan = document.createElement("span");
        countSpan.className = "editor-notifications-panel__countLabel";
        headerLeft.appendChild(countSpan);
        header.appendChild(headerLeft);

        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "editor-notifications-panel__close";
        closeBtn.setAttribute("aria-label", "Sluiten");
        closeBtn.textContent = "\u00D7";
        header.appendChild(closeBtn);

        panel.appendChild(header);

        // List (accordion container)
        var list = document.createElement("div");
        list.className = "editor-notifications-panel__list";
        panel.appendChild(list);

        wrapper.appendChild(panel);

        // Place badge in toolbar — before the user menu area
        var rightActions = topBar.matches('[class*="rightSidedActions"]') ? topBar : topBar.querySelector('[class*="rightSidedActions"]');
        if (rightActions) {
            // Insert as first child of right actions (leftmost position)
            rightActions.insertBefore(wrapper, rightActions.firstChild);
        } else {
            topBar.appendChild(wrapper);
        }

        // Bind open/close once — use CSS classes, not hidden attribute
        function setOpenState(isOpen) {
            panel.classList.toggle("is-visible", isOpen);
            backdrop.classList.toggle("is-visible", isOpen);
            badge.classList.toggle("is-open", isOpen);
        }

        badge.addEventListener("click", function () {
            setOpenState(!panel.classList.contains("is-visible"));
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
        var countLabel = wrapper.querySelector(".editor-notifications-panel__countLabel");

        countEl.textContent = String(data.count);
        countEl.className = "editor-notifications-badge__count" + (data.count === 0 ? " is-zero" : "");
        badge.style.display = (data.items.length === 0 && data.count === 0) ? "none" : "";
        countLabel.textContent = data.count > 0 ? " \u2014 " + data.count + " ongelezen" : "";

        // Clear list
        while (list.firstChild) {
            list.removeChild(list.firstChild);
        }

        if (data.items.length === 0) {
            var emptyMsg = document.createElement("div");
            emptyMsg.className = "editor-notifications-panel__empty";
            emptyMsg.textContent = "Er zijn momenteel geen notificaties.";
            list.appendChild(emptyMsg);
            return;
        }

        data.items.forEach(function (item) {
            var isExpanded = expandedItemId === item.identifier;
            var article = document.createElement("div");
            article.className = "editor-notification-item" + (item.isSeen ? "" : " is-unread") + (isExpanded ? " is-expanded" : "");

            // Header row (clickable)
            var headerBtn = document.createElement("button");
            headerBtn.type = "button";
            headerBtn.className = "editor-notification-item__header";

            var dot = document.createElement("span");
            dot.className = "editor-notification-item__dot";
            headerBtn.appendChild(dot);

            var info = document.createElement("div");
            info.className = "editor-notification-item__info";

            var titleSpan = document.createElement("span");
            titleSpan.className = "editor-notification-item__title";
            titleSpan.textContent = item.title;
            info.appendChild(titleSpan);

            var dateSpan = document.createElement("span");
            dateSpan.className = "editor-notification-item__date";
            dateSpan.textContent = item.publishedAt ? new Date(item.publishedAt).toLocaleString("nl-NL") : "";
            info.appendChild(dateSpan);

            headerBtn.appendChild(info);

            // Chevron SVG
            var chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            chevron.setAttribute("viewBox", "0 0 16 16");
            chevron.setAttribute("fill", "currentColor");
            chevron.setAttribute("class", "editor-notification-item__chevron");
            var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", "M6 3l5 5-5 5");
            path.setAttribute("stroke", "currentColor");
            path.setAttribute("stroke-width", "2");
            path.setAttribute("fill", "none");
            chevron.appendChild(path);
            headerBtn.appendChild(chevron);

            article.appendChild(headerBtn);

            // Body (expandable)
            var body = document.createElement("div");
            body.className = "editor-notification-item__body";

            var content = document.createElement("div");
            content.className = "editor-notification-item__content";
            content.innerHTML = sanitizeHtml(item.content); // nosec: sanitized
            body.appendChild(content);

            var actions = document.createElement("div");
            actions.className = "editor-notification-item__actions";

            var dismissBtn = document.createElement("button");
            dismissBtn.type = "button";
            dismissBtn.className = "editor-notification-item__dismiss";
            dismissBtn.textContent = "Verbergen";
            dismissBtn.addEventListener("click", async function (e) {
                e.stopPropagation();
                try {
                    await request("dismiss", {
                        method: "POST",
                        body: new URLSearchParams({ notificationIdentifier: item.identifier }),
                    });
                } catch (err) {
                    console.warn("EditorNotifications: dismiss failed", err);
                }
                refresh(wrapper, false);
            });
            actions.appendChild(dismissBtn);

            body.appendChild(actions);
            article.appendChild(body);

            // Toggle expand on header click
            headerBtn.addEventListener("click", async function () {
                var wasExpanded = article.classList.contains("is-expanded");

                // Collapse all others
                list.querySelectorAll(".editor-notification-item.is-expanded").forEach(function (el) {
                    el.classList.remove("is-expanded");
                });

                if (!wasExpanded) {
                    article.classList.add("is-expanded");
                    expandedItemId = item.identifier;

                    // Mark as seen when expanding
                    if (!item.isSeen) {
                        try {
                            await request("markSeen", {
                                method: "POST",
                                body: new URLSearchParams({ notificationIdentifier: item.identifier }),
                            });
                            item.isSeen = true;
                            article.classList.remove("is-unread");
                            refresh(wrapper, false);
                        } catch (err) {
                            console.warn("EditorNotifications: markSeen failed", err);
                        }
                    }
                } else {
                    expandedItemId = null;
                }
            });

            list.appendChild(article);
        });
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
        sub.textContent = "Klik om te bekijken";
        toast.appendChild(sub);

        toast.addEventListener("click", function () {
            var panelEl = wrapper.querySelector("#editor-notifications-panel");
            var backdropEl = wrapper.querySelector("#editor-notifications-backdrop");
            var badgeEl = wrapper.querySelector("#editor-notifications-badge");
            if (panelEl) panelEl.classList.add("is-visible");
            if (backdropEl) backdropEl.classList.add("is-visible");
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
