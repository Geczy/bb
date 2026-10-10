export function cloneProjectionState<TValue>(value: TValue): TValue {
  return cloneValue(value, new Map()) as TValue;
}

function cloneValue(value: unknown, clones: Map<object, unknown>): unknown {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const existing = clones.get(value);
  if (existing !== undefined) {
    return existing;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    clones.set(value, copy);
    for (const item of value) {
      copy.push(cloneValue(item, clones));
    }
    return copy;
  }
  if (value instanceof Map) {
    const copy = new Map<unknown, unknown>();
    clones.set(value, copy);
    for (const [key, item] of value) {
      copy.set(cloneValue(key, clones), cloneValue(item, clones));
    }
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set<unknown>();
    clones.set(value, copy);
    for (const item of value) {
      copy.add(cloneValue(item, clones));
    }
    return copy;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Projection state holds a value that cannot be cloned");
  }
  const copy: Record<string, unknown> = {};
  clones.set(value, copy);
  for (const [key, item] of Object.entries(value)) {
    copy[key] = cloneValue(item, clones);
  }
  return copy;
}
