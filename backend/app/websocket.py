import json
from dataclasses import dataclass
from typing import Any

from fastapi import WebSocket

from app.services.auth_service import decode_token


@dataclass
class WSClient:
    websocket: WebSocket
    organization_id: int
    user_id: int
    is_platform_owner: bool


class ConnectionManager:
    def __init__(self):
        self.connections: dict[int, list[WSClient]] = {}

    async def connect(
        self,
        websocket: WebSocket,
        organization_id: int,
        *,
        user_id: int,
        is_platform_owner: bool,
    ):
        await websocket.accept()
        client = WSClient(
            websocket=websocket,
            organization_id=organization_id,
            user_id=user_id,
            is_platform_owner=is_platform_owner,
        )
        self.connections.setdefault(organization_id, []).append(client)

    def disconnect(self, websocket: WebSocket, organization_id: int):
        pool = self.connections.get(organization_id, [])
        self.connections[organization_id] = [c for c in pool if c.websocket is not websocket]
        if not self.connections[organization_id]:
            del self.connections[organization_id]

    @staticmethod
    def _client_should_receive(client: WSClient, message: dict[str, Any]) -> bool:
        if client.is_platform_owner:
            return True
        msg_type = message.get("type")
        if msg_type in {"map_cleared", "detections_deleted"}:
            return False
        if msg_type in {"new_detection", "detection_updated"}:
            data = message.get("data") or {}
            return data.get("reporter_user_id") == client.user_id
        return True

    async def broadcast(self, organization_id: int, message: dict[str, Any]):
        pool = self.connections.get(organization_id, [])
        if not pool:
            return
        dead: list[WebSocket] = []
        payload = json.dumps(message, default=str)
        for client in pool:
            if not self._client_should_receive(client, message):
                continue
            try:
                await client.websocket.send_text(payload)
            except Exception:
                dead.append(client.websocket)
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


def user_id_from_ws_token(token: str | None) -> int | None:
    if not token:
        return None
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        return None
    return int(payload["sub"])
