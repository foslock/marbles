"""Main entry point for the Losing Their Marbles server."""

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .socketio_handlers import sio

app = FastAPI(title="Losing Their Marbles", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "game": "Losing Their Marbles"}


# Mount Socket.IO as ASGI app
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
