import { test } from "node:test";
import assert from "node:assert/strict";
import { readSupabaseConfig } from "./config.ts";

// Explicitly synthetic values, never used to contact a real service.
const fixture = {
  VITE_SUPABASE_URL: "https://catalog.example.invalid",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_unit-test-only",
};
test("loopback HTTP requires explicit development and retains origin/key guards", () => {
  for (const host of ["localhost", "127.0.0.1"]) {
    const local = { ...fixture, VITE_SUPABASE_URL: `http://${host}:54321` };
    assert.throws(() => readSupabaseConfig(local));
    assert.equal(readSupabaseConfig(local, true).url, local.VITE_SUPABASE_URL);
    assert.throws(() => readSupabaseConfig({ ...local, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test" }, true));
  }
  for (const url of ["http://example.invalid", "http://localhost.example.invalid", "http://127.0.0.1:54321/path", "http://user:pass@localhost:54321"]) {
    assert.throws(() => readSupabaseConfig({ ...fixture, VITE_SUPABASE_URL: url }, true));
  }
});
test("accepts only HTTPS project origins and publishable-format keys", () => {
  assert.equal(readSupabaseConfig(fixture).url, fixture.VITE_SUPABASE_URL);
  for (const VITE_SUPABASE_URL of [
    "",
    "not a URL",
    "http://example.invalid",
    "https://user:password@example.invalid",
    "https://example.invalid/path",
    "https://example.invalid?key=value",
  ]) {
    assert.throws(() => readSupabaseConfig({ ...fixture, VITE_SUPABASE_URL }));
  }
});
test("missing, secret-format and legacy keys are rejected without echoing values", () => {
  assert.throws(() => readSupabaseConfig({}));
  for (const VITE_SUPABASE_PUBLISHABLE_KEY of [
    "",
    "sb_publishable_",
    "sb_secret_unit-test-only",
    "eyJ-unit-test-only",
  ]) {
    assert.throws(
      () => readSupabaseConfig({ ...fixture, VITE_SUPABASE_PUBLISHABLE_KEY }),
      { message: "Supabase browser configuration is missing or invalid." },
    );
  }
});
