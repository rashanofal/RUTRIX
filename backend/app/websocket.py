import json
from typing import Any

from fastapi import WebSocket

from app.services.auth_service import decode_token


class ConnectionManager:
    def __init__(self):
        self.connections: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, organization_id: int):
        await websocket.accept()
        self.connections.setdefault(organization_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, organization_id: int):
        pool = self.connections.get(organization_id, [])
        if websocket in pool:
            pool.remove(websocket)
        if not pool and organization_id in self.connections:
            del self.connections[organization_id]

    async def broadcast(self, organization_id: int, message: dict[str, Any]):
        pool = self.connections.get(organization_id, [])
        if not pool:
            return
        dead: list[WebSocket] = []
        payload = json.dumps(message, default=str)
        for connection in pool:
            try:
                await connection.send_text(payload)
            except Exception:
                dead.append(connection)
        for conn in dead:
            self.disconnect(conn, organization_id)


manager = ConnectionManager()


def org_id_from_ws_token(token: str | None) -> int | None:
    if not token:
        return None
    payload = decode_token(token)
    if not payload or "org_id" not in payload:
        return None
    return int(payload["org_id"])
