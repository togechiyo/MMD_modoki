import { expect } from "@playwright/test";

/** Works with both Vite and packaged pages; requires no application test hooks. */
export async function verifyCspRestrictions(page) {
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  const scriptDirective = policy.split(";").map(part => part.trim()).find(part => part.startsWith("script-src "));
  expect(scriptDirective).toBeTruthy();
  const sources = scriptDirective.split(/\s+/).slice(1);
  expect(sources).toContain("'self'");
  expect(sources).toContain("'wasm-unsafe-eval'");
  for (const forbidden of ["'unsafe-eval'", "'unsafe-inline'", "blob:", "data:", "*"]) {
    expect(sources).not.toContain(forbidden);
  }

  const externalUrl = "https://csp-probe.invalid/blocked-script.js";
  await page.evaluate(externalUrl => {
    const state = {
      evalExecuted: false, functionExecuted: false, inlineExecuted: false,
      evalError: null, functionError: null, violations: [],
    };
    const listener = event => state.violations.push({
      effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI,
      disposition: event.disposition,
    });
    document.addEventListener("securitypolicyviolation", listener);
    const button = document.createElement("button");
    button.id = "mmd-csp-test-probe";
    button.textContent = "CSP test";
    Object.assign(button.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647" });
    const nodes = [button];
    // Install a function listener via automation, but invoke it with a real click.
    // DevTools evaluation itself can bypass CSP; the later DOM event must not.
    button.addEventListener("click", () => {
      try { window.eval("globalThis.__mmdCspProbe.state.evalExecuted = true"); }
      catch (error) { state.evalError = error.name; }
      try { new Function("globalThis.__mmdCspProbe.state.functionExecuted = true")(); }
      catch (error) { state.functionError = error.name; }
      const inline = document.createElement("script");
      inline.textContent = "globalThis.__mmdCspProbe.state.inlineExecuted = true";
      nodes.push(inline); document.head.append(inline);
      const external = document.createElement("script");
      external.src = externalUrl;
      nodes.push(external); document.head.append(external);
    }, { once: true });
    window.__mmdCspProbe = {
      state,
      dispose: () => {
        document.removeEventListener("securitypolicyviolation", listener);
        for (const node of nodes) node.remove();
      },
    };
    document.body.append(button);
  }, externalUrl);
  try {
    await page.locator("#mmd-csp-test-probe").click();
    await expect.poll(() => page.evaluate(externalUrl => {
      const violations = window.__mmdCspProbe.state.violations;
      return {
        eval: violations.filter(item => item.blockedURI === "eval" && item.disposition === "enforce").length >= 2,
        inline: violations.some(item => item.blockedURI === "inline" && item.disposition === "enforce"),
        external: violations.some(item => item.blockedURI.startsWith(new URL(externalUrl).origin) && item.disposition === "enforce"),
      };
    }, externalUrl)).toEqual({ eval: true, inline: true, external: true });
    const state = await page.evaluate(() => window.__mmdCspProbe.state);
    expect(state).toMatchObject({
      evalExecuted: false, functionExecuted: false, inlineExecuted: false,
      evalError: "EvalError", functionError: "EvalError",
    });
    expect(state.violations.every(item => ["script-src", "script-src-elem"].includes(item.effectiveDirective))).toBe(true);
    return { policy, ...state };
  } finally {
    await page.evaluate(() => { window.__mmdCspProbe.dispose(); delete window.__mmdCspProbe; });
  }
}
