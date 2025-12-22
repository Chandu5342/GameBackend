import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';

// Simple in-memory matchmaker with 10s wait before falling back to bot.
export default class Matchmaker extends EventEmitter {
  constructor(waitMs = 10000) {
    super();
    this.waitMs = waitMs;
    this.queue = []; // items: { token, player }
  }

  // player: { id, username, socket }
  join(player) {
    const token = uuidv4();
    const item = { token, player };

    // if someone waiting, pair immediately
    if (this.queue.length > 0) {
      const [first] = this.queue.splice(0, 1);
      clearTimeout(first.timer);
      this.emit('match', first.player, player);
      return { matched: true };
    }

    // otherwise add to queue with timeout
    const timer = setTimeout(() => {
      // if still waiting, remove and emit timeout event
      const idx = this.queue.findIndex((q) => q.token === token);
      if (idx !== -1) {
        this.queue.splice(idx, 1);
        this.emit('timeout', player);
      }
    }, this.waitMs);

    item.timer = timer;
    this.queue.push(item);
    return { matched: false, token };
  }

  leave(playerId) {
    const idx = this.queue.findIndex((q) => q.player.id === playerId);
    if (idx !== -1) {
      clearTimeout(this.queue[idx].timer);
      this.queue.splice(idx, 1);
      return true;
    }
    return false;
  }

  // For tests/inspection
  queueSize() {
    return this.queue.length;
  }
}
