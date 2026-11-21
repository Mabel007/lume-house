export type StoryMeasure = {
  left: number;
  width: number;
};

// Which panel the reader is on: the one whose centre sits nearest the centre of
// the row, because that is where scroll-snap-align: center parks it. Measuring
// instead of counting is what makes one keypress equal one piece at every width,
// including when a panel is wider than the row or the row is mid-scroll — the old
// step of 80% of the row's width was larger than the row's entire scrollable
// length, so the first ArrowRight landed on the last panel and the rest looked dead.
export function currentPanelIndex(panels: StoryMeasure[], view: StoryMeasure): number {
  const centre = view.left + view.width / 2;
  let index = 0;
  let closest = Number.POSITIVE_INFINITY;
  panels.forEach((panel, position) => {
    const distance = Math.abs(panel.left + panel.width / 2 - centre);
    if (distance < closest) {
      closest = distance;
      index = position;
    }
  });
  return index;
}
