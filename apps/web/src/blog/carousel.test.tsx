import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { carouselEdges, carouselStepTarget, PostCarousel } from "./carousel";

describe("carouselEdges", () => {
  it("disables previous at the start and next at the end", () => {
    expect(carouselEdges(0, 300, 900)).toEqual({
      overflowing: true,
      atStart: true,
      atEnd: false,
    });
    expect(carouselEdges(600, 300, 900)).toEqual({
      overflowing: true,
      atStart: false,
      atEnd: true,
    });
  });

  it("treats sub-pixel scroll positions as the edge", () => {
    expect(carouselEdges(599.5, 300, 900).atEnd).toBe(true);
    expect(carouselEdges(0.5, 300, 900).atStart).toBe(true);
  });

  it("reports no overflow when every card fits", () => {
    expect(carouselEdges(0, 900, 900)).toEqual({
      overflowing: false,
      atStart: true,
      atEnd: true,
    });
  });
});

describe("carouselStepTarget", () => {
  const positions = [0, 274, 548, 822, 1096, 1370, 1644];

  it("moves exactly one card in either direction", () => {
    expect(carouselStepTarget(positions, 0, 1228, 1)).toBe(274);
    expect(carouselStepTarget(positions, 548, 1228, -1)).toBe(274);
  });

  it("stops at the end instead of past the last full scroll", () => {
    expect(carouselStepTarget(positions, 1096, 1228, 1)).toBe(1228);
    expect(carouselStepTarget(positions, 1228, 1228, 1)).toBe(1228);
  });

  it("steps back from the end to the nearest earlier card", () => {
    expect(carouselStepTarget(positions, 1228, 1228, -1)).toBe(1096);
    expect(carouselStepTarget(positions, 0, 1228, -1)).toBe(0);
  });
});

describe("PostCarousel", () => {
  it("renders each card's image, title and caption in order", () => {
    const html = renderToStaticMarkup(
      <PostCarousel
        label="Plugins I built"
        items={[
          {
            src: "/blog/one.jpg",
            alt: "First card",
            title: "One",
            caption: "The first card",
          },
          { src: "/blog/two.jpg", alt: "Second card", title: "Two" },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Plugins I built"');
    expect(html).toContain(">Plugins I built</span>");
    expect(html.indexOf('alt="First card"')).toBeLessThan(
      html.indexOf('alt="Second card"'),
    );
    expect(html).toContain(">One</p>");
    expect(html).toContain("The first card");
    expect(html.match(/post-carousel-caption/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Previous"');
    expect(html).toContain('aria-label="Next"');
  });

  it("falls back to a generic region label without a visible label", () => {
    const html = renderToStaticMarkup(
      <PostCarousel
        items={[{ src: "/blog/one.jpg", alt: "First card", title: "One" }]}
      />,
    );
    expect(html).toContain('aria-label="Carousel"');
    expect(html).not.toContain("post-carousel-label");
  });
});
