#!/usr/bin/env python3
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


BASE = os.environ.get("PANDAWIKI_E2E_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
ADMIN_PASSWORD = os.environ.get("PANDAWIKI_E2E_ADMIN_PASSWORD", "PandaWiki_E2E_123456")


class Client:
    def __init__(self, base):
        self.base = base
        self.token = None

    def request(self, method, path, data=None, query=None, headers=None, expect_success=True):
        payload = self.raw_request(method, path, data=data, query=query, headers=headers)
        if expect_success and payload.get("success") is False:
            raise AssertionError(f"{method} {self.base + path} returned failure: {payload}")
        return payload.get("data"), payload

    def raw_request(self, method, path, data=None, query=None, headers=None):
        status, resp_headers, raw = self.raw_http(method, path, data=data, query=query, headers=headers)
        if status >= 400:
            raise AssertionError(f"{method} {self.base + path} failed: HTTP {status}: {raw}")
        return json.loads(raw) if raw else {}

    def raw_http(self, method, path, data=None, query=None, headers=None):
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
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read().decode()
                return resp.status, dict(resp.headers), raw
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode()
            return exc.code, dict(exc.headers), raw
        except Exception as exc:
            raise AssertionError(f"{method} {url} failed: {exc}") from exc


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


def _fnv1a32(text):
    h = 2166136261
    for b in text.encode():
        h ^= b
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def _prng(seed, length):
    state = _fnv1a32(seed)
    chunks = []
    while sum(len(x) for x in chunks) < length:
        state ^= (state << 13) & 0xFFFFFFFF
        state &= 0xFFFFFFFF
        state ^= state >> 17
        state &= 0xFFFFFFFF
        state ^= (state << 5) & 0xFFFFFFFF
        state &= 0xFFFFFFFF
        chunks.append(f"{state:08x}")
    return "".join(chunks)[:length]


def _solve_cap_challenge(token, challenge):
    count = int(challenge["c"])
    size = int(challenge["s"])
    difficulty = int(challenge["d"])
    solutions = []
    for i in range(count):
        base = f"{token}{i + 1}"
        target = _prng(base + "d", difficulty)
        salt = _prng(base, size)
        nonce = 0
        while True:
            digest = hashlib.sha256(f"{salt}{nonce}".encode()).hexdigest()
            if digest.startswith(target):
                solutions.append(nonce)
                break
            nonce += 1
    return solutions


def captcha_token(client, kb_id):
    challenge = client.raw_request(
        "POST",
        "/share/v1/captcha/challenge",
        headers={"X-KB-ID": kb_id},
    )
    solutions = _solve_cap_challenge(challenge["token"], challenge["challenge"])
    redeemed = client.raw_request(
        "POST",
        "/share/v1/captcha/redeem",
        {"token": challenge["token"], "solutions": solutions},
        headers={"X-KB-ID": kb_id},
    )
    assert redeemed.get("success") is True and redeemed.get("token"), redeemed
    return redeemed["token"]


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
        limitation = data.get("limitation") or {}
        for flag in [
            "allow_admin_perm",
            "allow_custom_copyright",
            "allow_comment_audit",
            "allow_advanced_bot",
            "allow_watermark",
            "allow_copy_protection",
            "allow_open_ai_bot_settings",
            "allow_mcp_server",
            "allow_node_stats",
            "allow_doc_history",
            "allow_contribution",
            "allow_visitor_permission_control",
        ]:
            assert limitation.get(flag) is True, (flag, limitation)

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

    def app_paid_feature_settings():
        web_app, _ = c.request("GET", "/api/v1/app/detail", query={"kb_id": state["kb1"], "type": 1})
        web_settings = web_app.get("settings") or {}
        web_settings.update(
            {
                "watermark_setting": "visible",
                "watermark_content": "E2E Watermark",
                "copy_setting": "append",
                "contribute_settings": {"is_enable": True},
            }
        )
        c.request("PUT", "/api/v1/app", {"kb_id": state["kb1"], "settings": web_settings}, query={"id": web_app["id"]})
        web_app, _ = c.request("GET", "/api/v1/app/detail", query={"kb_id": state["kb1"], "type": 1})
        settings = web_app.get("settings") or {}
        assert settings.get("watermark_setting") == "visible", settings
        assert settings.get("watermark_content") == "E2E Watermark", settings
        assert settings.get("copy_setting") == "append", settings
        assert settings.get("contribute_settings", {}).get("is_enable") is True, settings

        openai_app, _ = c.request("GET", "/api/v1/app/detail", query={"kb_id": state["kb1"], "type": 9})
        openai_settings = openai_app.get("settings") or {}
        openai_settings["openai_api_bot_settings"] = {"is_enabled": True, "secret_key": "e2e-openai-secret"}
        c.request("PUT", "/api/v1/app", {"kb_id": state["kb1"], "settings": openai_settings}, query={"id": openai_app["id"]})
        openai_app, _ = c.request("GET", "/api/v1/app/detail", query={"kb_id": state["kb1"], "type": 9})
        assert openai_app.get("settings", {}).get("openai_api_bot_settings", {}).get("is_enabled") is True, openai_app

        mcp_app, _ = c.request("GET", "/api/v1/app/detail", query={"kb_id": state["kb1"], "type": 12})
        mcp_settings = mcp_app.get("settings") or {}
        mcp_settings["mcp_server_settings"] = {
            "is_enabled": True,
            "docs_tool_settings": {"name": "e2e_get_docs", "desc": "E2E docs retrieval"},
            "sample_auth": {"enabled": True, "password": "e2e-mcp-pass"},
        }
        c.request("PUT", "/api/v1/app", {"kb_id": state["kb1"], "settings": mcp_settings}, query={"id": mcp_app["id"]})
        mcp_app, _ = c.request("GET", "/api/v1/app/detail", query={"kb_id": state["kb1"], "type": 12})
        assert mcp_app.get("settings", {}).get("mcp_server_settings", {}).get("is_enabled") is True, mcp_app

    def node_release_history():
        c.request(
            "POST",
            "/api/v1/knowledge_base/release",
            {
                "kb_id": state["kb1"],
                "tag": "e2e-v1",
                "message": "E2E first release",
                "node_ids": [state["node_id"]],
            },
        )
        releases, _ = c.request(
            "GET",
            "/api/pro/v1/node/release/list",
            query={"kb_id": state["kb1"], "node_id": state["node_id"]},
        )
        assert len(releases) >= 1, releases
        release = releases[0]
        assert release.get("release_name") == "e2e-v1", release
        detail, _ = c.request(
            "GET",
            "/api/pro/v1/node/release/detail",
            query={"kb_id": state["kb1"], "id": release["id"]},
        )
        assert "# e2e doc" in detail.get("content", ""), detail
        state["release_id"] = release["id"]

    def node_release_restore():
        c.request(
            "PUT",
            "/api/v1/node/detail",
            {"id": state["node_id"], "kb_id": state["kb1"], "content": "# E2E changed draft\n"},
        )
        changed, _ = c.request("GET", "/api/v1/node/detail", query={"kb_id": state["kb1"], "id": state["node_id"], "format": "raw"})
        assert "E2E changed draft" in changed.get("content", ""), changed
        restored, _ = c.request(
            "POST",
            "/api/pro/v1/node/release/restore",
            {"kb_id": state["kb1"], "id": state["release_id"]},
        )
        assert restored.get("node_id") == state["node_id"], restored
        node, _ = c.request("GET", "/api/v1/node/detail", query={"kb_id": state["kb1"], "id": state["node_id"], "format": "raw"})
        assert "# e2e doc" in node.get("content", ""), node
        assert "E2E changed draft" not in node.get("content", ""), node

    def openai_api_compatibility():
        status, headers, _ = c.raw_http(
            "OPTIONS",
            "/share/v1/chat/completions",
            headers={"X-KB-ID": state["kb1"]},
        )
        assert status == 200, status
        assert "Authorization" in headers.get("Access-Control-Allow-Headers", ""), headers
        payload = {"model": "pandawiki", "messages": [{"role": "user", "content": "hello"}]}
        status, _, raw = c.raw_http(
            "POST",
            "/share/v1/chat/completions",
            payload,
            headers={"X-KB-ID": state["kb1"], "Authorization": ""},
        )
        assert status == 401, (status, raw)
        data = json.loads(raw)
        assert data.get("error", {}).get("type") == "invalid_request_error", data
        status, _, raw = c.raw_http(
            "POST",
            "/share/v1/chat/completions",
            payload,
            headers={"X-KB-ID": state["kb1"], "Authorization": "Bearer wrong-secret"},
        )
        assert status == 401, (status, raw)
        data = json.loads(raw)
        assert data.get("error", {}).get("type") == "unauthorized", data

    def mcp_server_jsonrpc():
        req = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
        status, _, raw = c.raw_http("POST", "/mcp", req, query={"kb_id": state["kb1"]})
        assert status == 401, (status, raw)
        data = json.loads(raw)
        assert data.get("error", {}).get("code") == -32001, data

        status, _, raw = c.raw_http(
            "POST",
            "/mcp",
            req,
            query={"kb_id": state["kb1"]},
            headers={"Authorization": "Bearer e2e-mcp-pass"},
        )
        assert status == 200, (status, raw)
        data = json.loads(raw)
        tools = data.get("result", {}).get("tools", [])
        assert tools and tools[0]["name"] == "e2e_get_docs", data

        call_req = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "e2e_get_docs", "arguments": {"query": "e2e doc", "limit": 3}},
        }
        status, _, raw = c.raw_http(
            "POST",
            "/mcp",
            call_req,
            query={"kb_id": state["kb1"]},
            headers={"Authorization": "Bearer e2e-mcp-pass"},
        )
        assert status == 200, (status, raw)
        data = json.loads(raw)
        text = data.get("result", {}).get("content", [{}])[0].get("text", "")
        assert "e2e doc" in text.lower() or "e2e-doc" in text.lower(), data

    def visitor_permission_control():
        c.request(
            "PATCH",
            "/api/v1/node/permission/edit",
            {
                "kb_id": state["kb1"],
                "ids": [state["node_id"]],
                "permissions": {
                    "answerable": "partial",
                    "visitable": "partial",
                    "visible": "partial",
                },
                "answerable_groups": [],
                "visitable_groups": [],
                "visible_groups": [],
            },
        )
        data, _ = c.request(
            "GET",
            "/api/v1/node/permission",
            query={"kb_id": state["kb1"], "id": state["node_id"]},
        )
        assert data.get("permissions", {}).get("answerable") == "partial", data
        assert data.get("permissions", {}).get("visitable") == "partial", data
        assert data.get("permissions", {}).get("visible") == "partial", data

    def contribution_workflow():
        token = captcha_token(c, state["kb1"])
        add_resp, _ = c.request(
            "POST",
            "/share/pro/v1/contribute/submit",
            {
                "captcha_token": token,
                "type": "add",
                "name": "e2e-contrib-add",
                "content": "# E2E contribution add\n",
                "content_type": "md",
                "emoji": "??",
                "reason": "E2E add contribution",
            },
            headers={"X-KB-ID": state["kb1"]},
        )
        add_id = add_resp["id"]
        listing, _ = c.request(
            "GET",
            "/api/pro/v1/contribute/list",
            query={"kb_id": state["kb1"], "page": 1, "per_page": 20, "node_name": "e2e-contrib-add"},
        )
        item = next((x for x in listing.get("list", []) if x["id"] == add_id), None)
        assert item and item["status"] == "pending" and item.get("ip_address"), listing
        detail, _ = c.request("GET", "/api/pro/v1/contribute/detail", query={"kb_id": state["kb1"], "id": add_id})
        assert detail["content"].startswith("# E2E contribution add"), detail
        audit, _ = c.request(
            "POST",
            "/api/pro/v1/contribute/audit",
            {"id": add_id, "kb_id": state["kb1"], "nav_id": state["nav_id"], "status": "approved"},
        )
        assert audit.get("node_id"), audit
        nodes, _ = c.request("GET", "/api/v1/node/list", query={"kb_id": state["kb1"], "nav_id": state["nav_id"], "search": "e2e-contrib-add"})
        assert any(n["id"] == audit["node_id"] for n in nodes), nodes

        token = captcha_token(c, state["kb1"])
        edit_resp, _ = c.request(
            "POST",
            "/share/pro/v1/contribute/submit",
            {
                "captcha_token": token,
                "type": "edit",
                "node_id": state["node_id"],
                "name": "e2e-doc-edited-by-contrib",
                "content": "# E2E contribution edit\n",
                "content_type": "md",
                "emoji": "??",
                "reason": "E2E edit contribution",
            },
            headers={"X-KB-ID": state["kb1"]},
        )
        edit_id = edit_resp["id"]
        edit_detail, _ = c.request("GET", "/api/pro/v1/contribute/detail", query={"kb_id": state["kb1"], "id": edit_id})
        assert edit_detail.get("original_node", {}).get("id") == state["node_id"], edit_detail
        c.request(
            "POST",
            "/api/pro/v1/contribute/audit",
            {"id": edit_id, "kb_id": state["kb1"], "nav_id": state["nav_id"], "status": "approved"},
        )
        node, _ = c.request("GET", "/api/v1/node/detail", query={"kb_id": state["kb1"], "id": state["node_id"], "format": "raw"})
        assert node["name"] == "e2e-doc-edited-by-contrib", node
        assert "E2E contribution edit" in node["content"], node

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
        ("paid app settings: watermark/copy/openai/mcp/contribution", app_paid_feature_settings),
        ("document release history endpoints", node_release_history),
        ("document release restore workflow", node_release_restore),
        ("OpenAI API compatibility guards", openai_api_compatibility),
        ("MCP Server JSON-RPC tools", mcp_server_jsonrpc),
        ("visitor permission control partial ACL", visitor_permission_control),
        ("contribution submit/list/detail/audit workflow", contribution_workflow),
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
