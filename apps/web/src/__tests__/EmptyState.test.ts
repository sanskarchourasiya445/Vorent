import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { EmptyState } from "../components/ui/EmptyState";

describe("EmptyState Component", () => {
  it("renders title and description properly", () => {
    const html = renderToStaticMarkup(
      React.createElement(EmptyState, {
        title: "No Findings Discovered",
        description: "Zero defects found within declared bounds.",
      })
    );
    expect(html).toContain("No Findings Discovered");
    expect(html).toContain("Zero defects found within declared bounds.");
    expect(html).toContain("border-dashed");
    expect(html).toContain("rounded-panel");
  });

  it("renders custom icon when provided", () => {
    const customIcon = React.createElement("span", { "data-testid": "empty-icon" }, "ICON");
    const html = renderToStaticMarkup(
      React.createElement(EmptyState, {
        icon: customIcon,
        title: "Empty Queue",
      })
    );
    expect(html).toContain("data-testid=\"empty-icon\"");
    expect(html).toContain("ICON");
  });

  it("renders action button when action is supplied", () => {
    const html = renderToStaticMarkup(
      React.createElement(EmptyState, {
        title: "No Checkpoints",
        action: {
          label: "Create Approval",
          onClick: () => {},
        },
      })
    );
    expect(html).toContain("<button");
    expect(html).toContain("Create Approval");
    expect(html).toContain("bg-accent");
  });

  it("omits action button when action is not supplied", () => {
    const html = renderToStaticMarkup(
      React.createElement(EmptyState, {
        title: "Clean Slate",
      })
    );
    expect(html).not.toContain("<button");
  });
});
