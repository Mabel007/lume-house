import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import React, { act, useEffect } from "react";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { readFileSync } from "node:fs";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/", pretendToBeVisual: true });
const { document } = dom.window;
for (const name of ["window", "document", "HTMLElement", "Element"])
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const host = document.getElementById("root");
let server, root, NotificationProvider, useNotifications, DEFAULT_NOTIFICATION_DURATIONS;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  ({ NotificationProvider } = await server.ssrLoadModule("/src/components/NotificationProvider.tsx"));
  ({ useNotifications, DEFAULT_NOTIFICATION_DURATIONS } = await server.ssrLoadModule(
    "/src/components/notifications.ts",
  ));
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

test("the shared styles keep safe-area placement and reduced-motion behavior", () => {
  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /\.bag-notice-region\s*\{[^}]*top:\s*max\(calc\(20px \+ env\(safe-area-inset-top/);
  assert.match(css, /\.bag-notice-region\.is-bottom\s*\{[^}]*bottom:\s*calc\(20px \+ env\(safe-area-inset-bottom/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.bag-notice-progress\s*\{\s*display:\s*none;/);
  assert.match(css, /\.bag-notice-progress-bar\s*\{[^}]*animation:\s*bag-notice-countdown var\(--bag-notice-duration,\s*5000ms\)/);
});
