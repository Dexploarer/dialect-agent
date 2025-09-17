import type { Job as BullJob, Queue as BullQueue } from 'bull';
import type AgentManager from '../agents/agent-manager.js';
import type { DialectWebhookEvent } from '../agents/dialect-monitor.js';

type DialectEventsJob = { events: DialectWebhookEvent[] };
type AgentExecJob = { agentId: string; triggerId: string; event: any };

interface QueueLike<T> {
  add(name: string, data: T): Promise<void>;
}

class InMemoryQueue<T> implements QueueLike<T> {
  private handlers: Record<string, (data: T) => Promise<void>> = {};
  private queue: Array<{ name: string; data: T }> = [];
  private concurrency = 4;
  private running = 0;

  constructor() {
    // Start loop
    setInterval(() => this.drain(), 50).unref?.();
  }

  on(name: string, handler: (data: T) => Promise<void>) {
    this.handlers[name] = handler;
  }

  async add(name: string, data: T): Promise<void> {
    this.queue.push({ name, data });
    this.drain();
  }

  private drain() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;
      this.running++;
      const handler = this.handlers[item.name];
      if (!handler) {
        this.running--;
        continue;
      }
      handler(item.data)
        .catch((e) => {
          console.error('InMemoryQueue handler error:', e);
        })
        .finally(() => {
          this.running--;
        });
    }
  }
}

let useBull = false;
let dialectQueue: QueueLike<DialectEventsJob> | null = null;
let execQueue: QueueLike<AgentExecJob> | null = null;

export function queuesReady() {
  return Boolean(dialectQueue && execQueue);
}

export async function initializeQueues(agentManager: AgentManager) {
  const redisUrl = process.env.REDIS_URL || '';
  useBull = Boolean(redisUrl);

  if (useBull) {
    try {
      const Bull = (await import('bull')).default;
      const connectionOpts = parseRedisUrl(redisUrl);

      const dq = new Bull<DialectEventsJob>('dialect-events', connectionOpts) as unknown as BullQueue<DialectEventsJob>;
      const eq = new Bull<AgentExecJob>('agent-exec', connectionOpts) as unknown as BullQueue<AgentExecJob>;

      // Processors
      dq.process(Number(process.env.QUEUE_DIALECT_CONCURRENCY || 4), async (job: BullJob<DialectEventsJob>) => {
        await handleDialectEventsJob(agentManager, job.data);
      });

      eq.process(Number(process.env.QUEUE_EXEC_CONCURRENCY || 8), async (job: BullJob<AgentExecJob>) => {
        const { agentId, triggerId, event } = job.data;
        await agentManager.executeAgent(agentId, triggerId, event);
      });

      // Light wrappers to match QueueLike
      dialectQueue = {
        add: async (_name, data) => {
          await dq.add('dialect-events', data, { attempts: 3, backoff: { type: 'exponential', delay: 500 } });
        },
      };
      execQueue = {
        add: async (_name, data) => {
          await eq.add('agent-exec', data, { attempts: 3, backoff: { type: 'exponential', delay: 500 } });
        },
      };

      console.log('✅ Queues initialized (Bull + Redis)');
      return;
    } catch (e) {
      console.warn('⚠️ Failed to initialize Bull/Redis. Falling back to in-memory queues.', e);
      useBull = false;
    }
  }

  // In-memory fallback
  const dq = new InMemoryQueue<DialectEventsJob>();
  const eq = new InMemoryQueue<AgentExecJob>();

  dq.on('dialect-events', async (data) => {
    await handleDialectEventsJob(agentManager, data);
  });
  eq.on('agent-exec', async (data) => {
    const { agentId, triggerId, event } = data;
    await agentManager.executeAgent(agentId, triggerId, event);
  });

  dialectQueue = dq;
  execQueue = eq;
  console.log('✅ Queues initialized (in-memory)');
}

export async function enqueueDialectEvents(events: DialectWebhookEvent[]) {
  if (!dialectQueue) throw new Error('Queues not initialized');
  await dialectQueue.add('dialect-events', { events });
}

export async function enqueueAgentExecution(agentId: string, triggerId: string, event: any) {
  if (!execQueue) throw new Error('Queues not initialized');
  await execQueue.add('agent-exec', { agentId, triggerId, event });
}

async function handleDialectEventsJob(agentManager: AgentManager, data: DialectEventsJob) {
  const monitor = (agentManager as any)['dialectMonitor'];
  if (!monitor) return;
  const normalized = monitor.previewNormalizedEvents(data.events);
  for (const evt of normalized) {
    const matches = monitor.findMatchingTriggersForEvent(evt) as Array<{ agentId: string; trigger: any }>;
    for (const m of matches) {
      await enqueueAgentExecution(m.agentId, m.trigger.id, evt);
    }
  }
}

function parseRedisUrl(url: string) {
  try {
    const u = new URL(url);
    const opts: any = { redis: { port: Number(u.port || '6379'), host: u.hostname } };
    if (u.password) opts.redis.password = u.password;
    if (u.username) opts.redis.username = u.username;
    if (u.protocol === 'rediss:') opts.redis.tls = {};
    return opts;
  } catch {
    return { redis: url } as any;
  }
}

