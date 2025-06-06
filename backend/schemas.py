from pydantic import BaseModel
from typing import Optional

# 🔐 Для регистрации пользователя
class UserCreate(BaseModel):
    name: str
    login: str
    password: str

# 🔐 Для входа
class UserLogin(BaseModel):
    login: str
    password: str

# ✅ Ответ при успешной регистрации/входе
class UserOut(BaseModel):
    id: int
    name: str
    login: str
    avatar: Optional[str] = None

    class Config:
        orm_mode = True  # позволяет работать с SQLAlchemy-объектами

# 🔑 Ответ с токеном
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

from datetime import datetime

class MessageCreate(BaseModel):
    to: int         # ID получателя
    text: str

class MessageOut(BaseModel):
    id: int
    from_user: int
    to: int
    text: str
    timestamp: datetime

    class Config:
        from_attributes = True
