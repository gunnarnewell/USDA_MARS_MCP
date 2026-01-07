export class Semaphore {
  private readonly max: number;
  private current = 0;
  private queue: Array<() => void> = [];

  constructor(max: number) {
    this.max = max;
  }

  async acquire(): Promise<() => void> {
    if (this.current < this.max) {
      this.current += 1;
      return () => this.release();
    }

    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });

    this.current += 1;
    return () => this.release();
  }

  private release(): void {
    this.current -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}
