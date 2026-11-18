// adventure/app_bus.js — 轻量应用内事件总线，用于跨控制器通知解耦。
export function createAppBus() {
    const listeners = new Map();

    function on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        return () => listeners.get(event)?.delete(handler);
    }

    function emit(event, payload) {
        const handlers = listeners.get(event);
        if (!handlers?.size) return 0;
        for (const handler of [...handlers]) handler(payload);
        return handlers.size;
    }

    return { on, emit };
}
