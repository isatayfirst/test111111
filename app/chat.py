# app/chat.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict
from typing import List

from .auth import get_current_user
from .database import SessionLocal
from . import models, schemas

chat_router = APIRouter()

# Менеджер подключений
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: int):
        self.active_connections.pop(user_id, None)

    async def send_personal_message(self, message: str, user_id: int):
        websocket = self.active_connections.get(user_id)
        if websocket:
            await websocket.send_text(message)

manager = ConnectionManager()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@chat_router.get("/history/{with_id}", response_model=List[schemas.MessageRead])
def get_chat_history(
    with_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Все сообщения между текущим пользователем и собеседником `with_id`,
    упорядоченные по времени.
    """
    history = (
        db.query(models.Message)
        .filter(
            ((models.Message.sender_id == current_user.id) &
             (models.Message.receiver_id == with_id))
            |
            ((models.Message.sender_id == with_id) &
             (models.Message.receiver_id == current_user.id))
        )
        .order_by(models.Message.timestamp)           # по возрастанию
        .all()
    )
    return history

# ---------- WebSocket Чат ----------

@chat_router.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket, token: str, db: Session = Depends(get_db)):
    from .auth import get_current_user

    # Аутентификация
    try:
        user = get_current_user(token=token, db=db)
    except Exception:
        await websocket.close(code=1008)
        return

    await manager.connect(user.id, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            content = data.get("content")
            receiver_id = data.get("receiver_id")

            if not content or not receiver_id:
                continue

            # Сохраняем сообщение
            message = models.Message(
                content=content,
                sender_id=user.id,
                receiver_id=receiver_id,
            )
            db.add(message)
            db.commit()

            # --------- ОТПРАВКА ----------
            msg_text = f"{user.username}: {content}"

            # 1) адресату
            await manager.send_personal_message(msg_text, receiver_id)
            # 2) себе — чтобы увидел собственное сообщение
            await manager.send_personal_message(msg_text, user.id)

    except WebSocketDisconnect:
        manager.disconnect(user.id)
