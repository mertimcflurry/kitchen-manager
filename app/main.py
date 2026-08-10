from fastapi import Depends, FastAPI
from sqlmodel import Session, select

from .database import get_session, init_db
from .models import Item

app = FastAPI(title="Kitchen Manager")


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/items", response_model=list[Item])
def list_items(session: Session = Depends(get_session)):
    return session.exec(select(Item)).all()


@app.post("/items", response_model=Item)
def create_item(item: Item, session: Session = Depends(get_session)):
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.delete("/items/{item_id}")
def delete_item(item_id: int, session: Session = Depends(get_session)):
    item = session.get(Item, item_id)
    session.delete(item)
    session.commit()
    return {"deleted": item_id}
