// Tiny event bus between the Phaser scene and the React HUD.

type Events = {
  room: string | null;
  ready: void;
  action: "use" | "rug" | "sabotage";
  /** What you're standing at: "station:id", "panel:id", "vent:id", "liq", or null. */
  near: string | null;
};

type Handler<T> = (payload: T) => void;
const handlers = new Map<keyof Events, Set<Handler<never>>>();

export const bus = {
  on<K extends keyof Events>(event: K, fn: Handler<Events[K]>) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    const set = handlers.get(event) as Set<Handler<Events[K]>>;
    set.add(fn);
    return () => set.delete(fn);
  },
  emit<K extends keyof Events>(event: K, payload: Events[K]) {
    (handlers.get(event) as Set<Handler<Events[K]>> | undefined)?.forEach((fn) => fn(payload));
  },
};
