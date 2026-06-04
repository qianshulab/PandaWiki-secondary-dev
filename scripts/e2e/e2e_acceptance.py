#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.parse
import urllib.request


BASE = os.environ.get("PANDAWIKI_E2E_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
ADMIN_PASSWORD = os.environ.get("PANDAWIKI_E2E_ADMIN_PASSWORD", "PandaWiki_E2E_123456")


class Client:
    def __init__(self, base):
        self.base = base
        self.token = None

    def request(self, method, path, data=None, query=None, headers=None, expect_success=True):
        url = self.base + path
        if query:
            url += "?" + urllib.parse.urlencode(query, doseq=True)
        body = None
        req_headers = {"Content-Type": "application/json"}
        if self.token:
            req_headers["Authorization"] = "Bearer " + self.token
        if headers:
            req_headers.update(headers)
        if data is not None:
            body = json.dumps(data).encode()
        req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode()
                payload = json.loads(raw) if raw else {}
        except Exception as exc:
            raise AssertionError(f"{method} {url} failed: {exc}") from exc
        if expect_success and payload.get("success") is False:
            raise AssertionError(f"{method} {url} returned failure: {payload}")
        return payload.get("data"), payload


def wait_api(client):
    deadline = time.time() + 120
    last = None
    while time.time() < deadline:
        try:
            client.request(
                "POST",
                "/api/v1/user/login",
                {"account": "admin", "password": ADMIN_PASSWORD},
            )
            return
        except Exception as exc:
            last = exc
            time.sleep(2)
    raise AssertionError(f"API did not become ready: {last}")


def main():
    c = Client(BASE)
    wait_api(c)

    data, _ = c.request(
        "POST",
        "/api/v1/user/login",
        {"account": "admin", "password": ADMIN_PASSWORD},
    )
    c.token = data["token"]

    results = []

    def check(name, fn):
        started = time.time()
        fn()
        results.append({"name": name, "status": "PASS", "elapsed_ms": int((time.time() - started) * 1000)})
        print(f"[PASS] {name}", flush=True)

    def create_user(account, role="user"):
        data, _ = c.request(
            "POST",
            "/api/v1/user/create",
            {"account": account, "password": ADMIN_PASSWORD, "role": role},
        )
        return data["id"]

    state = {}

    def license_policy():
        data, _ = c.request("GET", "/api/v1/license")
        assert data["edition"] == 1, data
        assert data["state"] == 1, data

    def users_over_free_limit():
        state["normal_user_id"] = create_user("e2e-normal-user", "user")
        state["admin_user_1"] = create_user("e2e-admin-1", "admin")
        state["admin_user_2"] = create_user("e2e-admin-2", "admin")
        users, _ = c.request("GET", "/api/v1/user/list")
        assert len(users["users"]) >= 4, users

    def create_kb(name, port):
        data, _ = c.request(
            "POST",
            "/api/v1/knowledge_base",
            {"name": name, "hosts": [f"{name}.local"], "ports": [port]},
        )
        return data["id"]

    def kb_over_free_limit_and_admin_perm():
        state["kb1"] = create_kb("e2e-kb-1", 18081)
        state["kb2"] = create_kb("e2e-kb-2", 18082)
        kbs, _ = c.request("GET", "/api/v1/knowledge_base/list")
        assert len(kbs) >= 2, kbs
        c.request(
            "POST",
            "/api/v1/knowledge_base/user/invite",
            {
                "kb_id": state["kb1"],
                "user_id": state["normal_user_id"],
                "perm": "doc_manage",
            },
        )

    def nodes_over_300_limit():
        navs, _ = c.request("GET", "/api/v1/nav/list", query={"kb_id": state["kb1"]})
        assert navs, navs
        nav_id = navs[0]["id"]
        state["nav_id"] = nav_id
        last_id = None
        for i in range(301):
            data, _ = c.request(
                "POST",
                "/api/v1/node",
                {
                    "kb_id": state["kb1"],
                    "nav_id": nav_id,
                    "type": 2,
                    "name": f"e2e-doc-{i:03d}",
                    "content": f"# e2e doc {i}\n",
                    "content_type": "md",
                },
            )
            last_id = data["id"]
        state["node_id"] = last_id
        nodes, _ = c.request("GET", "/api/v1/node/list", query={"kb_id": state["kb1"], "nav_id": nav_id})
        assert len(nodes) >= 301, len(nodes)

    def prompt_get_put():
        payload = {
            "kb_id": state["kb1"],
            "content": "E2E custom prompt",
            "summary_content": "E2E summary prompt",
            "enable_preset": False,
            "enable_preset_auto_language": True,
            "enable_preset_general_info": True,
            "enable_preset_reference": True,
        }
        c.request("PUT", "/api/pro/v1/prompt", payload)
        data, _ = c.request("GET", "/api/pro/v1/prompt", query={"kb_id": state["kb1"]})
        assert data["content"] == payload["content"], data
        assert data["summary_content"] == payload["summary_content"], data

    def block_words_get_post():
        c.request("POST", "/api/pro/v1/block", {"kb_id": state["kb1"], "block_words": ["secret-e2e", "内部"]})
        data, _ = c.request("GET", "/api/pro/v1/block", query={"kb_id": state["kb1"]})
        assert "secret-e2e" in data["words"], data

    def api_token_crud():
        c.request(
            "POST",
            "/api/pro/v1/token/create",
            {"kb_id": state["kb1"], "name": "e2e-token", "permission": "doc_manage"},
        )
        tokens, _ = c.request("GET", "/api/pro/v1/token/list", query={"kb_id": state["kb1"]})
        token = next((t for t in tokens if t["name"] == "e2e-token"), None)
        assert token and token["token"].startswith("pw_"), tokens
        c.request(
            "PATCH",
            "/api/pro/v1/token/update",
            {"kb_id": state["kb1"], "id": token["id"], "permission": "data_operate"},
        )
        tokens, _ = c.request("GET", "/api/pro/v1/token/list", query={"kb_id": state["kb1"]})
        token = next(t for t in tokens if t["id"] == token["id"])
        assert token["permission"] == "data_operate", token
        c.request("DELETE", "/api/pro/v1/token/delete", query={"kb_id": state["kb1"], "id": token["id"]})
        tokens, _ = c.request("GET", "/api/pro/v1/token/list", query={"kb_id": state["kb1"]})
        assert not any(t["id"] == token["id"] for t in tokens), tokens

    def comment_moderate():
        c.request("POST", "/api/pro/v1/comment_moderate", {"ids": ["e2e-missing-comment"], "status": 1})

    def stat_day_7():
        data, _ = c.request("GET", "/api/v1/stat/count", query={"kb_id": state["kb1"], "day": 7})
        assert "page_visit_count" in data, data

    checks = [
        ("license/feature_policy", license_policy),
        ("users over free admin limit", users_over_free_limit),
        ("knowledge bases over free limit + admin permission split", kb_over_free_limit_and_admin_perm),
        ("nodes over 300 free limit", nodes_over_300_limit),
        ("custom prompt get/put", prompt_get_put),
        ("block words get/post", block_words_get_post),
        ("api token CRUD", api_token_crud),
        ("comment moderate endpoint", comment_moderate),
        ("7-day statistics permission", stat_day_7),
    ]

    failures = []
    for name, fn in checks:
        try:
            check(name, fn)
        except Exception as exc:
            failures.append({"name": name, "status": "FAIL", "error": str(exc)})
            print(f"[FAIL] {name}: {exc}", flush=True)

    report = {
        "base_url": BASE,
        "passed": len(results),
        "failed": len(failures),
        "results": results + failures,
    }
    os.makedirs("reports", exist_ok=True)
    with open("reports/e2e-first-stage-report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    if failures:
        raise SystemExit(1)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
