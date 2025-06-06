from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from database import SessionLocal
from models import Message
from schemas import MessageCreate, MessageOut
from users import get_current_user
from models import User

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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

    return MessageOut(
        from_user=new_msg.sender_id,
        to=new_msg.receiver_id,
        text=new_msg.text,
        timestamp=new_msg.timestamp
    )
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
