from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

CURRENCIES = ("USD", "EUR", "GBP", "INR", "CAD", "AUD")
MAX_CENTS = 100_000_000


class MeIn(BaseModel):
    display_name: str

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned or len(cleaned) > 40:
            raise ValueError("Name must be 1 to 40 characters")
        return cleaned


class MeOut(BaseModel):
    id: str
    display_name: str


class GroupIn(BaseModel):
    name: str
    kind: Literal["trip", "house"]
    currency: Literal["USD", "EUR", "GBP", "INR", "CAD", "AUD"] = "USD"

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned or len(cleaned) > 60:
            raise ValueError("Group name must be 1 to 60 characters")
        return cleaned


class JoinIn(BaseModel):
    code: str

    @field_validator("code")
    @classmethod
    def clean_code(cls, value: str) -> str:
        cleaned = value.strip().upper()
        if len(cleaned) != 6 or not cleaned.isalnum():
            raise ValueError("Enter the 6-character group code")
        return cleaned


class GroupSummary(BaseModel):
    id: str
    name: str
    kind: Literal["trip", "house"]
    currency: str
    invite_code: str
    member_count: int
    my_balance_cents: int


class MemberOut(BaseModel):
    id: str
    display_name: str
    balance_cents: int


class TransferOut(BaseModel):
    from_user_id: str
    from_name: str
    to_user_id: str
    to_name: str
    amount_cents: int


class ShareIn(BaseModel):
    user_id: str
    amount_cents: int | None = None
    shares: int | None = None


class ExpenseIn(BaseModel):
    description: str
    amount_cents: int = Field(gt=0, le=MAX_CENTS)
    payer_id: str
    split_type: Literal["equal", "exact", "shares"]
    participants: list[ShareIn] = Field(min_length=1)

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned or len(cleaned) > 80:
            raise ValueError("Description must be 1 to 80 characters")
        return cleaned


class ShareOut(BaseModel):
    user_id: str
    display_name: str
    amount_cents: int
    shares: int | None


class ExpenseActivity(BaseModel):
    type: Literal["expense"] = "expense"
    id: str
    description: str
    amount_cents: int
    payer_id: str
    payer_name: str
    split_type: Literal["equal", "exact", "shares"]
    shares: list[ShareOut]
    created_at: str


class SettlementIn(BaseModel):
    from_user_id: str
    to_user_id: str
    amount_cents: int = Field(gt=0, le=MAX_CENTS)


class SettlementActivity(BaseModel):
    type: Literal["settlement"] = "settlement"
    id: str
    from_user_id: str
    from_name: str
    to_user_id: str
    to_name: str
    amount_cents: int
    created_at: str


Activity = Annotated[ExpenseActivity | SettlementActivity, Field(discriminator="type")]


class GroupDetail(BaseModel):
    id: str
    name: str
    kind: Literal["trip", "house"]
    currency: str
    invite_code: str
    members: list[MemberOut]
    transfers: list[TransferOut]
    activity: list[Activity]
