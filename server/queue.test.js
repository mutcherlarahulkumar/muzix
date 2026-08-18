import test from 'node:test';
import assert from 'node:assert/strict';
import { orderQueue, QUEUE_SORT } from './queue.js';

const song = (id, upvotes) => ({ _id: id, upvotes });

test('most upvoted plays first', () => {
    const ordered = orderQueue([song('c', 1), song('a', 9), song('b', 4)]);
    assert.deepEqual(ordered.map((s) => s._id), ['a', 'b', 'c']);
});

test('ties break by insertion order, not by luck', () => {
    // Same votes, deliberately passed in reverse insertion order.
    const ordered = orderQueue([song('b', 3), song('a', 3)]);
    assert.deepEqual(ordered.map((s) => s._id), ['a', 'b']);
});

test('ordering is stable across repeated calls', () => {
    const queue = [song('b', 3), song('a', 3), song('c', 3)];
    assert.deepEqual(orderQueue(queue), orderQueue(orderQueue(queue)));
});

test('songs with no votes yet sort last, not first', () => {
    const ordered = orderQueue([song('a', undefined), song('b', 1)]);
    assert.deepEqual(ordered.map((s) => s._id), ['b', 'a']);
});

test('the input array is not mutated', () => {
    const queue = [song('b', 1), song('a', 5)];
    orderQueue(queue);
    assert.deepEqual(queue.map((s) => s._id), ['b', 'a']);
});

test('the Mongo sort spec matches the JS tiebreak', () => {
    assert.deepEqual(QUEUE_SORT, { upvotes: -1, _id: 1 });
});
