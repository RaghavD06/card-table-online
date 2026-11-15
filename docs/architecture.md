# Architecture decisions

The web app is a presentation client. The Node server is the sole authority for room membership, player presence, game state, card randomness, actions, and virtual-chip settlement. Prisma persists durable identities and outcomes; Redis is reserved for ephemeral room and presence coordination.

Phase 2 room lifecycle is implemented by `apps/server/src/rooms.ts`. `RoomManager` owns code generation, membership, reconnects, readiness, and host reassignment. Socket.IO only translates events into domain operations and broadcasts authoritative `RoomSummary` projections. `RoomStateStore` is the explicit storage boundary; `InMemoryRoomStateStore` is used by the current single-process server and tests, while a Redis implementation can be introduced without changing the domain or transport layer.

`packages/shared/src/auth.ts` defines the application session shape and provider boundary. A future Auth.js adapter can map email/password, Google, and guest identities to this contract without coupling game code to a provider.

Each game implements a transport-independent `GameEngine` contract. Socket.IO and persistence depend on that contract, not on game rules. `packages/game-engine` contains deterministic Rummy and Pot implementations; the engines own deck order, private hands, turn validation, action events, and terminal state transitions.
