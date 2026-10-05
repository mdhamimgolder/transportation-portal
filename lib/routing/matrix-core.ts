export type MatrixCoordinate = { lat: number; lng: number };

export type MatrixBatch<T extends MatrixCoordinate> = {
  originOffset: number;
  destinationOffset: number;
  origins: T[];
  destinations: T[];
  coordinates: T[];
  sourceIndices: number[];
  destinationIndices: number[];
};

/**
 * Split a table query into blocks whose deduplicated coordinate list stays
 * within the provider limit. Half-sized source/destination blocks guarantee
 * the bound even when no coordinates overlap.
 */
export function buildMatrixBatches<T extends MatrixCoordinate>(
  origins: T[],
  destinations: T[],
  maxCoordinates = 100
): MatrixBatch<T>[] {
  if (!Number.isInteger(maxCoordinates) || maxCoordinates < 2) {
    throw new RangeError("maxCoordinates must be an integer of at least 2");
  }

  const side = Math.floor(maxCoordinates / 2);
  const batches: MatrixBatch<T>[] = [];

  for (let originOffset = 0; originOffset < origins.length; originOffset += side) {
    const batchOrigins = origins.slice(originOffset, originOffset + side);
    for (
      let destinationOffset = 0;
      destinationOffset < destinations.length;
      destinationOffset += side
    ) {
      const batchDestinations = destinations.slice(
        destinationOffset,
        destinationOffset + side
      );
      const coordinates: T[] = [];
      const coordinateIndex = new Map<string, number>();
      const indexOf = (coordinate: T): number => {
        const key = `${coordinate.lat},${coordinate.lng}`;
        const existing = coordinateIndex.get(key);
        if (existing !== undefined) return existing;
        const index = coordinates.length;
        coordinates.push(coordinate);
        coordinateIndex.set(key, index);
        return index;
      };

      batches.push({
        originOffset,
        destinationOffset,
        origins: batchOrigins,
        destinations: batchDestinations,
        coordinates,
        sourceIndices: batchOrigins.map(indexOf),
        destinationIndices: batchDestinations.map(indexOf),
      });
    }
  }

  return batches;
}