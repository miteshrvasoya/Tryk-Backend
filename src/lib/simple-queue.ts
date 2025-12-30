
import { EventEmitter } from 'events';

type JobHandler = (job: { data: any, id: string }) => Promise<void>;

export class SimpleQueue extends EventEmitter {
  private name: string;
  private handler: JobHandler | null = null;
  private processing: boolean = false;
  private queue: { data: any, id: string }[] = [];

  constructor(name: string) {
    super();
    this.name = name;
    console.log(`[SimpleQueue] Initialized queue: ${name}`);
  }

  async add(name: string, data: any, opts?: any) {
    const id = opts?.jobId || Math.random().toString(36).substring(7);
    const job = { data, id };
    this.queue.push(job);
    console.log(`[SimpleQueue:${this.name}] Job added: ${id}`);
    
    // Trigger processing on next tick
    setImmediate(() => this.processNext());
    return { id };
  }

  process(handler: JobHandler) {
    this.handler = handler;
    console.log(`[SimpleQueue:${this.name}] Handler registered.`);
    // Check if there are pending jobs
    if (this.queue.length > 0) {
        setImmediate(() => this.processNext());
    }
  }

  private async processNext() {
    if (this.processing || this.queue.length === 0 || !this.handler) return;

    this.processing = true;
    const job = this.queue.shift();

    if (job) {
        try {
            console.log(`[SimpleQueue:${this.name}] Processing job ${job.id}...`);
            await this.handler(job);
            console.log(`[SimpleQueue:${this.name}] Job ${job.id} completed.`);
            this.emit('completed', job);
        } catch (error: any) {
            console.error(`[SimpleQueue:${this.name}] Job ${job.id} failed:`, error);
            this.emit('failed', job, error);
        } finally {
            this.processing = false;
            // Process next job if any
            setImmediate(() => this.processNext());
        }
    } else {
        this.processing = false;
    }
  }
}
