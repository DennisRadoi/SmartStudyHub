import os
import sqlite3
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

os.environ["SMART_STUDY_HUB_SKIP_OLLAMA"] = "1"

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

import main


def signup_and_get_token(client, username, email, password, developer_code=None):
    payload = {"username": username, "email": email, "password": password}
    if developer_code:
        payload["developer_code"] = developer_code
    signup_response = client.post("/api/signup", json=payload)
    assert signup_response.status_code == 200
    login_response = client.post(
        "/api/login",
        json={"username": username, "password": password},
    )
    assert login_response.status_code == 200
    return login_response.json()["token"]


def insert_document(owner_id, filename, file_path="/tmp/doc.pdf"):
    conn = main.get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO documents (id, owner_id, filename, source, file_path, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)",
        (
            f"doc-{owner_id}-{filename}",
            owner_id,
            filename,
            filename,
            file_path,
            1.0,
        ),
    )
    conn.commit()
    conn.close()


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "auth.db"

    def get_test_db_connection():
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn

    monkeypatch.setattr(main, "get_db_connection", get_test_db_connection)
    main.init_auth_db()
    return TestClient(main.app)


def test_get_config(client):
    response = client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert data["chat_model"] == main.CHAT_MODEL
    assert data["generation_model"] == main.GENERATION_MODEL


def test_signup_login_me_flow(client):
    signup_payload = {
        "username": "alice",
        "email": "alice@example.com",
        "password": "pass123",
    }
    signup_response = client.post("/api/signup", json=signup_payload)
    assert signup_response.status_code == 200
    signup_data = signup_response.json()
    assert signup_data["user"]["username"] == "alice"

    login_response = client.post(
        "/api/login",
        json={"username": "alice", "password": "pass123"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["token"]

    me_response = client.get(
        "/api/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["user"]["username"] == "alice"


def test_login_rejects_invalid_password(client):
    client.post(
        "/api/signup",
        json={
            "username": "bob",
            "email": "bob@example.com",
            "password": "secret",
        },
    )

    response = client.post(
        "/api/login",
        json={"username": "bob", "password": "wrong"},
    )
    assert response.status_code == 401


def test_me_requires_auth(client):
    response = client.get("/api/me")
    assert response.status_code == 401


def test_logout_revokes_token(client):
    token = signup_and_get_token(client, "logout_user", "logout@example.com", "secret")

    logout_response = client.get(
        "/api/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert logout_response.status_code == 200

    me_response = client.get(
        "/api/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == 401


def test_signup_rejects_duplicate_username(client):
    client.post(
        "/api/signup",
        json={"username": "dup", "email": "dup1@example.com", "password": "pass"},
    )
    response = client.post(
        "/api/signup",
        json={"username": "dup", "email": "dup2@example.com", "password": "pass"},
    )
    assert response.status_code == 400


def test_admin_users_requires_developer(client):
    token = signup_and_get_token(client, "student", "student@example.com", "pass")
    response = client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


def test_admin_users_lists_all_for_developer(client):
    dev_token = signup_and_get_token(
        client, "dev", "dev@example.com", "pass", developer_code="dev2026"
    )
    signup_and_get_token(client, "student2", "student2@example.com", "pass")

    response = client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {dev_token}"},
    )
    assert response.status_code == 200
    usernames = [user["username"] for user in response.json()["users"]]
    assert "dev" in usernames
    assert "student2" in usernames


def test_courses_list_is_scoped_for_students(client):
    token_a = signup_and_get_token(client, "alice", "alice@courses.com", "pass")
    token_b = signup_and_get_token(client, "bob", "bob@courses.com", "pass")

    response_a = client.post(
        "/api/courses",
        json={"title": "Math", "description": "Algebra"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert response_a.status_code == 200

    response_b = client.post(
        "/api/courses",
        json={"title": "History", "description": "Ancient"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert response_b.status_code == 200

    list_a = client.get(
        "/api/courses",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert list_a.status_code == 200
    titles = [course["title"] for course in list_a.json()["courses"]]
    assert titles == ["Math"]


def test_courses_list_for_developer_includes_all(client):
    dev_token = signup_and_get_token(
        client, "dev2", "dev2@courses.com", "pass", developer_code="dev2026"
    )
    token_a = signup_and_get_token(client, "alice2", "alice2@courses.com", "pass")

    client.post(
        "/api/courses",
        json={"title": "Biology"},
        headers={"Authorization": f"Bearer {token_a}"},
    )

    list_dev = client.get(
        "/api/courses",
        headers={"Authorization": f"Bearer {dev_token}"},
    )
    assert list_dev.status_code == 200
    titles = [course["title"] for course in list_dev.json()["courses"]]
    assert "Biology" in titles


def test_course_delete_does_not_remove_others(client):
    token_a = signup_and_get_token(client, "owner", "owner@courses.com", "pass")
    token_b = signup_and_get_token(client, "other", "other@courses.com", "pass")

    create_response = client.post(
        "/api/courses",
        json={"title": "Physics"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    course_id = create_response.json()["id"]

    client.delete(
        f"/api/courses/{course_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )

    list_a = client.get(
        "/api/courses",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    titles = [course["title"] for course in list_a.json()["courses"]]
    assert "Physics" in titles


def test_dashboard_counts_are_scoped(client):
    token_a = signup_and_get_token(client, "dash", "dash@example.com", "pass")
    token_b = signup_and_get_token(client, "dash2", "dash2@example.com", "pass")

    me_response = client.get(
        "/api/me",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    user_id = me_response.json()["user"]["id"]

    me_other = client.get(
        "/api/me",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    other_id = me_other.json()["user"]["id"]

    insert_document(user_id, "doc1.pdf")
    insert_document(other_id, "doc2.pdf")

    conn = main.get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO quiz_attempts (id, user_id, filename, score, total_questions, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("attempt1", user_id, "doc1.pdf", 3, 5, 1.0),
    )
    cursor.execute(
        "INSERT INTO quiz_attempts (id, user_id, filename, score, total_questions, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("attempt2", other_id, "doc2.pdf", 4, 5, 1.0),
    )
    conn.commit()
    conn.close()

    dashboard = client.get(
        "/api/dashboard",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert dashboard.status_code == 200
    data = dashboard.json()
    assert data["studied_files"] == 1
    assert data["quiz_attempts"] == 1
    assert data["average_quiz_score"] == 60.0


def test_quiz_attempt_validation_and_success(client):
    token = signup_and_get_token(client, "quiz", "quiz@example.com", "pass")

    invalid_total = client.post(
        "/api/quiz-attempts",
        json={"filename": "doc.pdf", "score": 0, "total_questions": 0},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert invalid_total.status_code == 400

    invalid_score = client.post(
        "/api/quiz-attempts",
        json={"filename": "doc.pdf", "score": 3, "total_questions": 2},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert invalid_score.status_code == 400

    missing_doc = client.post(
        "/api/quiz-attempts",
        json={"filename": "doc.pdf", "score": 1, "total_questions": 2},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert missing_doc.status_code == 404

    me_response = client.get(
        "/api/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    user_id = me_response.json()["user"]["id"]
    insert_document(user_id, "doc.pdf")

    success = client.post(
        "/api/quiz-attempts",
        json={"filename": "doc.pdf", "score": 2, "total_questions": 3},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert success.status_code == 200
