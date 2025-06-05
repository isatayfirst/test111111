# app/schemas.py

from pydantic import BaseModel
from datetime import datetime
from typing import Optional

# ---------- Пользователь ----------

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserRead(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True


# ---------- Сообщение ----------

class MessageCreate(BaseModel):
    receiver_id: int
    content: str

class MessageRead(BaseModel):
    id: int
    content: str
    timestamp: datetime
    sender_id: int
    receiver_id: int

    class Config:
        from_attributes = True

