import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from backend.app.db import connect
from backend.app.schemas import (
    ExpenseIn,
    GroupDetail,
    GroupIn,
    GroupSummary,
    JoinIn,
    MeIn,
    MeOut,
    SettlementIn,
)
from backend.app.store import (
    add_expense,
    add_settlement,
    create_group,
    export_csv,
    get_user,
    group_detail,
    join_group,
    list_groups,
    require_user,
    upsert_user,
)

DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "app.db"


@asynccontextmanager
async def lifespan(app: FastAPI):
    with connect(app.state.db_path):
        pass
    yield


def create_app(db_path: Path | None = None) -> FastAPI:
    app = FastAPI(title="Split", lifespan=lifespan)
    app.state.db_path = db_path or DEFAULT_DB
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def get_conn(request: Request):
        conn = connect(request.app.state.db_path)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def current_user_id(x_user_id: str | None = Header(default=None, alias="X-User-Id")) -> str:
        if not x_user_id:
            raise HTTPException(status_code=401, detail="Missing X-User-Id")
        try:
            return str(uuid.UUID(x_user_id))
        except ValueError as error:
            raise HTTPException(status_code=400, detail="X-User-Id must be a UUID") from error

    @app.get("/me", response_model=MeOut)
    def read_me(user_id: str = Depends(current_user_id), conn=Depends(get_conn)):
        user = get_user(conn, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="Set your name to get started")
        return {"id": user["id"], "display_name": user["display_name"]}

    @app.put("/me", response_model=MeOut)
    def save_me(payload: MeIn, user_id: str = Depends(current_user_id), conn=Depends(get_conn)):
        upsert_user(conn, user_id, payload.display_name)
        return {"id": user_id, "display_name": payload.display_name}

    @app.get("/groups", response_model=list[GroupSummary])
    def read_groups(user_id: str = Depends(current_user_id), conn=Depends(get_conn)):
        require_user(conn, user_id)
        return list_groups(conn, user_id)

    @app.post("/groups", response_model=GroupSummary, status_code=201)
    def post_group(payload: GroupIn, user_id: str = Depends(current_user_id), conn=Depends(get_conn)):
        require_user(conn, user_id)
        group_id = create_group(conn, user_id, payload.name, payload.kind, payload.currency)
        return next(item for item in list_groups(conn, user_id) if item["id"] == group_id)

    @app.post("/groups/join", response_model=GroupSummary)
    def post_join(payload: JoinIn, user_id: str = Depends(current_user_id), conn=Depends(get_conn)):
        require_user(conn, user_id)
        group_id = join_group(conn, user_id, payload.code)
        return next(item for item in list_groups(conn, user_id) if item["id"] == group_id)

    @app.get("/groups/{group_id}", response_model=GroupDetail)
    def read_group(group_id: str, user_id: str = Depends(current_user_id), conn=Depends(get_conn)):
        require_user(conn, user_id)
        return group_detail(conn, group_id, user_id)

    @app.post("/groups/{group_id}/expenses", response_model=GroupDetail, status_code=201)
    def post_expense(
        group_id: str,
        payload: ExpenseIn,
        user_id: str = Depends(current_user_id),
        conn=Depends(get_conn),
    ):
        require_user(conn, user_id)
        return add_expense(conn, group_id, user_id, payload)

    @app.post("/groups/{group_id}/settlements", response_model=GroupDetail, status_code=201)
    def post_settlement(
        group_id: str,
        payload: SettlementIn,
        user_id: str = Depends(current_user_id),
        conn=Depends(get_conn),
    ):
        require_user(conn, user_id)
        return add_settlement(conn, group_id, user_id, payload)

    @app.get("/groups/{group_id}/export.csv")
    def read_export(group_id: str, user_id: str = Depends(current_user_id), conn=Depends(get_conn)):
        require_user(conn, user_id)
        csv_text, filename = export_csv(conn, group_id, user_id)
        return Response(
            content=csv_text,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return app


app = create_app()
