import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["USE_MOCK_AI"] = "true"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        test_client.post("/api/demo/reset")
        yield test_client
