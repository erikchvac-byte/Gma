# Porkbun Support Ticket — stuck apex forwarding/proxy record on gmaslist.com

**Status:** Draft ready to send (2026-06-15). Send to `support@porkbun.com` or
via Account → Support, from `erikchvac@gmail.com` so they can match the account.

**Why:** After disabling URL Forwarding and setting correct DNS, Porkbun's
authoritative nameservers still serve phantom Cloudflare-proxy A records on the
apex (not visible/editable in the DNS panel), blocking Render from verifying the
domain and issuing TLS. See ADR-032 + Known Issues in `ADR.md`.

**When resolved:** apex should resolve to ONLY `216.24.57.1`; Render then
verifies `gmaslist.com` + `www.gmaslist.com` and auto-issues HTTPS.

---

**Subject:** Residual URL-forwarding / Cloudflare-proxy A records stuck on apex of gmaslist.com — not editable in DNS panel

**Body:**

```
Domain: gmaslist.com
Account: erikchvac@gmail.com (Erik Childers)

Summary
-------
After fully disabling URL Forwarding and setting my own DNS records, your
authoritative nameservers are still serving phantom Cloudflare-proxy A
records on the apex that I cannot see or delete in the DNS Records panel.
They appear to be leftovers from the URL Forwarding I removed. They're
blocking my host from verifying the domain and issuing TLS.

What I have configured (verified in the panel)
----------------------------------------------
- URL Forwarding: fully removed. "Current Forwards" is empty; the domain
  page shows URL FORWARDING = "Not Set". Park Domain is off.
- DNS Records (the only A/CNAME I have set):
    A      @     -> 216.24.57.1            (my host, Render)
    CNAME  www   -> gma-zr94.onrender.com
  Plus the default MX (fwd1.porkbun.com), SPF TXT, and two
  _acme-challenge TXT records. There is NO second A record in my panel.

The problem
-----------
Querying your four authoritative nameservers directly, the apex returns
my correct A record PLUS an extra Cloudflare IP that is not in my panel,
and the extra IP differs per nameserver (classic Cloudflare-proxy
signature):

  curitiba.ns.porkbun.com  -> 173.245.58.37   216.24.57.1
  fortaleza.ns.porkbun.com -> 162.159.8.140   216.24.57.1
  maceio.ns.porkbun.com    -> 162.159.11.180  216.24.57.1
  salvador.ns.porkbun.com  -> 162.159.10.150  216.24.57.1

(173.245.58.x and 162.159.x.x are Cloudflare ranges — the same infra your
URL Forwarding uses.) www.gmaslist.com correctly returns only
gma-zr94.onrender.com.

Impact
------
The apex resolves to both the phantom Cloudflare IPs and my real A record
(216.24.57.1), so my host (Render) cannot verify gmaslist.com or issue an
SSL certificate. This has not cleared on its own for over an hour.

Request
-------
Please remove the residual URL-forwarding / Cloudflare-proxy record(s) on
the apex of gmaslist.com so it resolves ONLY to my A record 216.24.57.1.
I do not want any URL forwarding or proxy on this domain. Thank you.
```
