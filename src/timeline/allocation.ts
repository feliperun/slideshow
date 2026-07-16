export type AllocationItem = {
  id: string;
  weight: number;
  minFrames: number;
  maxFrames: number;
};

/** Weighted water-filling with integer-frame largest-remainder correction. */
export const allocateFrames = (
  items: AllocationItem[],
  totalFrames: number,
): Map<string, number> => {
  if (items.length === 0) {
    if (totalFrames !== 0) throw new Error('Orçamento possui frames sem cenas flexíveis.');
    return new Map();
  }
  const minimum = items.reduce((sum, item) => sum + item.minFrames, 0);
  const maximum = items.reduce((sum, item) => sum + item.maxFrames, 0);
  if (totalFrames < minimum) {
    throw new Error(
      `Duração impossível: cenas exigem pelo menos ${minimum} frames, mas há ${totalFrames}.`,
    );
  }
  if (totalFrames > maximum) {
    throw new Error(
      `Duração impossível: cenas aceitam no máximo ${maximum} frames, mas há ${totalFrames}.`,
    );
  }

  const values = new Map(items.map((item) => [item.id, item.minFrames]));
  let remaining = totalFrames - minimum;
  let active = items.filter((item) => item.maxFrames > item.minFrames);

  while (remaining > 0 && active.length > 0) {
    const totalWeight = active.reduce((sum, item) => sum + item.weight, 0);
    const proposals = active.map((item) => {
      const current = values.get(item.id) as number;
      const ideal = remaining * (item.weight / totalWeight);
      const capacity = item.maxFrames - current;
      return { item, current, ideal, capacity, add: Math.min(capacity, Math.floor(ideal)) };
    });
    let distributed = proposals.reduce((sum, proposal) => sum + proposal.add, 0);
    for (const proposal of proposals) {
      values.set(proposal.item.id, proposal.current + proposal.add);
    }
    remaining -= distributed;

    if (remaining > 0) {
      const byRemainder = proposals
        .filter((proposal) => (values.get(proposal.item.id) as number) < proposal.item.maxFrames)
        .sort((left, right) => {
          const remainderDifference = right.ideal - right.add - (left.ideal - left.add);
          return remainderDifference || left.item.id.localeCompare(right.item.id);
        });
      for (const proposal of byRemainder) {
        if (remaining === 0) break;
        const current = values.get(proposal.item.id) as number;
        if (current < proposal.item.maxFrames) {
          values.set(proposal.item.id, current + 1);
          remaining -= 1;
          distributed += 1;
        }
      }
    }

    active = active.filter((item) => (values.get(item.id) as number) < item.maxFrames);
    if (distributed === 0 && remaining > 0 && active.length > 0) {
      const item = active[0] as AllocationItem;
      values.set(item.id, (values.get(item.id) as number) + 1);
      remaining -= 1;
    }
  }

  if (remaining !== 0) throw new Error(`Falha ao distribuir ${remaining} frames.`);
  return values;
};
