// A first-in-first-out queue built as a singly linked list.
// Why not an array? array.shift() is O(n) because every item moves down one
// slot. Here we keep a pointer to the head AND the tail, so every operation
// below is O(1).
class QueueNode {
  constructor(value) {
    this.value = value;
    this.next = null; // pointer to the node behind this one
  }
}

export class Queue {
  #head = null; // front of the line (next to leave)
  #tail = null; // back of the line (last to join)
  #size = 0;

  // O(1): add to the back.
  enqueue(value) {
    const node = new QueueNode(value);
    if (this.#tail) {
      this.#tail.next = node;
    } else {
      this.#head = node; // queue was empty
    }
    this.#tail = node;
    this.#size++;
  }

  // O(1): remove from the front. Returns undefined if empty.
  dequeue() {
    if (!this.#head) return undefined;
    const node = this.#head;
    this.#head = node.next;
    if (!this.#head) this.#tail = null; // queue is now empty
    this.#size--;
    return node.value;
  }

  // O(1): look at the front without removing it.
  peek() {
    return this.#head ? this.#head.value : undefined;
  }

  // O(1): number of items waiting.
  get size() {
    return this.#size;
  }

  // O(n): copy of the line in order (used for display only).
  toArray() {
    const out = [];
    for (let n = this.#head; n; n = n.next) out.push(n.value);
    return out;
  }
}
