def test_review_approval_edit_and_rejection(client):
    review = client.post("/api/patients/maya-thompson/review")
    assert review.status_code == 201
    finding = review.json()[0]
    assert finding["status"] == "pending"
    assert finding["evidence"][0]["source_id"] == "note-maya-2026-07-11"

    edited = client.patch(
        f"/api/findings/{finding['id']}", json={"recommended_action": "Add PT dates."}
    )
    assert edited.json()["recommended_action"] == "Add PT dates."
    approved = client.post(f"/api/findings/{finding['id']}/approve")
    assert approved.json()["status"] == "approved"

    other = client.post("/api/patients/elena-rodriguez/review").json()[0]
    rejected = client.post(
        f"/api/findings/{other['id']}/reject", json={"reason": "Coding team verified."}
    )
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["review_note"] == "Coding team verified."
