// Static, developer-authored guide content per integration method — the
// real API sequence this app actually drives for that method, grounded in
// the endpoints truv_integration/client.py calls (not aspirational/generic
// copy). Mirrors the shape of the reference demo app's per-flow `STEPS`
// arrays (e.g. `/Users/brian/demo-apps/src/demos/scaffolding/payroll-income.jsx`):
// each step is `{ title, html }`, and the Dev Panel's Guide tab expands
// whichever step matches the live progress reported via guideStore.js.
export const GUIDE_STEPS = {
  embedded_order: [
    {
      title: 'Create the order',
      html: '<p>The app calls Truv\'s Orders API with the selected products. The response includes a <code>bridge_token</code> used to open the widget inline.</p><pre>POST /v1/orders/</pre>',
    },
    {
      title: 'Borrower completes the Bridge widget',
      html: '<p>Sandbox test login: employer <strong>Home Depot</strong>, username <code>goodlogin</code>, password <code>goodpassword</code>.</p><p>Watch the <strong>Bridge</strong> tab for the widget\'s <code>onLoad</code> / <code>onEvent</code> / <code>onSuccess</code> callbacks as the borrower connects.</p>',
    },
    {
      title: 'App fetches and applies the result',
      html: '<p>Once the widget reports success, the app pulls the finished order and writes whatever it can onto the loan\'s URLA fields — those show up with an "Auto-filled by Truv" badge.</p><pre>GET /v1/orders/{id}/</pre>',
    },
  ],
  hosted_order: [
    {
      title: 'Create the order',
      html: '<p>Same Orders API call as Embedded Orders, but with <code>email</code>/<code>phone</code> attached — Truv emails or texts the borrower a verification link instead of returning a widget token.</p><pre>POST /v1/orders/</pre>',
    },
    {
      title: 'Borrower completes verification on their own device',
      html: '<p>No widget renders in this app for this method — the borrower finishes on Truv\'s hosted page via the emailed/texted <code>share_url</code>.</p>',
    },
    {
      title: 'App checks status & applies',
      html: '<p>"Check Status & Apply" pulls the current order state on demand (a live webhook would do this automatically once configured) and writes any completed results onto the loan.</p><pre>GET /v1/orders/{id}/</pre>',
    },
  ],
  bridge_token: [
    {
      title: 'Create a user, then a bridge token',
      html: '<p>Deposit Switch and PLL use Truv\'s User Token flow, not Orders — a user is created first, then a single-product bridge token naming <code>deposit_switch</code> or <code>pll</code> (this app fills in a demo bank account automatically).</p><pre>POST /v1/users/\nPOST /v1/users/{id}/tokens/</pre>',
    },
    {
      title: 'Borrower completes the Bridge widget',
      html: '<p>Sandbox test login: username <code>goodlogin</code>, password <code>goodpassword</code>. The borrower connects their payroll provider and authorizes the deposit switch or paycheck-linked deduction.</p><p>Watch the <strong>Bridge</strong> tab for the widget\'s callbacks.</p>',
    },
    {
      title: 'App fetches the report',
      html: '<p>Once authorized, the app pulls the confirmation report for the connection.</p><pre>GET /v1/users/{user_id}/deposit_switch/report/</pre>',
    },
  ],
};

export const GUIDE_FLOW_LABELS = {
  embedded_order: 'Embedded Orders',
  hosted_order: 'Hosted Orders',
  bridge_token: 'Bridge Token',
};
