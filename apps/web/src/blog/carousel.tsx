import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ChangelogInline } from "../landing/changelog-inline";
import { LightboxImage } from "./lightbox";
import type { CarouselItem } from "./parse-post";

export type CarouselEdges = {
  overflowing: boolean;
  atStart: boolean;
  atEnd: boolean;
};

export function carouselEdges(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): CarouselEdges {
  return {
    overflowing: scrollWidth - clientWidth > 1,
    atStart: scrollLeft <= 1,
    atEnd: scrollLeft + clientWidth >= scrollWidth - 1,
  };
}

export function carouselStepTarget(
  positions: readonly number[],
  current: number,
  max: number,
  direction: 1 | -1,
): number {
  if (direction === 1) {
    const next = positions.find((position) => position > current + 1);
    return Math.min(next ?? max, max);
  }
  const previous = positions
    .filter((position) => position < current - 1)
    .at(-1);
  return Math.max(previous ?? 0, 0);
}

export function PostCarousel({
  label,
  items,
}: {
  label?: string;
  items: CarouselItem[];
}) {
  const trackId = useId();
  const trackRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState<CarouselEdges>({
    overflowing: true,
    atStart: true,
    atEnd: false,
  });

  const sync = useCallback(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    setEdges(
      carouselEdges(track.scrollLeft, track.clientWidth, track.scrollWidth),
    );
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    sync();
    track.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(track);
    return () => {
      track.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [sync]);

  const step = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const trackLeft = track.getBoundingClientRect().left;
    const padding =
      Number.parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0;
    const positions = Array.from(
      track.children,
      (card) =>
        track.scrollLeft +
        card.getBoundingClientRect().left -
        trackLeft -
        padding,
    );
    track.scrollTo({
      left: carouselStepTarget(
        positions,
        track.scrollLeft,
        track.scrollWidth - track.clientWidth,
        direction,
      ),
    });
  };

  return (
    <section className="post-carousel" aria-label={label ?? "Carousel"}>
      <div
        className="post-carousel-bar"
        data-overflowing={edges.overflowing ? "true" : "false"}
      >
        {label ? <span className="post-carousel-label">{label}</span> : null}
        <div className="post-carousel-nav">
          <button
            type="button"
            aria-label="Previous"
            aria-controls={trackId}
            disabled={edges.atStart}
            onClick={() => step(-1)}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </button>
          <button
            type="button"
            aria-label="Next"
            aria-controls={trackId}
            disabled={edges.atEnd}
            onClick={() => step(1)}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </button>
        </div>
      </div>
      <ul
        id={trackId}
        ref={trackRef}
        className="post-carousel-track"
        tabIndex={0}
      >
        {items.map((item, index) => (
          <li key={`${index}-${item.src}`} className="post-carousel-card">
            <LightboxImage src={item.src} alt={item.alt} />
            <p className="post-carousel-title">{item.title}</p>
            {item.caption ? (
              <p className="post-carousel-caption">
                <ChangelogInline text={item.caption} />
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
