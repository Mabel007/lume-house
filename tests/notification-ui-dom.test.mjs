import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import React, { act, useEffect, useLayoutEffect, useRef } from "react";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { readFileSync } from "node:fs";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/", pretendToBeVisual: true });
const { document } = dom.window;
for (const name of ["window", "document", "HTMLElement", "Element"])
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const host = document.getElementById("root");
let server, root, NotificationProvider, useNotifications, DEFAULT_NOTIFICATION_DURATIONS, AuthContext;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  ({ NotificationProvider } = await server.ssrLoadModule("/src/components/NotificationProvider.tsx"));
  ({ useNotifications, DEFAULT_NOTIFICATION_DURATIONS } = await server.ssrLoadModule(
    "/src/components/notifications.ts",
  ));
  ({ AuthContext } = await server.ssrLoadModule("/src/features/auth/AuthContext.ts"));
});
after(async () => {
  await server?.close();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  host.replaceChildren();
  delete dom.window.__notifications;
});

function NotificationProbe() {
  const { notify, dismiss } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const mounted = useRef(false);
  // A layout effect runs after the DOM mutations of its commit, so it observes
  // exactly what the first committed render of a route contains.
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    dom.window.__frames = dom.window.__frames ?? [];
    dom.window.__frames.push({ path: location.pathname, toast: !!document.querySelector(".bag-notice") });
  }, [location.pathname]);
  useEffect(() => {
    dom.window.__notifications = { notify, dismiss, navigate };
  }, [notify, dismiss, navigate]);
  return React.createElement(
    "main",
    { id: "main", tabIndex: -1 },
    React.createElement("button", { id: "success", onClick: () => notify({ tone: "success", message: "Saved" }) }, "success"),
    React.createElement("button", { id: "error", onClick: () => notify({ tone: "error", message: "Failed" }) }, "error"),
    React.createElement("button", { id: "warning", onClick: () => notify({ tone: "warning", message: "Check this" }) }, "warning"),
    React.createElement("button", { id: "info", onClick: () => notify({ tone: "info", message: "Heads up" }) }, "info"),
    React.createElement("button", { id: "empty", onClick: () => notify({ tone: "success", message: "   " }) }, "empty"),
    React.createElement("button", { id: "next", onClick: () => navigate("/next") }, "next"),
    React.createElement("button", { id: "outside" }, "outside"),
  );
}

function ArrivalProbe() {
  const { notify } = useNotifications();
  // A destination route can announce its own arrival. That notification
  // belongs to the route the customer is on, so the route change must not
  // remove it.
  useEffect(() => {
    notify({ tone: "success", message: "Arrived safely" });
  }, [notify]);
  return React.createElement(
    "main",
    { id: "main", tabIndex: -1 },
    React.createElement("button", { id: "stay", onClick: () => {} }, "stay"),
  );
}

async function mount() {
  root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/"] },
        React.createElement(
          NotificationProvider,
          null,
          React.createElement(
            Routes,
            null,
            React.createElement(Route, { path: "*", element: React.createElement(NotificationProbe) }),
          ),
        ),
      ),
    );
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}
async function mountArrival() {
  root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/"] },
        React.createElement(
          NotificationProvider,
          null,
          React.createElement(
            Routes,
            null,
            React.createElement(Route, { path: "/", element: React.createElement(NotificationProbe) }),
            React.createElement(Route, { path: "/arrival", element: React.createElement(ArrivalProbe) }),
            React.createElement(Route, { path: "*", element: React.createElement(NotificationProbe) }),
          ),
        ),
      ),
    );
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}
async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function click(element) {
  await act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}
async function notify(input) {
  await act(async () => {
    dom.window.__notifications.notify(input);
    await Promise.resolve();
  });
}
function button(id) {
  return host.querySelector(`#${id}`);
}
function activeNotice() {
  return host.querySelector(".bag-notice");
}
function carryingRegions() {
  return Array.from(host.querySelectorAll(".bag-notice-region")).filter(region => region.querySelector(".bag-notice"));
}

