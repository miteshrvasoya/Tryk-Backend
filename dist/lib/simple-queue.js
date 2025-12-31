"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleQueue = void 0;
const events_1 = require("events");
class SimpleQueue extends events_1.EventEmitter {
    constructor(name) {
        super();
        this.handler = null;
        this.processing = false;
        this.queue = [];
        this.name = name;
        console.log(`[SimpleQueue] Initialized queue: ${name}`);
    }
    async add(name, data, opts) {
        const id = opts?.jobId || Math.random().toString(36).substring(7);
        const job = { data, id };
        this.queue.push(job);
        console.log(`[SimpleQueue:${this.name}] Job added: ${id}`);
        // Trigger processing on next tick
        setImmediate(() => this.processNext());
        return { id };
    }
    process(handler) {
        this.handler = handler;
        console.log(`[SimpleQueue:${this.name}] Handler registered.`);
        // Check if there are pending jobs
        if (this.queue.length > 0) {
            setImmediate(() => this.processNext());
        }
    }
    async processNext() {
        if (this.processing || this.queue.length === 0 || !this.handler)
            return;
        this.processing = true;
        const job = this.queue.shift();
        if (job) {
            try {
                console.log(`[SimpleQueue:${this.name}] Processing job ${job.id}...`);
                await this.handler(job);
                console.log(`[SimpleQueue:${this.name}] Job ${job.id} completed.`);
                this.emit('completed', job);
            }
            catch (error) {
                console.error(`[SimpleQueue:${this.name}] Job ${job.id} failed:`, error);
                this.emit('failed', job, error);
            }
            finally {
                this.processing = false;
                // Process next job if any
                setImmediate(() => this.processNext());
            }
        }
        else {
            this.processing = false;
        }
    }
}
exports.SimpleQueue = SimpleQueue;
