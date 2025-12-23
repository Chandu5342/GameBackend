import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';

// Simple in-memory matchmaker with 20s wait before falling back to bot.
export default class Matchmaker extends EventEmitter {
  constructor(waitMs = 20000) {
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
      if (first.interval) clearInterval(first.interval);
      this.emit('match', first.player, player);
      return { matched: true };
    }

    // otherwise add to queue with timeout and per-second countdown
    const endTime = Date.now() + this.waitMs;

    const interval = setInterval(() => {
      const remainingMs = endTime - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      // emit countdown so server can forward to the player socket
      this.emit('countdown', player, remainingSec);
      if (remainingMs <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    const timer = setTimeout(() => {
      // if still waiting, remove and emit timeout event
      const idx = this.queue.findIndex((q) => q.token === token);
      if (idx !== -1) {
        const itm = this.queue.splice(idx, 1)[0];
        if (itm.interval) clearInterval(itm.interval);
        this.emit('timeout', player);
      }
    }, this.waitMs);

    item.timer = timer;
    item.interval = interval;
    this.queue.push(item);
    return { matched: false, token };
  }

  leave(playerId) {
    const idx = this.queue.findIndex((q) => q.player.id === playerId);
    if (idx !== -1) {
      clearTimeout(this.queue[idx].timer);
      if (this.queue[idx].interval) clearInterval(this.queue[idx].interval);
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