// --- Session ownership ---------------------------------------------------------
// The notification provider sits below the auth context in the application, so
// a notification can belong to the authenticated session that created it.
const sessionA = { user: { id: "customer-a", email: "a@example.invalid" }, access_token: "jwt-a" };
const sessionB = { user: { id: "customer-b", email: "b@example.invalid" }, access_token: "jwt-b" };
function authValue(session) {
  return {
    loading: false,
    session,
    error: null,
    signIn: async () => {},
    signOut: async () => ({ ok: true }),
    signOutController: { subscribe: () => () => {}, run: async () => ({ ok: true }) },
  };
}
function SessionProbe() {
  const { notify } = useNotifications();
  useEffect(() => { dom.window.__sessionNotify = notify; }, [notify]);
  return React.createElement(
    "main",
    { id: "main", tabIndex: -1 },
    React.createElement("button", { id: "ok", onClick: () => notify({ tone: "success", message: "Saved" }) }, "ok"),
  );
}
function SessionHarness() {
  const [session, setSession] = React.useState(sessionA);
  dom.window.__switchSession = setSession;
  return React.createElement(
    AuthContext.Provider,
    { value: authValue(session) },
    React.createElement(
      NotificationProvider,
      null,
      React.createElement(
        Routes,
        null,
        React.createElement(Route, { path: "*", element: React.createElement(SessionProbe) }),
      ),
    ),
  );
}
async function mountSession() {
  root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(MemoryRouter, { initialEntries: ["/"] }, React.createElement(SessionHarness)),
    );
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}
async function switchSession(session) {
  await act(async () => {
    dom.window.__switchSession(session);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

test("four tones share one notification surface with the approved default durations", async () => {
  await mount();
  assert.deepEqual(DEFAULT_NOTIFICATION_DURATIONS, { success: 5000, info: 5000, warning: 8000, error: 8000 });

  await click(button("success"));
  assert.ok(activeNotice().classList.contains("success"));
  assert.equal(host.querySelector('.bag-notice-region[aria-live="polite"] .bag-notice'), activeNotice());
  assert.equal(host.querySelector('.bag-notice-region[aria-live="assertive"] .bag-notice'), null);

  await click(button("warning"));
  assert.ok(activeNotice().classList.contains("warning"));
  assert.equal(host.querySelector('.bag-notice-region[aria-live="polite"] .bag-notice'), activeNotice());
  assert.equal(carryingRegions().length, 1);

  await click(button("info"));
  assert.ok(activeNotice().classList.contains("info"));
  assert.equal(host.querySelector('.bag-notice-region[aria-live="polite"] .bag-notice'), activeNotice());
  assert.equal(carryingRegions().length, 1);

  await click(button("error"));
  assert.ok(activeNotice().classList.contains("failure"));
  assert.equal(host.querySelector('.bag-notice-region[aria-live="assertive"] .bag-notice'), activeNotice());
  assert.equal(host.querySelector('.bag-notice-region[aria-live="polite"] .bag-notice'), null);
  assert.equal(carryingRegions().length, 1);

  assert.equal(activeNotice().style.getPropertyValue("--bag-notice-duration"), "8000ms");
});

test("newest notification replaces the old card and resets the progress timing", async t => {
  await mount();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await click(button("success"));
    const first = activeNotice();
    assert.ok(first);
    await act(async () => t.mock.timers.tick(4000));
    await click(button("warning"));
    const second = activeNotice();
    assert.notEqual(second, first, "a newer notification is a fresh node");
    assert.equal(host.querySelectorAll(".bag-notice").length, 1, "no queue or stack is created");
    assert.equal(second.style.getPropertyValue("--bag-notice-duration"), "8000ms");

    await act(async () => t.mock.timers.tick(4000));
    assert.ok(activeNotice(), "the replacement keeps its own full eight-second window");
    await act(async () => t.mock.timers.tick(4000));
    assert.equal(activeNotice(), null);
  } finally {
    t.mock.timers.reset();
  }
});

test("an older timeout cannot dismiss a newer notification", async t => {
  await mount();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await click(button("success"));
    await act(async () => t.mock.timers.tick(4999));
    await click(button("error"));
    await act(async () => t.mock.timers.tick(1));
    assert.ok(activeNotice(), "the replaced success timer must not clear the error");
    assert.match(activeNotice().textContent, /Failed/);
    await act(async () => t.mock.timers.tick(7998));
    assert.ok(activeNotice());
    await act(async () => t.mock.timers.tick(1));
    assert.equal(activeNotice(), null);
  } finally {
    t.mock.timers.reset();
  }
});

test("an expiry callback that was already queued cannot dismiss the newer notification", async () => {
  await mount();
  const realSetTimeout = globalThis.setTimeout;
  const captured = [];
  globalThis.setTimeout = function (fn, delay, ...rest) {
    const id = realSetTimeout(fn, delay, ...rest);
    captured.push({ fn, delay, id });
    return id;
  };
  try {
    await click(button("success"));
    const beforeReplacement = captured.length;
    const stale = captured.slice(0, beforeReplacement).filter(entry => entry.delay === 5000).at(-1);
    assert.ok(stale, "the success notification scheduled its own expiry");
    await click(button("error"));
    assert.match(activeNotice().textContent, /Failed/);
    // The browser had already queued this callback when the newer notification
    // replaced the older one.
    await act(async () => { stale.fn(); await Promise.resolve(); });
    assert.ok(activeNotice(), "the stale expiry callback must not clear the newer notification");
    assert.match(activeNotice().textContent, /Failed/);
    assert.equal(host.querySelectorAll(".bag-notice").length, 1);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

test("navigation removes the previous route's notification before the new route renders", async () => {
  await mount();
  await click(button("success"));
  assert.ok(activeNotice());
  await click(button("next"));
  const frames = dom.window.__frames ?? [];
  assert.ok(frames.length >= 1, "the navigation committed a new route");
  assert.equal(frames[0].path, "/next");
  assert.equal(frames[0].toast, false, "the previous route's notification is not in the first committed render of the new route");
  assert.equal(activeNotice(), null);
});

test("the exact same message is still announced as a fresh notification", async () => {
  await mount();
  await click(button("success"));
  const first = activeNotice();
  await click(button("success"));
  const second = activeNotice();
  assert.notEqual(second, first);
  assert.equal(second.textContent, "Saved");
  assert.equal(carryingRegions().length, 1);
});

test("blank messages are ignored and custom positive durations are honored", async t => {
  await mount();
  await click(button("empty"));
  assert.equal(activeNotice(), null);

  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await notify({ tone: "info", message: "Custom timeout", durationMs: 1000 });
    assert.ok(activeNotice());
    await act(async () => t.mock.timers.tick(999));
    assert.ok(activeNotice());
    await act(async () => t.mock.timers.tick(1));
    assert.equal(activeNotice(), null);
  } finally {
    t.mock.timers.reset();
  }
});

test("navigation clears the notification and preserves page focus", async () => {
  await mount();
  await click(button("success"));
  const dismiss = host.querySelector(".bag-notice-dismiss");
  await act(async () => dismiss.focus());
  assert.equal(document.activeElement, dismiss);
  await click(button("next"));
  assert.equal(activeNotice(), null);
  assert.equal(document.activeElement, host.querySelector("#main"));
});

test("manual dismissal restores focus and keyboard users can reach the close control", async () => {
  await mount();
  await click(button("success"));
  const dismiss = host.querySelector(".bag-notice-dismiss");
  assert.equal(dismiss.tagName, "BUTTON");
  assert.equal(dismiss.type, "button");
  await act(async () => dismiss.focus());
  assert.equal(document.activeElement, dismiss, "the native button is keyboard focusable");
  await click(dismiss);
  assert.equal(activeNotice(), null);
  assert.equal(document.activeElement, host.querySelector("#main"));
});

test("expiry restores focus when the focused dismiss control disappears", async t => {
  await mount();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await click(button("success"));
    const dismiss = host.querySelector(".bag-notice-dismiss");
    await act(async () => dismiss.focus());
    assert.equal(document.activeElement, dismiss);
    await act(async () => t.mock.timers.tick(5000));
    assert.equal(activeNotice(), null);
    assert.equal(document.activeElement, host.querySelector("#main"));
  } finally {
    t.mock.timers.reset();
  }
});

test("replacement transfers focus away from a disappearing dismiss control", async () => {
  await mount();
  await click(button("success"));
  const dismiss = host.querySelector(".bag-notice-dismiss");
  await act(async () => dismiss.focus());
  assert.equal(document.activeElement, dismiss);
  await notify({ tone: "error", message: "Replacement" });
  assert.match(activeNotice().textContent, /Replacement/);
  assert.equal(document.activeElement, host.querySelector("#main"));
});

test("a notification does not steal focus from an unrelated control", async () => {
  await mount();
  const outside = button("outside");
  outside.focus();
  await notify({ tone: "warning", message: "Background update" });
  assert.equal(document.activeElement, outside);
});

test("only plain text is rendered and only one live region carries the active message", async () => {
  await mount();
  await notify({ tone: "info", message: "<b>Not markup</b>" });
  assert.equal(activeNotice().textContent, "<b>Not markup</b>");
  assert.equal(activeNotice().querySelector("b"), null);
  assert.equal(carryingRegions().length, 1);
});

test("a notification the destination route creates for itself survives the route change", async () => {
  await mountArrival();
  await click(button("success"));
  assert.ok(activeNotice(), "the origin route shows its own notification");
  await act(async () => {
    dom.window.__notifications.navigate("/arrival");
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  await settle();
  const notice = activeNotice();
  assert.ok(notice, "the route cleanup never removes a notification that belongs to the route the customer is on");
  assert.match(notice.textContent, /Arrived safely/);
});

test("a notification from a route the customer left never reappears when they come back", async () => {
  await mount();
  // A notifier captured on the route the customer is leaving.
  const originNotify = dom.window.__notifications.notify;
  await click(button("next"));
  await settle();
  assert.equal(activeNotice(), null, "the departed route's notification is gone");
  // A delayed action that started on the departed route finishes now.
  await act(async () => {
    originNotify({ tone: "error", message: "Late origin action" });
    await Promise.resolve();
  });
  await settle();
  await act(async () => {
    dom.window.__notifications.navigate(-1);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  await settle();
  const frames = dom.window.__frames ?? [];
  const back = frames[frames.length - 1];
  assert.equal(back.path, "/", "the customer returned to the route the action came from");
  assert.equal(back.toast, false, "the first committed render of that route carries no obsolete notification");
  assert.equal(activeNotice(), null, "the obsolete notification never comes back");
});

test("a notification created after the customer returns to a route still works", async () => {
  await mount();
  await click(button("next"));
  await settle();
  await act(async () => {
    dom.window.__notifications.navigate(-1);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  await settle();
  await act(async () => {
    dom.window.__notifications.notify({ tone: "success", message: "Back again" });
    await Promise.resolve();
  });
  const notice = activeNotice();
  assert.ok(notice, "a notification for the route the customer returned to still works");
  assert.match(notice.textContent, /Back again/);
});

test("a notification of one customer is never visible in another customer session", async () => {
  await mountSession();
  await click(button("ok"));
  assert.ok(activeNotice(), "the customer sees their own notification");
  await switchSession(sessionB);
  assert.equal(host.querySelectorAll(".bag-notice").length, 0, "the other customer never sees it");
  await switchSession(sessionA);
  assert.equal(host.querySelectorAll(".bag-notice").length, 0, "returning to the customer does not bring the old notification back");
});

test("a notification created after the session change belongs to the new customer", async () => {
  await mountSession();
  await switchSession(sessionB);
  await click(button("ok"));
  assert.ok(activeNotice(), "the new customer sees the notification they created");
  assert.equal(carryingRegions().length, 1, "one live region carries it");
});

test("an anonymous notification is removed when the customer signs in", async () => {
  await mountSession();
  await switchSession(null);
  await click(button("ok"));
  assert.ok(activeNotice(), "an anonymous notification is shown");
  await switchSession(sessionA);
  assert.equal(host.querySelectorAll(".bag-notice").length, 0, "the signed-in customer does not see the anonymous notification");
});

test("a customer notification is removed when the customer signs out", async () => {
  await mountSession();
  await click(button("ok"));
  assert.ok(activeNotice());
  await switchSession(null);
  assert.equal(host.querySelectorAll(".bag-notice").length, 0, "a signed-out visitor does not see the customer notification");
});

test("an expiry callback from a previous session cannot remove the new customer notification", async () => {
  const realSetTimeout = globalThis.setTimeout;
  const captured = [];
  globalThis.setTimeout = function (fn, delay, ...rest) {
    const id = realSetTimeout(fn, delay, ...rest);
    captured.push({ fn, delay, id });
    return id;
  };
  try {
    await mountSession();
    await click(button("ok"));
    const stale = captured.filter(entry => entry.delay === 5000).at(-1);
    assert.ok(stale, "the notification scheduled its own expiry");
    await switchSession(sessionB);
    await click(button("ok"));
    assert.ok(activeNotice(), "the new customer has their own notification");
    await act(async () => { stale.fn(); await Promise.resolve(); });
    assert.ok(activeNotice(), "the previous session expiry cannot clear the new customer notification");
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

test("the shared styles keep safe-area placement and reduced-motion behavior", () => {
  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /\.bag-notice-region\s*\{[^}]*top:\s*max\(calc\(20px \+ env\(safe-area-inset-top/);
  assert.match(css, /\.bag-notice-region\.is-bottom\s*\{[^}]*bottom:\s*calc\(20px \+ env\(safe-area-inset-bottom/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.bag-notice-progress\s*\{\s*display:\s*none;/);
  assert.match(css, /\.bag-notice-progress-bar\s*\{[^}]*animation:\s*bag-notice-countdown var\(--bag-notice-duration,\s*5000ms\)/);
});
