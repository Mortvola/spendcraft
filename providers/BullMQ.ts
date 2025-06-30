import {
  ConnectionOptions,
  Processor,
  Worker as BullWorker,
  Queue as BullQueue,
  QueueEvents as BullQueueEvents,
  WorkerOptions,
  QueueOptions,
} from 'bullmq'

export class BullMQ {
  constructor(public connection: ConnectionOptions) {
  }

  public queue<T, R>(name: string, options?: QueueOptions) {
    return new BullQueue<T, R>(name, { ...options, connection: this.connection })
  }

  public worker<T, R, N extends string = string>(
    name: string,
    callback: string | Processor<T, R, N>,
    options?: WorkerOptions
  ) {
    return new BullWorker<T, R, N>(name, callback, { ...options, connection: this.connection })
  }

  public events(name: string) {
    return new BullQueueEvents(name, { connection: this.connection })
  }
}

declare module '@adonisjs/core/types' {
  interface ContainerBindings {
    bullmq: BullMQ
  }
}
