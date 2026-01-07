export class Semaphore {
  private available: number;
  private queue: Array<() => void> = [];

  constructor(limit: number) {
    if (limit <= 0) {
      throw new Error("Semaphore limit must be greater than zero.");
    }
    this.available = limit;
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.available -= 1;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.available += 1;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}
