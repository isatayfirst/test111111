# app/main.py

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from app import auth, chat

from .database import Base, engine
from .auth import auth_router
from .chat import chat_router

# Инициализация таблиц в базе данных
Base.metadata.create_all(bind=engine)

# Создание FastAPI приложения
app = FastAPI()
app.mount("/static", StaticFiles(directory="app/static"), name="static")
# Подключение шаблонов
templates = Jinja2Templates(directory="app/templates")

# Подключение маршрутов
app.include_router(auth_router, prefix="/auth")
app.include_router(chat_router)

# Рендер HTML-клиента
@app.get("/", response_class=HTMLResponse)
async def show_login(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/chat", response_class=HTMLResponse)
async def show_chat(request: Request):
    return templates.TemplateResponse("chat.html", {"request": request})

