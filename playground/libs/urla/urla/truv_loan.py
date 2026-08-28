"""Builds and pushes Truv's real Orders API `loan` sub-object — confirmed
schema via docs.truv.com/api-reference/orders/object#loan-object:
loan_number, application_number, external_id, originator_name,
originator_email, loan_processor_name, loan_processor_email, funding_date.

Shared between POS (assigns loan officer / originator at intake) and LOS
(assigns processor, funds the loan) so both send/patch the exact same shape.
"""


def build_loan_object(application) -> dict | None:
    """Builds the `loan` object from this application's current
    LoanAndProperty fields. Returns None if there's nothing worth sending —
    callers should omit the `loan` key entirely rather than send `{}`."""
    loan = {}
    if application.loan_number:
        loan["loan_number"] = application.loan_number
    if application.application_number:
        loan["application_number"] = application.application_number
    loan["external_id"] = str(application.loan_uuid)

    loan_property = getattr(application, "loan_property", None)
    if loan_property:
        if loan_property.originator_name:
            loan["originator_name"] = loan_property.originator_name
        if loan_property.originator_email:
            loan["originator_email"] = loan_property.originator_email
        if loan_property.loan_processor_name:
            loan["loan_processor_name"] = loan_property.loan_processor_name
        if loan_property.loan_processor_email:
            loan["loan_processor_email"] = loan_property.loan_processor_email
        if loan_property.funding_date:
            loan["funding_date"] = loan_property.funding_date.isoformat()

    return loan or None


def push_loan_object_update(client, application):
    """Pushes the current loan object onto this application's most-recently-
    known Truv order via PATCH /v1/orders/{id}/ — used after assigning a loan
    officer/processor or funding the loan, so an order created before that
    assignment still gets the update. Returns None (not called at all) if
    there's no known order yet or nothing to send — the fields will simply be
    embedded in the `loan` object the next time an order IS created.

    Truv only allows this while the order's employers are pending/sent
    (confirmed via docs.truv.com/api-reference/orders/orders_partial_update)
    — a rejection against an already-completed order is Truv's real,
    documented behavior, not a bug here. Callers should check `.ok` and
    surface the actual rejection rather than assume success."""
    if not application.last_truv_order_id:
        return None
    loan = build_loan_object(application)
    if not loan:
        return None
    return client.update_order(application.last_truv_order_id, loan=loan)
