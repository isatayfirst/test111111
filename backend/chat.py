from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List, Dict
from database import SessionLocal
from models import Message
from schemas import MessageCreate, MessageOut
from users import get_current_user
from models import User
from auth import decode_access_token

router = APIRouter()

# Active WebSocket connections {user_id: [WebSocket, ...]}
connections: Dict[int, list] = {}

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def authenticate_ws(token: str, db: Session) -> User | None:
    payload = decode_access_token(token)
    if not payload:
        return None
    return db.query(User).filter(User.login == payload.get("sub")).first()

@router.get("/messages", response_model=List[MessageOut])
def get_messages(
    with_user: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    messages = db.query(Message).filter(
        ((Message.sender_id == current_user.id) & (Message.receiver_id == with_user)) |
        ((Message.sender_id == with_user) & (Message.receiver_id == current_user.id))
    ).order_by(Message.timestamp).all()

    return [
        MessageOut(
            id=m.id,
            from_user=m.sender_id,
            to=m.receiver_id,
            text=m.text,
            timestamp=m.timestamp
        ) for m in messages
    ]

@router.post("/messages", response_model=MessageOut)
def send_message(msg: MessageCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_msg = Message(
        sender_id=current_user.id,
        receiver_id=msg.to,
        text=msg.text
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    out = MessageOut(
        id=new_msg.id,
        from_user=new_msg.sender_id,
        to=new_msg.receiver_id,
        text=new_msg.text,
        timestamp=new_msg.timestamp
    )

    # push to websocket subscribers
    payload = {
        "type": "message",
        "data": out.model_dump()
    }
    for uid in (new_msg.receiver_id, new_msg.sender_id):
        for ws in connections.get(uid, []):
            try:
                import asyncio
                asyncio.create_task(ws.send_json(payload))
            except RuntimeError:
                pass

    return out


@router.delete("/messages/{msg_id}")
def delete_message(msg_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter(Message.id == msg_id).first()
    if not msg or msg.sender_id != current_user.id:
        raise HTTPException(status_code=404, detail="Message not found")
    db.delete(msg)
    db.commit()
    payload = {"type": "delete", "data": {"id": msg_id, "with": msg.receiver_id}}
    for uid in (msg.receiver_id, msg.sender_id):
        for ws in connections.get(uid, []):
            try:
                import asyncio
                asyncio.create_task(ws.send_json(payload))
            except RuntimeError:
                pass
    return {"ok": True}


@router.websocket("/ws")
async def chat_ws(websocket: WebSocket, token: str):
    await websocket.accept()
    db = SessionLocal()
    user = authenticate_ws(token, db)
    if not user:
        await websocket.close()
        db.close()
        return

    connections.setdefault(user.id, []).append(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        pass
    finally:
        connections[user.id].remove(websocket)
        if not connections[user.id]:
            del connections[user.id]
        db.close()


@router.get("/online", response_model=List[int])
def online_users():
    return list(connections.keys())

@router.get("/dialogs")
def get_dialogs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy import desc

    # Получаем все сообщения, где текущий пользователь участвует
    messages = db.query(Message).filter(
        (Message.sender_id == current_user.id) | (Message.receiver_id == current_user.id)
    ).order_by(desc(Message.timestamp)).all()

    last_msgs = {}
    for msg in messages:
        partner_id = msg.receiver_id if msg.sender_id == current_user.id else msg.sender_id
        if partner_id not in last_msgs:
            last_msgs[partner_id] = msg

    results = []
    for partner_id, msg in last_msgs.items():
        user = db.query(User).filter(User.id == partner_id).first()
        if user:
            results.append({
                "id": user.id,
                "login": user.login,
                "avatar": user.avatar,
                "last_message": msg.text,
                "timestamp": msg.timestamp
            })

    return results
