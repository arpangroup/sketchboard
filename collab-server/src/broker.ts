/**
 * RoomBroker abstracts "deliver this message to everyone in room X".
 *
 * - InMemoryRoomBroker: single node (default, zero dependencies).
 * - For horizontal scaling, implement the same interface on Redis Pub/Sub / NATS:
 *   publish(room, msg) -> PUBLISH room:<id>; each node subscribes for rooms with local members
 *   and fans out to its own sockets. No sticky sessions needed because the server is stateless
 *   (it never stores drawings - peers hold the state).
 */
export interface RoomMember {
  id: string;
  send(data: string): void;
}

export interface RoomBroker {
  join(roomId: string, member: RoomMember): string[]; // returns ids of existing peers
  leave(roomId: string, memberId: string): void;
  publish(roomId: string, data: string, exceptId?: string): void;
  roomCount(): number;
  memberCount(): number;
}

export class InMemoryRoomBroker implements RoomBroker {
  private rooms = new Map<string, Map<string, RoomMember>>();

  join(roomId: string, member: RoomMember): string[] {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Map();
      this.rooms.set(roomId, room);
    }
    const peers = [...room.keys()];
    room.set(member.id, member);
    return peers;
  }

  leave(roomId: string, memberId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.delete(memberId);
    if (room.size === 0) this.rooms.delete(roomId);
  }

  publish(roomId: string, data: string, exceptId?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const [id, m] of room) if (id !== exceptId) m.send(data);
  }

  roomCount(): number {
    return this.rooms.size;
  }

  memberCount(): number {
    let n = 0;
    for (const r of this.rooms.values()) n += r.size;
    return n;
  }
}
