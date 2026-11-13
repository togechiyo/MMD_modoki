const violationPrefix = "[mmd-csp-test-violation]";

export const isCspConsoleMessage = text => /Content[- ]Security[- ]Policy|violat(?:es|ion).*\b(?:script-src|worker-src|connect-src|img-src|media-src)\b/i.test(text);

/** Install before reloading an existing page; future exporter pages are observed from startup. */
export async function observeCsp(context) {
  const events = [];
  const observed = new WeakSet();
  const observePage = page => {
    if (observed.has(page)) return;
    observed.add(page);
    page.on("console", message => {
      const text = message.text();
      if (text.startsWith(violationPrefix)) {
        events.push({ kind: "violation", url: page.url(), ...JSON.parse(text.slice(violationPrefix.length)) });
      } else if (["warning", "error"].includes(message.type()) && isCspConsoleMessage(text)) {
        events.push({ kind: "console", url: page.url(), type: message.type(), text });
      }
    });
    page.on("pageerror", error => events.push({ kind: "pageerror", url: page.url(), text: error.message }));
  };
  context.on("page", observePage);
  for (const page of context.pages()) observePage(page);
  await context.addInitScript(prefix => {
    document.addEventListener("securitypolicyviolation", event => {
      console.debug(prefix + JSON.stringify({
        effectiveDirective: event.effectiveDirective,
        violatedDirective: event.violatedDirective,
        blockedURI: event.blockedURI,
        disposition: event.disposition,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
      }));
    });
  }, violationPrefix);
  return { events };
}
