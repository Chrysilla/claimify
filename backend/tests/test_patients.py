def test_lists_and_gets_demo_patients(client):
    patients = client.get("/api/patients").json()
    assert len(patients) == 3
    assert patients[0]["is_demo"] is True
    detail = client.get("/api/patients/maya-thompson")
    assert detail.status_code == 200
    assert detail.json()["name"] == "Maya Thompson"
    assert detail.json()["labs"]


def test_creates_and_updates_patient(client):
    created = client.post(
        "/api/patients",
        json={
            "name": "Jamie Example",
            "date_of_birth": "1988-04-02",
            "primary_condition": "Migraine",
            "payer": "Example Health",
            "workflow_status": "new",
            "risk_level": "low",
        },
    )
    assert created.status_code == 201
    patient_id = created.json()["id"]
    updated = client.patch(f"/api/patients/{patient_id}", json={"workflow_status": "review"})
    assert updated.json()["workflow_status"] == "review"


def test_not_found_uses_structured_error(client):
    response = client.get("/api/patients/missing")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "patient_not_found"
