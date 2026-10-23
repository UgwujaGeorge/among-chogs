import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { LIVE_ROOM, ROOM_NAME } from "../../web/src/shared/protocol";
import { GameRoom, LiveRoom } from "./GameRoom";

const port = Number(process.env.PORT ?? 2567);

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: { [ROOM_NAME]: defineRoom(GameRoom), [LIVE_ROOM]: defineRoom(LiveRoom) },
});

await server.listen(port);
console.log(`Among Chogs server on :${port}`);
