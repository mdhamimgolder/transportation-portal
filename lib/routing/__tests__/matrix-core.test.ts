import assert from "node:assert/strict";
import test from "node:test";
import { buildMatrixBatches } from "../matrix-core";

test("matrix batches stay within the coordinate limit and cover every pair", () => {
  const locations = Array.from({ length: 151 }, (_, index) => ({
    lat: 23 + index / 10_000,
    lng: 90 + index / 10_000,
  }));
  const batches = buildMatrixBatches(locations, locations, 100);
  const pairs = new Set<string>();

  for (const batch of batches) {
    assert.ok(batch.coordinates.length <= 100);
    for (let i = 0; i < batch.origins.length; i++) {
      assert.deepEqual(
        batch.coordinates[batch.sourceIndices[i]],
        batch.origins[i]
      );
      for (let j = 0; j < batch.destinations.length; j++) {
        assert.deepEqual(
          batch.coordinates[batch.destinationIndices[j]],
          batch.destinations[j]
        );
        pairs.add(
          `${batch.originOffset + i}|${batch.destinationOffset + j}`
        );
      }
    }
  }

  assert.equal(pairs.size, locations.length ** 2);
});

test("matrix batches deduplicate shared source/destination coordinates", () => {
  const locations = [
    { lat: 23.8, lng: 90.4 },
    { lat: 23.9, lng: 90.5 },
  ];
  const [batch] = buildMatrixBatches(locations, locations, 100);
  assert.equal(batch.coordinates.length, 2);
  assert.deepEqual(batch.sourceIndices, [0, 1]);
  assert.deepEqual(batch.destinationIndices, [0, 1]);
});