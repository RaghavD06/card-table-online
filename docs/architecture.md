# Architecture decisions

The web app is a presentation client. The Node server is the sole authority for room membership, game state, card randomness, actions, and virtual-chip settlement. Prisma persists durable identities and outcomes; Redis is reserved for ephemeral room and presence coordination.

`packages/shared/src/auth.ts` defines the application session shape and provider boundary. A future Auth.js adapter can map email/password, Google, and guest identities to this contract without coupling game code to a provider.

Each game implements a transport-independent `GameEngine` contract. Socket.IO and persistence depend on that contract, not on game rules.
