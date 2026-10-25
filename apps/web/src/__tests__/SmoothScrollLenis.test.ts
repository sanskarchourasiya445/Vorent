import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Lenis } from "../lib/lenis";
import { SmoothScrollProvider, useLenis } from "../providers/SmoothScrollProvider";

describe("Lenis Smooth Scroll Engine & Provider", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      scrollY: 0,
      pageYOffset: 0,
      innerHeight: 800,
      scrollTo: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matchMedia: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    vi.stubGlobal("document", {
      documentElement: {
        scrollTop: 0,
        scrollHeight: 2400,
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      },
      body: {
        scrollHeight: 2400,
        style: {},
      },
      querySelector: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("1. Lenis Initialization & Restrained Defaults", () => {
    it("initializes with fintech-calibrated default duration (1.1s) and wheel multiplier (1)", () => {
      const lenis = new Lenis();
      expect(lenis.options.duration).toBe(1.1);
      expect(lenis.options.wheelMultiplier).toBe(1);
      expect(lenis.options.smoothWheel).toBe(true);
      expect(lenis.options.syncTouch).toBe(false);
      expect(lenis.isStopped).toBe(false);
      lenis.destroy();
    });

    it("computes scroll limit from content and wrapper dimensions", () => {
      const lenis = new Lenis();
      lenis.resize();
      expect(lenis.limit).toBe(1600); // 2400 - 800
      lenis.destroy();
    });

    it("correctly calculates scroll limit when wrapper is an HTMLElement scroll container", () => {
      const customWrapper = {
        clientHeight: 750,
        scrollHeight: 2250,
        scrollTop: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        classList: { add: vi.fn(), remove: vi.fn() },
      };

      const lenis = new Lenis({
        wrapper: customWrapper as unknown as HTMLElement,
      });

      lenis.resize();
      expect(lenis.limit).toBe(1500); // 2250 - 750
      lenis.destroy();
    });
  });

  describe("2. Boundary Isolation (data-lenis-prevent & Form Controls)", () => {
    it("identifies data-lenis-prevent elements and excludes them from scroll interception", () => {
      const lenis = new Lenis();

      const modalElement = {
        tagName: "DIV",
        hasAttribute: (attr: string) => attr === "data-lenis-prevent",
        getAttribute: (attr: string) => (attr === "data-lenis-prevent" ? "true" : null),
        classList: { contains: () => false },
        parentElement: null,
      };

      // @ts-expect-error accessing private method for test verification
      expect(lenis.isElementPrevented(modalElement as unknown as Element)).toBe(true);

      const standardElement = {
        tagName: "DIV",
        hasAttribute: () => false,
        getAttribute: () => null,
        classList: { contains: () => false },
        parentElement: null,
      };

      // @ts-expect-error accessing private method for test verification
      expect(lenis.isElementPrevented(standardElement as unknown as Element)).toBe(false);

      lenis.destroy();
    });

    it("checks ancestor chain for data-lenis-prevent attribute", () => {
      const lenis = new Lenis();

      const parentModal = {
        tagName: "DIV",
        hasAttribute: (attr: string) => attr === "data-lenis-prevent",
        getAttribute: () => "true",
        classList: { contains: () => false },
        parentElement: null,
      };

      const childInput = {
        tagName: "DIV",
        hasAttribute: () => false,
        getAttribute: () => null,
        classList: { contains: () => false },
        parentElement: parentModal,
      };

      // @ts-expect-error accessing private method for test verification
      expect(lenis.isElementPrevented(childInput as unknown as Element)).toBe(true);

      lenis.destroy();
    });

    it("excludes textarea and select elements from scroll interception", () => {
      const lenis = new Lenis();

      const textareaElement = {
        tagName: "TEXTAREA",
        hasAttribute: () => false,
        getAttribute: () => null,
        classList: { contains: () => false },
        parentElement: null,
      };

      // @ts-expect-error accessing private method for test verification
      expect(lenis.isElementPrevented(textareaElement as unknown as Element)).toBe(true);

      const selectElement = {
        tagName: "SELECT",
        hasAttribute: () => false,
        getAttribute: () => null,
        classList: { contains: () => false },
        parentElement: null,
      };

      // @ts-expect-error accessing private method for test verification
      expect(lenis.isElementPrevented(selectElement as unknown as Element)).toBe(true);

      lenis.destroy();
    });

    it("excludes modal dialogs with role=dialog or aria-modal=true", () => {
      const lenis = new Lenis();

      const dialogContainer = {
        tagName: "DIV",
        hasAttribute: () => false,
        getAttribute: (attr: string) => (attr === "role" ? "dialog" : null),
        classList: { contains: () => false },
        parentElement: null,
      };

      const dialogChild = {
        tagName: "SPAN",
        hasAttribute: () => false,
        getAttribute: () => null,
        classList: { contains: () => false },
        parentElement: dialogContainer,
      };

      // @ts-expect-error accessing private method for test verification
      expect(lenis.isElementPrevented(dialogChild as unknown as Element)).toBe(true);

      lenis.destroy();
    });
  });

  describe("3. Accessibility & Prefers-Reduced-Motion", () => {
    it("respects prefers-reduced-motion: reduce by performing immediate non-animated scrolling", () => {
      vi.stubGlobal("window", {
        scrollY: 0,
        innerHeight: 800,
        scrollTo: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        matchMedia: vi.fn().mockReturnValue({
          matches: true, // prefers-reduced-motion: reduce
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
      });

      const lenis = new Lenis();
      lenis.scrollTo(300);

      expect(lenis.scroll).toBe(300);
      expect(lenis.isScrolling).toBe(false);
      lenis.destroy();
    });
  });

  describe("4. Lifecycle Control & React Provider Integration", () => {
    it("stops and resumes scrolling via start() and stop()", () => {
      const lenis = new Lenis();
      lenis.stop();
      expect(lenis.isStopped).toBe(true);
      lenis.start();
      expect(lenis.isStopped).toBe(false);
      lenis.destroy();
    });

    it("renders SmoothScrollProvider without throwing in SSR/Node environment", () => {
      const Consumer = () => {
        const lenis = useLenis();
        return React.createElement("div", { "data-testid": "consumer" }, lenis ? "active" : "inactive");
      };

      const html = renderToStaticMarkup(
        React.createElement(
          SmoothScrollProvider,
          null,
          React.createElement(Consumer)
        )
      );

      expect(html).toContain('data-testid="consumer"');
    });
  });
});
