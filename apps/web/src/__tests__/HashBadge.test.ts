import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { HashBadge } from "../components/ui/HashBadge";

describe("HashBadge Component", () => {
  const sampleHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  it("truncates standard hash with default prefix (8) and suffix (6)", () => {
    const html = renderToStaticMarkup(
      React.createElement(HashBadge, { hash: sampleHash })
    );
    expect(html).toContain("e3b0c442...52b855");
    expect(html).toContain(`title="Full identifier: ${sampleHash}"`);
    expect(html).toContain("tabular-nums");
    expect(html).toContain("font-mono");
  });

  it("truncates with custom prefix and suffix lengths", () => {
    const html = renderToStaticMarkup(
      React.createElement(HashBadge, {
        hash: sampleHash,
        prefixLength: 4,
        suffixLength: 4,
      })
    );
    expect(html).toContain("e3b0...b855");
  });

  it("renders full hash without ellipsis when string is shorter than prefix + suffix", () => {
    const shortHash = "abcd1234";
    const html = renderToStaticMarkup(
      React.createElement(HashBadge, { hash: shortHash })
    );
    expect(html).toContain("abcd1234");
    expect(html).not.toContain("...");
  });

  it("renders label prefix when provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(HashBadge, { hash: sampleHash, label: "Policy Hash" })
    );
    expect(html).toContain("Policy Hash:");
  });

  it("renders copy button with accessible aria-label by default", () => {
    const html = renderToStaticMarkup(
      React.createElement(HashBadge, { hash: sampleHash })
    );
    expect(html).toContain("aria-label=\"Copy identifier\"");
    expect(html).toContain("<button");
  });

  it("omits copy button when showCopy is false", () => {
    const html = renderToStaticMarkup(
      React.createElement(HashBadge, { hash: sampleHash, showCopy: false })
    );
    expect(html).not.toContain("<button");
  });

  it("returns null when hash is empty", () => {
    const html = renderToStaticMarkup(
      React.createElement(HashBadge, { hash: "" })
    );
    expect(html).toBe("");
  });
});
