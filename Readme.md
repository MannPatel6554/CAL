# 📅 Schedule Notifier — MVP

A minimal, fully functional personal scheduling app with real-time dual alerts
(in-app toast + native OS notification). Built to demonstrate a complete,
working **Frontend → Backend → Database** pipeline — no shortcuts, no BaaS
magic boxes hiding the logic.

---

## 🎯 Core Goal

A user logs in, creates events (title, date, time), and gets notified
(in-app + Windows native notification) when an event's time arrives. That's
the entire product. Nothing else.

---

## 🛠️ Tech Stack (Lean, No Extras)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React (Vite) + Tailwind CSS | Fast dev, minimal boilerplate |
| Calendar UI | Custom 7×5 grid + `lucide-react` icons | No heavy calendar libs |
| Backend | Node.js + Express | Simple REST API, full control of logic |
| Database | PostgreSQL (or SQLite for local dev) | Relational, easy to reason about |
| Auth | JWT (email + password, bcrypt hashing) | No third-party auth black box |
| Alerts | `react-toastify` + Web Notification API | Dual-channel alert |
| Scheduler | `setInterval` polling (client) calling a `/events/due` endpoint | Simple, no cron/queue needed for MVP |

> Note: Firebase/Supabase were dropped in favor of a real Express + Postgres
> backend so the FE → BE → DB data flow is fully visible and you can see every
> request/response/query — which is what you asked Antigravity to expose.

---

## 🧱 Architecture

```
[React Frontend]
   |  (fetch/axios, JWT in headers)
   v
[Express Backend API]
   |  (SQL queries via pg / knex)
   v
[PostgreSQL Database]
```

### Data Flow Example (Create Event)
1. User submits form in React → `POST /api/events` with JWT in `Authorization` header.
2. Express middleware verifies JWT → extracts `user_id`.
3. Controller validates payload → inserts row into `events` table scoped to `user_id`.
4. DB returns created row → Express sends it back as JSON.
5. React updates local state → re-renders calendar grid.

### Data Flow Example (Notification Check)
1. Every 60s, React calls `GET /api/events/due` (sends current timestamp or server uses its own clock).
2. Express queries DB for events matching `user_id + date + time` (±1 min window).
3. Returns matching events → React triggers `toast.info()` + `new Notification()`.

---

## 🗄️ Database Schema

**users**
| column | type |
|---|---|
| id | UUID / serial PK |
| email | text, unique |
| password_hash | text |
| created_at | timestamp |

**events**
| column | type |
|---|---|
| id | UUID / serial PK |
| user_id | FK → users.id |
| title | text |
| date | date |
| time | time |
| notified | boolean (default false) |
| created_at | timestamp |

Row-level isolation enforced **in application logic**: every query is
`WHERE user_id = req.user.id` — no user can ever read/write another user's rows.

---

## 🔌 Required API Endpoints (MVP only)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create user, hash password |
| POST | `/api/auth/login` | Verify credentials, issue JWT |
| GET | `/api/events` | List logged-in user's events |
| POST | `/api/events` | Create new event |
| PUT | `/api/events/:id` | Edit event |
| DELETE | `/api/events/:id` | Delete event |
| GET | `/api/events/due` | Return events matching current time (for notification engine) |

No other endpoints. No file uploads, no recurring events, no sharing, no
calendar sync, no email notifications — those are explicitly **out of scope**
for this MVP.

---

## 🚫 Explicitly Out of Scope (for v1)

- Recurring/repeating events
- Multi-user calendar sharing
- Email/SMS notifications
- Drag-and-drop event editing
- Timezone handling beyond local browser time
- Mobile push notifications
- Any third-party calendar sync (Google/Outlook)

---

## ▶️ Next Steps

Once scaffolded, the build order should be:
1. DB schema + migrations
2. Auth endpoints (register/login + JWT middleware)
3. Events CRUD endpoints
4. React calendar grid UI + auth pages
5. Notification engine (`/events/due` polling + dual alert trigger)