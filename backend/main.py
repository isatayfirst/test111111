from fastapi import FastAPI
from users import router as user_router
from fastapi import FastAPI
from database import Base, engine
from users import router as user_router
from chat import router as chat_router
from fastapi.staticfiles import StaticFiles

# создаём таблицы
Base.metadata.create_all(bind=engine)

app = FastAPI()
app.include_router(user_router)
app.include_router(chat_router)

app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")

app.include_router(user_router)

@app.get("/")
def root():
    return {"message": "Backend is running"}
