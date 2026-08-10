from datetime import date
from typing import Optional

from sqlmodel import Field, SQLModel


class Item(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    quantity: int = 1
    unit: Optional[str] = None
    category: Optional[str] = None
    expiry_date: Optional[date] = None
