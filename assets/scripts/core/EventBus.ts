export type EventHandler<T = unknown> = (payload: T) => void;

export class EventBus {
    private readonly handlers = new Map<string, Set<EventHandler>>();

    on<T>(event: string, handler: EventHandler<T>): () => void {
        const listeners = this.handlers.get(event) ?? new Set<EventHandler>();
        listeners.add(handler as EventHandler);
        this.handlers.set(event, listeners);
        return () => listeners.delete(handler as EventHandler);
    }

    emit<T>(event: string, payload: T): void {
        this.handlers.get(event)?.forEach((handler) => handler(payload));
    }

    clear(): void {
        this.handlers.clear();
    }
}
