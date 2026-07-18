from app.database import Base, SessionLocal, engine
from app.services.demo import DemoService


def main():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        print(DemoService(db).reset())


if __name__ == "__main__":
    main()
