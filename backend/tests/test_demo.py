def test_reset_is_deterministic_and_clears_findings(client):
    client.post("/api/patients/maya-thompson/review")
    assert client.get("/api/findings").json()
    first = client.post("/api/demo/reset").json()
    second = client.post("/api/demo/reset").json()
    assert first["patients_loaded"] == second["patients_loaded"] == 3
    assert client.get("/api/findings").json() == []
