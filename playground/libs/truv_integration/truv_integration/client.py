"""Truv API client — ported from the Node reference implementation at
/Users/brian/demo-apps/server/truv.js. Same method surface, same normalized
response shape, same sandbox-account conventions for deposit_switch/pll — just
requests + Django instead of node-fetch + Express.
"""
import time
import uuid
from dataclasses import dataclass
from typing import Any

import requests

from .models import ApiCallLog
from .services import get_active_credential_set


class TruvNotConfigured(Exception):
    """Raised when TruvClient.for_active() is called with no active TruvCredentialSet."""


@dataclass
class TruvResponse:
    status_code: int
    data: dict
    duration_ms: float
    request_body: dict | None
    retry_after: str | None

    @property
    def ok(self) -> bool:
        return 200 <= self.status_code < 300


class TruvClient:
    def __init__(self, client_id: str, secret: str, base_url: str, environment: str = ""):
        self.client_id = client_id
        self.secret = secret
        self.base_url = base_url.rstrip("/") + "/"
        self.environment = environment
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Access-Client-Id": client_id,
            "X-Access-Secret": secret,
        })

    @classmethod
    def for_active(cls) -> "TruvClient":
        cred = get_active_credential_set()
        if cred is None:
            raise TruvNotConfigured(
                "No active Truv credential set. Add one and activate it from Settings."
            )
        return cls(cred.client_id, cred.secret, cred.base_url, environment=cred.environment)

    # --- Core HTTP helper -------------------------------------------------

    def _request(self, method: str, endpoint: str, json: dict | None = None) -> TruvResponse:
        url = self.base_url + endpoint
        start = time.perf_counter()
        response = self.session.request(method, url, json=json)
        duration_ms = round((time.perf_counter() - start) * 1000, 1)

        try:
            data = response.json() if response.content else {}
        except ValueError:
            data = {"raw": response.text}

        ApiCallLog.objects.create(
            truv_user_id=(json or {}).get("external_user_id", "") if json else "",
            method=method.upper(),
            endpoint=endpoint,
            request_body=json,
            response_body=data,
            status_code=response.status_code,
            duration_ms=duration_ms,
            environment=self.environment,
        )

        return TruvResponse(
            status_code=response.status_code,
            data=data,
            duration_ms=duration_ms,
            request_body=json,
            retry_after=response.headers.get("retry-after"),
        )

    def _request_pdf(self, endpoint: str) -> tuple[int, bytes]:
        """Truv's report endpoints (VOIE/VOA `.../reports/{id}/`) return either
        a JSON body or, with `?fmt=pdf`, the actual PDF bytes directly — not a
        JSON wrapper with a download link. That's a different response shape
        than every other endpoint here, so it gets its own request path rather
        than overloading `_request`, which always calls `response.json()`."""
        url = self.base_url + endpoint
        start = time.perf_counter()
        response = self.session.request("GET", url, headers={"Accept": "application/pdf"})
        duration_ms = round((time.perf_counter() - start) * 1000, 1)

        ApiCallLog.objects.create(
            truv_user_id="",
            method="GET",
            endpoint=endpoint,
            request_body=None,
            response_body={"binary": True, "content_type": response.headers.get("content-type", ""), "size": len(response.content)},
            status_code=response.status_code,
            duration_ms=duration_ms,
            environment=self.environment,
        )
        return response.status_code, response.content

    # --- Users / tokens ----------------------------------------------------

    def create_user(self, **overrides: Any) -> TruvResponse:
        payload = {
            "external_user_id": f"demo-{uuid.uuid4()}",
            "first_name": "John",
            "last_name": "Johnson",
            "email": "j.johnson@example.com",
            **overrides,
        }
        return self._request("POST", "users/", json=payload)

    def create_user_bridge_token(self, user_id: str, product_type: str, *, data_sources=None,
                                  company_mapping_id=None, provider_id=None, account=None) -> TruvResponse:
        payload = {
            "product_type": product_type,
            "client_name": "Truv Mortgage Demo",
            "tracking_info": "mortgage-demo",
        }
        if data_sources:
            payload["data_sources"] = data_sources
        if company_mapping_id:
            payload["company_mapping_id"] = company_mapping_id
        if provider_id:
            payload["provider_id"] = provider_id
        if product_type in ("deposit_switch", "pll"):
            payload["account"] = account or {
                "account_number": "16002600",
                "account_type": "checking",
                "routing_number": "12345678",
                "bank_name": "Truv Bank",
            }
            if product_type == "pll":
                payload["account"].setdefault("deposit_type", "amount")
                payload["account"].setdefault("deposit_value", 100)
        return self._request("POST", f"users/{user_id}/tokens/", json=payload)

    # --- Company / provider search ------------------------------------------

    def search_providers(self, query: str | None = None, product_type: str | None = None,
                          data_source: str | None = None) -> TruvResponse:
        params = []
        if query:
            params.append(f"query={requests.utils.quote(query)}")
        if product_type:
            params.append(f"product_type={product_type}")
        if data_source:
            params.append(f"data_source={data_source}")
        return self._request("GET", f"providers/?{'&'.join(params)}")

    def search_companies(self, query: str, product_type: str | None = None) -> TruvResponse:
        params = [f"query={requests.utils.quote(query)}"]
        if product_type:
            params.append(f"product_type={product_type}")
        return self._request("GET", f"company-mappings-search/?{'&'.join(params)}")

    def get_company_info(self, company_mapping_id: str, product_type: str | None = None) -> TruvResponse:
        suffix = f"?product_type={product_type}" if product_type else ""
        return self._request("GET", f"companies/{company_mapping_id}{suffix}")

    def lookup_company(self, **fields: Any) -> TruvResponse:
        body = {k: v for k, v in fields.items() if v is not None}
        return self._request("POST", "companies/", json=body)

    # --- Orders --------------------------------------------------------------

    def create_order(self, **params: Any) -> TruvResponse:
        products = params.get("products") or [params.get("product_type", "income")]
        payload = {
            "order_number": params.get("order_number") or f"demo-{uuid.uuid4()}",
            "external_user_id": params.get("external_user_id") or f"demo-{uuid.uuid4()}",
            "first_name": params.get("first_name", "John"),
            "last_name": params.get("last_name", "Johnson"),
            "products": products,
        }
        for key in ("email", "phone", "template_id", "loan", "source", "notification_settings", "cc_emails"):
            if params.get(key):
                payload[key] = params[key]
        if params.get("ssn"):
            payload["social_security_number"] = params["ssn"]

        if params.get("employers"):
            employers = list(params["employers"])
        elif params.get("company_mapping_id"):
            employers = [{"company_mapping_id": params["company_mapping_id"]}]
        elif params.get("employer_name") and "assets" not in products:
            employers = [{"company_name": params["employer_name"]}]
        else:
            employers = []

        # Confirmed via orders_create's schema: there is no top-level
        # `data_sources` field on an order — only `employers[].data_sources`.
        # A top-level `data_sources` is silently dropped by Truv (never
        # echoed back, no validation error for any value), so it's attached
        # to the employer entry here instead — creating a bare one if the
        # caller didn't otherwise deeplink an employer.
        if params.get("data_sources"):
            if not employers:
                employers = [{}]
            employers[0] = {**employers[0], "data_sources": params["data_sources"]}

        if employers:
            payload["employers"] = employers

        if params.get("financial_institutions"):
            payload["financial_institutions"] = params["financial_institutions"]
        elif "assets" in products and (params.get("provider_id") or params.get("employer_name")):
            fi = {}
            if params.get("provider_id"):
                fi["id"] = params["provider_id"]
            if params.get("employer_name"):
                fi["name"] = params["employer_name"]
            payload["financial_institutions"] = [fi]

        if params.get("reports"):
            payload["reports"] = params["reports"]

        return self._request("POST", "orders/", json=payload)

    def get_order(self, truv_order_id: str) -> TruvResponse:
        return self._request("GET", f"orders/{truv_order_id}/")

    def get_order_invoice(self, truv_order_id: str) -> TruvResponse:
        return self._request("GET", f"orders/{truv_order_id}/invoice/")

    def refresh_order(self, truv_order_id: str) -> TruvResponse:
        return self._request("POST", f"orders/{truv_order_id}/refresh/")

    def update_order(self, truv_order_id: str, **fields: Any) -> TruvResponse:
        """PATCH /v1/orders/{id}/ — confirmed via docs.truv.com/api-reference/
        orders/orders_partial_update. Accepts first_name, last_name, ssn,
        refresh_approved, loan (object), notes, notification_settings.
        Per Truv's docs this only succeeds "if all employers [are] in one of
        statuses: pending, sent" — i.e. it may reject updates (including a
        funding_date) against an already-completed order. Callers should
        check `.ok` and surface the real rejection rather than assume success."""
        return self._request("PATCH", f"orders/{truv_order_id}/", json=fields)

    def get_link_liabilities(self, link_id: str) -> TruvResponse:
        """GET /v1/links/{link_id}/liabilities/ — credit cards/loans/mortgages
        for an existing financial-account connection. Not a standalone Orders
        product; requires a link_id from a completed assets/financial_accounts
        connection (confirmed via docs.truv.com/api-reference/liabilities/link_liabilities)."""
        return self._request("GET", f"links/{link_id}/liabilities/")

    # --- Webhooks --------------------------------------------------------------

    def list_webhooks(self) -> TruvResponse:
        return self._request("GET", "webhooks/")

    def create_webhook(self, **params: Any) -> TruvResponse:
        return self._request("POST", "webhooks/", json=params)

    def delete_webhook(self, webhook_id: str) -> TruvResponse:
        return self._request("DELETE", f"webhooks/{webhook_id}/")

    # --- Token exchange / reports --------------------------------------------

    def get_access_token(self, public_token: str) -> TruvResponse:
        return self._request("POST", "link-access-tokens/", json={"public_token": public_token})

    def get_link_report(self, link_id: str, report_type: str) -> TruvResponse:
        return self._request("GET", f"links/{link_id}/{report_type}/report/")

    def create_voie_report(self, user_id: str, is_voe: bool = False) -> TruvResponse:
        return self._request("POST", f"users/{user_id}/reports/", json={"is_voe": is_voe})

    def get_voie_report(self, user_id: str, report_id: str) -> TruvResponse:
        return self._request("GET", f"users/{user_id}/reports/{report_id}/")

    def get_voie_report_pdf(self, user_id: str, report_id: str) -> tuple[int, bytes]:
        """The actual downloadable Verification of Income/Employment report
        PDF — see get_assets_report_pdf for why this needs its own request
        path instead of `_request`."""
        return self._request_pdf(f"users/{user_id}/reports/{report_id}/?fmt=pdf")

    def create_assets_report(self, user_id: str) -> TruvResponse:
        return self._request("POST", f"users/{user_id}/assets/reports/")

    def get_assets_report(self, user_id: str, report_id: str) -> TruvResponse:
        return self._request("GET", f"users/{user_id}/assets/reports/{report_id}/")

    def get_assets_report_pdf(self, user_id: str, report_id: str) -> tuple[int, bytes]:
        """The actual downloadable Verification of Assets report PDF — per
        docs.truv.com/mortgage/testing/sample-reports, an Orders implementation
        gets `voa_report_id` from `orders/{id}/`, then fetches the PDF from
        here. This is NOT the same as `financial_accounts[].pdf_report` in the
        raw order response, which is consistently null for standard Orders
        products in sandbox testing — this dedicated report endpoint is the
        reliable source for a real verification report PDF."""
        return self._request_pdf(f"users/{user_id}/assets/reports/{report_id}/?fmt=pdf")

    def create_income_insights_report(self, user_id: str) -> TruvResponse:
        return self._request("POST", f"users/{user_id}/income_insights/reports/", json={
            "days_requested": 60,
            "consumer_report_permissible_purpose": "EXTENSION_OF_CREDIT",
        })

    def get_income_insights_report(self, user_id: str, report_id: str) -> TruvResponse:
        return self._request("GET", f"users/{user_id}/income_insights/reports/{report_id}/")

    def get_deposit_switch_report(self, user_id: str) -> TruvResponse:
        return self._request("GET", f"users/{user_id}/deposit_switch/report/")

    # --- Document Collections (AIM Check) ------------------------------------

    def create_document_collection(self, documents: list[dict]) -> TruvResponse:
        return self._request("POST", "documents/collections/", json={"documents": documents})

    def get_document_collection(self, collection_id: str) -> TruvResponse:
        return self._request("GET", f"documents/collections/{collection_id}/")

    def finalize_collection(self, collection_id: str, product_type: str = "income") -> TruvResponse:
        return self._request("POST", f"documents/collections/{collection_id}/finalize/", json={"product_type": product_type})

    def get_link_income_report(self, link_id: str) -> TruvResponse:
        return self._request("GET", f"links/{link_id}/income/report/")

    def get_finalization_results(self, collection_id: str) -> TruvResponse:
        return self._request("GET", f"documents/collections/{collection_id}/finalize/")
