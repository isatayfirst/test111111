from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from typing import List

from database import SessionLocal
from models import User, Message
from schemas import UserCreate, UserOut, Token
from auth import hash_password, verify_password, create_access_token, decode_access_token

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# 🔧 Получение сессии БД
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 🛠 Хелпер: получить текущего пользователя из токена
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.login == payload.get("sub")).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# ✅ Регистрация
@router.post("/register", response_model=UserOut)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.login == user_data.login).first():
        raise HTTPException(status_code=400, detail="Login already taken")

    hashed = hash_password(user_data.password)
    new_user = User(
        name=user_data.name,
        login=user_data.login,
        password=hashed,
        avatar="default.png"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

# 🔐 Вход
@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.login == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid login or password")

    token = create_access_token(data={"sub": user.login})
    return {"access_token": token, "token_type": "bearer"}

# 👤 Текущий пользователь
@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user

@router.get("/users", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(User).filter(User.id != current_user.id).all()

@router.get("/dialogs")
def get_dialogs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    users = db.query(User).filter(User.id != current_user.id).all()
    result = []

    for user in users:
        # Получаем последнее сообщение между current_user и user
        last_message = (
            db.query(Message)
            .filter(
                ((Message.sender_id == current_user.id) & (Message.receiver_id == user.id)) |
                ((Message.sender_id == user.id) & (Message.receiver_id == current_user.id))
            )
            .order_by(Message.timestamp.desc())
            .first()
        )

        result.append({
            "id": user.id,
            "login": user.login,
            "avatar": user.avatar,
            "last_message": last_message.text if last_message else "",
            "timestamp": str(last_message.timestamp) if last_message else ""
        })

    return result
