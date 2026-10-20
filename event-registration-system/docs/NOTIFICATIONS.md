# Notifications: the transactional outbox

Every e-mail the system sends is a **row in a database table first**, and a
message second. That single decision is what makes the participant experience
trustworthy: nothing that happens to a registration happens silently.

---

## 1. Why an outbox instead of sending inside the request

The naive implementation is `await sendMail(...)` inside the controller. It has
three failure modes:

| Problem | Consequence |
|---|---|
| SMTP is slow or down | The registration request hangs, or fails *after* the seat was taken |
| The process crashes between `COMMIT` and `sendMail` | The person is registered and never told |
| Sending fails | Nothing records it; you find out when someone complains |

The outbox turns that into:

```
BEGIN
  INSERT registration
  INSERT status-history row
  INSERT notification (status = 'queued')
COMMIT                    ← the promise is durable the instant the request returns

       … worker, later …

  render template → transport → UPDATE notification SET status='sent'
```

The participant is registered and the e-mail is owed, atomically. A crash
between the two leaves a `queued` row that the next worker tick picks up.

---

## 2. Schema

```
NOTIFICATIONS
  notification_id  PK
  user_id          NULL FK → USERS          (the account may not exist yet)
  email            VARCHAR(160)             (snapshot of the address at queue time)
  kind             VARCHAR(40)              (see below)
  registration_id  NULL FK → REGISTRATIONS
  event_id         NULL FK → EVENTS
  payload          TEXT (JSON)              (rendered values, so retries are safe)
  status           'queued' | 'sent' | 'failed'
  attempts         INT
  last_error       VARCHAR(255)             (why the last attempt failed)
  created_at, sent_at
  INDEX (status, created_at)                (the worker's query)
  INDEX (registration_id)
```

`email` is copied onto the row rather than only referenced through `user_id`:
the address can change later, and the row must record where the message was
actually sent — the same reason an invoice keeps its billing address.

---

## 3. Kinds and when they fire

| Kind | Trigger | Recipient |
|---|---|---|
| `registration_confirmed` | Registration succeeds with a seat | Participant |
| `waitlisted` | Event is full and the person joins the queue | Participant |
| `promoted` | A seat frees up and FIFO promotion runs | Promoted participant |
| `status_changed` | Admin moves a registration to another status | Participant |
| `registration_cancelled` | The participant (or an admin) cancels | Participant |
| `event_cancelled` | An event is archived | Every confirmed + waitlisted registrant |
| `password_reset` | Forgot-password request | Requester |
| `account_claim` | A brand-new profile is created by an anonymous registration | The new participant |

`account_claim` exists because public registration creates an account with a
random password nobody sees. The e-mail carries a seven-day, single-use link
that sets a real password — without it, anonymous registrants could never log
in. It is the same hashed-token mechanism as password reset, with a longer TTL.

---

## 4. Delivery

Configured entirely through `.env`:

```ini
APP_URL=http://localhost:3000      # base for links inside e-mails
MAIL_TRANSPORT=console             # console | smtp | memory
MAIL_FROM="EventReg <no-reply@eventreg.test>"
MAIL_INTERVAL_MS=15000             # worker tick
# MAIL_WORKER=off                  # queue rows, deliver nothing
```

| Transport | Behaviour | Use |
|---|---|---|
| `console` *(default)* | Writes a real `.eml` to `tmp/outbox/` and logs one line | Demos, offline defence, no SMTP account |
| `smtp` | Sends with nodemailer using `SMTP_HOST/PORT/USER/PASS/SECURE` | Mailtrap, Ethereal, Gmail, a school relay |
| `memory` | Keeps messages in an array, sends nothing | `npm test` |

The `.eml` files open in any mail client (Thunderbird, Outlook) and show exactly
what the participant would receive — headers included.

### Retry policy

```
attempt fails → attempts += 1
             → attempts < 3 ? status='queued'  (retried on the next tick)
                            : status='failed'  (stays visible in the admin UI)
```

Failed rows keep `last_error`, and the **Requeue** button in
`/admin/notifications` resets them and drains immediately, so a fixed SMTP
configuration can be verified in one click.

---

## 5. The admin page

`/admin/notifications` (admin only) lists every row with kind, recipient,
status, attempts and timestamps, filterable by status and kind. **Preview**
renders the stored payload through the *same* template the worker uses, so what
you see is what was sent — not a re-render that could drift.

The page is a normal MVC screen: route → `adminController.notificationsIndex` →
`models/Notification` → `views/admin/notifications.ejs`.

---

## 6. Testing

The suite runs with `MAIL_TRANSPORT=memory`, so it never touches the network:

```
✓ queues a row as 'queued' with zero attempts
✓ renders a subject, HTML and text alternative for every kind
✓ escapes participant-controlled text (no <script> in the body)
✓ delivers queued rows and stamps sent_at
✓ marks a row failed after the retry budget, keeping the error
✓ retries a failed row until it succeeds
✓ queues one cancellation notice per active registration
✓ refuses to queue without a recipient
✓ rejects an unknown kind at the model level
```

---

## 7. What is deliberately *not* here

- **No queue service.** One process, one table, one timer. Redis/BullMQ earns
  its place when you run several workers, not before.
- **No templating engine change.** EJS renders both the pages and the e-mails,
  so there is one syntax and one set of helpers (`config/format.js`).
- **No unsubscribe flow.** These are transactional messages about a booking the
  recipient made, not marketing.

A 24-hour reminder is the natural next step and is now about fifteen lines: a
cron that finds events starting in ~24h and calls `queue()` for each confirmed
registration.
