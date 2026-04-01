(function () {
    var API_BASE = "/neos/notifications/api/";
    var CONTENT_ROUTE_HINT = "/neos/content";
    var START_TIMEOUT = 15000;
    var POLL_INTERVAL = 60000;
    var PANEL_WIDTH = 320;
    var started = false;
    var expandedItemId = null;
    var showDismissed = false;
    var i18n = {};
    var refreshLock = false;

    function tt(key, fallback, replacements) {
        var text = i18n[key] || fallback;
        if (replacements) {
            for (var idx = 0; idx < replacements.length; idx++) {
                text = text.replace("{" + idx + "}", replacements[idx]);
            }
        }
        return text;
    }

    function getCsrfToken() {
        var el = document.querySelector("[data-csrf-token]");
        return el ? el.getAttribute("data-csrf-token") || "" : "";
    }

    function isContentModule() {
        return window.location.pathname.indexOf(CONTENT_ROUTE_HINT) !== -1 || document.getElementById("neos-application");
    }

    function sanitizeHtml(html) {
        var div = document.createElement("div");
        div.innerHTML = html; // nosec: admin-authored, server-side sanitized via CommonMark
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

    async function apiRequest(path, options) {
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
        var byId = document.querySelector("#neos-top-bar");
        if (byId) return byId;
        var app = document.getElementById("neos-application");
        if (!app) return null;
        return (
            app.querySelector('[class*="primaryToolbar__rightSidedActions"]') ||
            app.querySelector('[class*="primaryToolbar"]')
        );
    }

    // ── Styles ───────────────────────────────────────────────────

    function injectStyles() {
        var style = document.createElement("style");
        style.textContent =
            // Badge
            ".editor-notifications-plugin { position: relative; width: 40px; height: 40px; flex: 0 0 40px; }" +
            ".editor-notifications-badge { position: relative; width: 40px; height: 40px; border: 0; border-left: 1px solid rgba(255,255,255,.08); border-right: 1px solid rgba(0,0,0,.35); background: #262624; color: #fff; cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center; }" +
            ".editor-notifications-badge:hover { background: #323232; }" +
            ".editor-notifications-badge.is-open { background: #1f1f1d; }" +
            ".editor-notifications-badge__icon { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; opacity: .95; }" +
            ".editor-notifications-badge__label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }" +
            ".editor-notifications-badge__count { position: absolute; top: 7px; right: 5px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: #ff7a1a; color: #fff; font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; box-sizing: border-box; }" +
            ".editor-notifications-badge__count.is-zero { display: none; }" +
            // Backdrop
            ".editor-notifications-backdrop { display: none; position: fixed; inset: 40px 0 0 0; background: rgba(0,0,0,.25); z-index: 1080; }" +
            ".editor-notifications-backdrop.is-visible { display: block; }" +
            // Panel
            ".editor-notifications-panel { display: none; position: fixed; top: 40px; right: 0; bottom: 0; width: " + PANEL_WIDTH + "px; max-width: calc(100vw - 40px); background: #222; color: #fff; border-left: 1px solid #3f3f3f; z-index: 1090; flex-direction: column; }" +
            ".editor-notifications-panel.is-visible { display: flex; }" +
            // Header
            ".editor-notifications-panel__header { padding: 0; border-bottom: 1px solid #3f3f3f; background: #1a1a1a; box-sizing: border-box; }" +
            ".editor-notifications-panel__header-top { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 0 16px; height: 40px; }" +
            ".editor-notifications-panel__header-top strong { font-size: 14px; font-weight: 600; }" +
            ".editor-notifications-panel__header-bottom { display: flex; align-items: center; justify-content: space-between; padding: 0 16px 8px; }" +
            ".editor-notifications-panel__countLabel { font-size: 11px; color: #999; }" +
            ".editor-notifications-panel__mark-all { border: 0; background: transparent; color: #999; font-size: 11px; padding: 2px 0; cursor: pointer; white-space: nowrap; }" +
            ".editor-notifications-panel__mark-all:hover { color: #fff; }" +
            ".editor-notifications-panel__close { width: 36px; height: 36px; border: 0; background: transparent; color: #fff; font-size: 20px; line-height: 36px; text-align: center; cursor: pointer; border-radius: 4px; flex: 0 0 36px; }" +
            ".editor-notifications-panel__close:hover { background: rgba(255,255,255,.1); }" +
            // List
            ".editor-notifications-panel__list { flex: 1; overflow: auto; }" +
            ".editor-notifications-panel__empty { color: #999; font-size: 13px; padding: 24px 16px; line-height: 1.5; }" +
            // Item
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
            // Body
            ".editor-notification-item__body { display: none; padding: 0 16px 16px 34px; }" +
            ".editor-notification-item.is-expanded .editor-notification-item__body { display: block; }" +
            ".editor-notification-item__content { font-size: 14px; line-height: 1.6; color: #ddd; }" +
            ".editor-notification-item__content img { max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0; }" +
            ".editor-notification-item__content a { color: #00b5ff; }" +
            ".editor-notification-item__content ul, .editor-notification-item__content ol { margin: .5em 0; padding-left: 1.8em; }" +
            ".editor-notification-item__content ul, .editor-notification-item__content ul li { list-style-type: disc; }" +
            ".editor-notification-item__content ol, .editor-notification-item__content ol li { list-style-type: decimal; }" +
            ".editor-notification-item__content li { display: list-item; margin: .2em 0; }" +
            // Actions — icon + text label
            ".editor-notification-item__actions { margin-top: 12px; display: flex; gap: 4px; flex-wrap: wrap; }" +
            ".editor-notification-item__action-btn { border: 0; background: transparent; color: #777; padding: 4px 6px; font-size: 11px; cursor: pointer; border-radius: 2px; display: inline-flex; align-items: center; gap: 4px; }" +
            ".editor-notification-item__action-btn:hover { color: #fff; background: rgba(255,255,255,.08); }" +
            ".editor-notification-item__action-btn svg { flex: 0 0 12px; pointer-events: none; }" +
            // Dismissed
            ".editor-notification-item.is-dismissed { opacity: .5; }" +
            ".editor-notification-item.is-dismissed .editor-notification-item__title { text-decoration: line-through; }" +
            // Toggle
            ".editor-notifications-panel__toggle-dismissed { display: block; width: 100%; border: 0; background: transparent; color: #777; font-size: 12px; padding: 12px 16px; cursor: pointer; text-align: center; }" +
            ".editor-notifications-panel__toggle-dismissed:hover { color: #aaa; background: rgba(255,255,255,.05); }" +
            // Custom tooltip
            "#editor-notifications-tooltip { position: fixed; z-index: 10000; background: #111; color: #ccc; font-size: 11px; padding: 4px 8px; border-radius: 3px; pointer-events: none; display: none; white-space: nowrap; }";
        document.head.appendChild(style);
    }

    // ── Helpers ───────────────────────────────────────────────────

    function makeSvg(pathD) {
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("width", "12");
        svg.setAttribute("height", "12");
        var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("d", pathD);
        svg.appendChild(p);
        return svg;
    }

    function actionBtn(svgPath, label, onClick) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "editor-notification-item__action-btn";
        btn.setAttribute("data-tooltip", label);
        btn.setAttribute("aria-label", label);
        btn.appendChild(makeSvg(svgPath));
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            onClick();
        });
        return btn;
    }

    // Icon paths (Feather icons)
    var ICON = {
        eyeOff: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22",
        eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
        trash: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
        circle: "M12 12m-10 0a10 10 0 1 0 20 0 10 10 0 1 0-20 0",
    };

    // ── Shell ────────────────────────────────────────────────────

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

        var badgeIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        badgeIcon.setAttribute("viewBox", "0 0 24 24");
        badgeIcon.setAttribute("class", "editor-notifications-badge__icon");
        badgeIcon.setAttribute("aria-hidden", "true");
        var bellPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        bellPath.setAttribute("d", "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0");
        badgeIcon.appendChild(bellPath);
        badge.appendChild(badgeIcon);

        var badgeLabel = document.createElement("span");
        badgeLabel.className = "editor-notifications-badge__label";
        badgeLabel.textContent = tt("plugin.notifications", "Notifications");
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

        var header = document.createElement("div");
        header.className = "editor-notifications-panel__header";

        var headerTop = document.createElement("div");
        headerTop.className = "editor-notifications-panel__header-top";
        var headingStrong = document.createElement("strong");
        headingStrong.textContent = tt("plugin.notifications", "Notifications");
        headerTop.appendChild(headingStrong);
        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "editor-notifications-panel__close";
        closeBtn.setAttribute("aria-label", tt("plugin.close", "Close"));
        closeBtn.textContent = "\u00D7";
        headerTop.appendChild(closeBtn);
        header.appendChild(headerTop);

        var headerBottom = document.createElement("div");
        headerBottom.className = "editor-notifications-panel__header-bottom";
        var countSpan = document.createElement("span");
        countSpan.className = "editor-notifications-panel__countLabel";
        headerBottom.appendChild(countSpan);
        var markAllBtn = document.createElement("button");
        markAllBtn.type = "button";
        markAllBtn.className = "editor-notifications-panel__mark-all";
        markAllBtn.textContent = tt("plugin.markAllRead", "Mark all read");
        markAllBtn.style.display = "none";
        headerBottom.appendChild(markAllBtn);
        header.appendChild(headerBottom);

        panel.appendChild(header);

        var list = document.createElement("div");
        list.className = "editor-notifications-panel__list";
        panel.appendChild(list);
        wrapper.appendChild(panel);

        // Insert into toolbar
        var rightActions = topBar.matches('[class*="rightSidedActions"]') ? topBar : topBar.querySelector('[class*="rightSidedActions"]');
        if (rightActions) {
            rightActions.insertBefore(wrapper, rightActions.firstChild);
        } else {
            topBar.appendChild(wrapper);
        }

        // Custom tooltip — lives on document.body, outside React tree
        var tip = document.createElement("div");
        tip.id = "editor-notifications-tooltip";
        document.body.appendChild(tip);
        var tipTimer = null;

        panel.addEventListener("mouseover", function (e) {
            var target = e.target;
            if (target.nodeType !== 1) target = target.parentElement;
            var src = target ? target.closest("[data-tooltip]") : null;
            if (!src) return;
            clearTimeout(tipTimer);
            tipTimer = setTimeout(function () {
                tip.textContent = src.getAttribute("data-tooltip");
                var r = src.getBoundingClientRect();
                tip.style.display = "block";
                tip.style.left = Math.min(r.left, window.innerWidth - tip.offsetWidth - 8) + "px";
                tip.style.top = (r.bottom + 6) + "px";
            }, 150);
        });

        panel.addEventListener("mouseout", function (e) {
            var target = e.target;
            if (target.nodeType !== 1) target = target.parentElement;
            var src = target ? target.closest("[data-tooltip]") : null;
            if (src && !src.contains(e.relatedTarget)) {
                clearTimeout(tipTimer);
                tip.style.display = "none";
            }
        });

        // Open/close
        function setOpenState(isOpen) {
            tip.style.display = "none";
            clearTimeout(tipTimer);
            panel.classList.toggle("is-visible", isOpen);
            backdrop.classList.toggle("is-visible", isOpen);
            badge.classList.toggle("is-open", isOpen);
        }
        badge.addEventListener("click", function () { setOpenState(!panel.classList.contains("is-visible")); });
        closeBtn.addEventListener("click", function () { setOpenState(false); });
        backdrop.addEventListener("click", function () { setOpenState(false); });
        markAllBtn.addEventListener("click", function () {
            if (refreshLock) return;
            refreshLock = true;
            apiRequest("markAllSeen", { method: "POST" })
                .then(function () { return refresh(wrapper); })
                .catch(function (err) { console.warn("EditorNotifications: markAllSeen failed", err); })
                .finally(function () { refreshLock = false; });
        });

        return wrapper;
    }

    // ── Render ────────────────────────────────────────────────────

    function renderPanel(wrapper, data) {
        var badge = wrapper.querySelector("#editor-notifications-badge");
        var countEl = badge.querySelector(".editor-notifications-badge__count");
        var list = wrapper.querySelector(".editor-notifications-panel__list");
        var countLabel = wrapper.querySelector(".editor-notifications-panel__countLabel");
        var headingStrong = wrapper.querySelector(".editor-notifications-panel__header strong");

        // Hide tooltip during re-render
        var tip = document.getElementById("editor-notifications-tooltip");
        if (tip) tip.style.display = "none";

        // Update header
        var markAllBtn = wrapper.querySelector(".editor-notifications-panel__mark-all");
        var headerBottom = wrapper.querySelector(".editor-notifications-panel__header-bottom");
        if (markAllBtn) {
            markAllBtn.textContent = tt("plugin.markAllRead", "Mark all read");
            markAllBtn.style.display = data.count > 0 ? "" : "none";
        }
        if (headerBottom) {
            headerBottom.style.display = data.count > 0 ? "" : "none";
        }
        headingStrong.textContent = tt("plugin.notifications", "Notifications");
        countEl.textContent = String(data.count);
        countEl.className = "editor-notifications-badge__count" + (data.count === 0 ? " is-zero" : "");
        badge.style.display = (data.items.length === 0 && data.count === 0) ? "none" : "";
        countLabel.textContent = data.count > 0 ? tt("plugin.unreadCount", "{0} unread", [data.count]) : "";

        // Rebuild list
        while (list.firstChild) { list.removeChild(list.firstChild); }

        if (data.items.length === 0) {
            var emptyMsg = document.createElement("div");
            emptyMsg.className = "editor-notifications-panel__empty";
            emptyMsg.textContent = tt("plugin.empty", "There are currently no notifications.");
            list.appendChild(emptyMsg);
            return;
        }

        data.items.forEach(function (item) {
            var isExpanded = expandedItemId === item.identifier;
            var isDismissed = !!item.isDismissed;

            var article = document.createElement("div");
            article.className = "editor-notification-item"
                + (item.isSeen ? "" : " is-unread")
                + (isExpanded ? " is-expanded" : "")
                + (isDismissed ? " is-dismissed" : "");

            // Header
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

            var chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            chevron.setAttribute("viewBox", "0 0 16 16");
            chevron.setAttribute("class", "editor-notification-item__chevron");
            var chevPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            chevPath.setAttribute("d", "M6 3l5 5-5 5");
            chevPath.setAttribute("stroke", "currentColor");
            chevPath.setAttribute("stroke-width", "2");
            chevPath.setAttribute("fill", "none");
            chevron.appendChild(chevPath);
            headerBtn.appendChild(chevron);
            article.appendChild(headerBtn);

            // Body
            var body = document.createElement("div");
            body.className = "editor-notification-item__body";

            var content = document.createElement("div");
            content.className = "editor-notification-item__content";
            content.innerHTML = sanitizeHtml(item.content); // nosec: admin-authored, sanitized
            content.querySelectorAll("a").forEach(function (a) {
                a.setAttribute("target", "_blank");
                a.setAttribute("rel", "noopener");
            });
            body.appendChild(content);

            // Actions — always rendered based on current state
            var actions = document.createElement("div");
            actions.className = "editor-notification-item__actions";

            if (!isDismissed) {
                actions.appendChild(actionBtn(ICON.eyeOff, tt("plugin.dismiss", "Hide"), function () {
                    postAction("dismiss", item.identifier, wrapper);
                }));
                if (item.isSeen) {
                    actions.appendChild(actionBtn(ICON.eye, tt("plugin.markUnread", "Mark as unread"), function () {
                        postAction("markUnseen", item.identifier, wrapper);
                    }));
                }
            } else {
                actions.appendChild(actionBtn(ICON.eye, tt("plugin.unhide", "Unhide"), function () {
                    postAction("markUnseen", item.identifier, wrapper);
                }));
            }

            actions.appendChild(actionBtn(ICON.trash, tt("plugin.delete", "Delete"), function () {
                if (!window.confirm(tt("plugin.confirmDelete", "Permanently delete this notification?"))) return;
                expandedItemId = null;
                postAction("removeForCurrentUser", item.identifier, wrapper);
            }));

            body.appendChild(actions);
            article.appendChild(body);

            // Expand/collapse
            headerBtn.addEventListener("click", function () {
                var wasExpanded = article.classList.contains("is-expanded");

                // Collapse all
                list.querySelectorAll(".editor-notification-item.is-expanded").forEach(function (el) {
                    el.classList.remove("is-expanded");
                });

                if (!wasExpanded) {
                    article.classList.add("is-expanded");
                    expandedItemId = item.identifier;

                    // Mark as seen — then re-render to show correct action buttons
                    if (!item.isSeen) {
                        postAction("markSeen", item.identifier, wrapper);
                    }
                } else {
                    expandedItemId = null;
                }
            });

            list.appendChild(article);
        });

        // Toggle dismissed
        var toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "editor-notifications-panel__toggle-dismissed";
        toggleBtn.textContent = showDismissed
            ? tt("plugin.hideHidden", "Hide hidden notifications")
            : tt("plugin.showHidden", "Show hidden notifications");
        toggleBtn.addEventListener("click", function () {
            showDismissed = !showDismissed;
            refresh(wrapper);
        });
        list.appendChild(toggleBtn);
    }

    // ── API actions ──────────────────────────────────────────────

    function postAction(action, identifier, wrapper) {
        if (refreshLock) return;
        refreshLock = true;
        apiRequest(action, {
            method: "POST",
            body: new URLSearchParams({ notificationIdentifier: identifier }),
        })
        .then(function () { return refresh(wrapper); })
        .catch(function (err) { console.warn("EditorNotifications: " + action + " failed", err); })
        .finally(function () { refreshLock = false; });
    }

    async function refresh(wrapper) {
        try {
            var data = await apiRequest("active" + (showDismissed ? "?includeDismissed=1" : ""));
            if (data.translations) { i18n = data.translations; }
            renderPanel(wrapper, data);
        } catch (err) {
            console.warn("EditorNotifications: refresh failed", err);
        }
    }

    // ── Boot ─────────────────────────────────────────────────────

    async function boot() {
        if (started || !isContentModule()) return;
        var wrapper = createShell();
        if (!wrapper) return;
        started = true;

        await refresh(wrapper);
        window.setInterval(function () { refresh(wrapper); }, POLL_INTERVAL);
    }

    function start() {
        boot().catch(function () {});
        if (started) return;

        var target = document.getElementById("neos-application") || document.body;
        var observer = new MutationObserver(function () {
            if (started) { observer.disconnect(); return; }
            boot().then(function () { if (started) observer.disconnect(); }).catch(function () {});
        });
        observer.observe(target, { childList: true, subtree: true });
        window.setTimeout(function () { observer.disconnect(); }, START_TIMEOUT);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
