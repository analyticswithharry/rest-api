# REST API Tutorial Project (Node.js + Express + SQLite + Postman)

This project teaches REST API practically using Node.js.

You get:

- A working REST API for `Product`
- Local SQLite database
- Frontend website (`index.html`, `styles.css`, `script.js`)
- Postman collection
- Beginner-friendly docs and workflow

---

## 1) What You Will Learn

- What REST API is and why it is used
- HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
- Status codes: `200`, `201`, `204`, `400`, `404`, `500`
- Resource-oriented endpoint design
- Local database connection using SQLite
- How frontend calls API using `fetch()`
- How to test APIs with Postman

---

## 2) Project Structure

- `server.js` → Express API + SQLite DB + static frontend hosting
- `public/index.html` → Browser UI to interact with API
- `public/styles.css` → Styling
- `public/script.js` → Frontend API calls
- `problem-statement/PROBLEM_STATEMENT.md` → Problem statement
- `postman/RestApi-Tutorial.postman_collection.json` → Postman collection
- `data/restapi.db` → Local SQLite database file (auto-created)

---

## 3) Quick Start

### Step A: Install dependencies

Run in project root:

- `npm install`

### Step B: Start server

- `npm start`

Server will run at:

- `http://localhost:3000`

### Step C: Open website

- Open `http://localhost:3000` in browser.

### Step D: Insert sample data (optional)

- Click **Insert Sample Data** in UI
- or call `POST /api/seed`

---

## 4) API Endpoints (Product Resource)

### Authentication (JWT)

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (requires `Authorization: Bearer <token>`)

Roles supported:

- `viewer` → read-only
- `editor` → create/update
- `admin` → full access (including delete/seed/backup/log endpoints)

### Health

- `GET /api/health`

### Seed Sample Data

- `POST /api/seed` (admin only)

### Product CRUD

- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products` (editor/admin)
- `PUT /api/products/:id` (editor/admin)
- `PATCH /api/products/:id` (editor/admin)
- `DELETE /api/products/:id` (admin)

---

## 5) Query Features (GET /api/products)

Use query params:

- `q` → search in name/description
- `category` → filter category
- `min_price`, `max_price` → numeric filtering
- `sort` → `id | name | category | price | created_at | updated_at`
- `order` → `asc | desc`
- `page` and `limit` → pagination

Example:

`/api/products?q=keyboard&sort=price&order=asc&page=1&limit=10`

---

## 6) Example Request/Response

### Create product

`POST /api/products`

Body:

```json
{
  "name": "USB Hub",
  "category": "electronics",
  "price": 24.99,
  "description": "7-port USB hub"
}
```

Expected:

- Status `201 Created`
- `Location` header: `/api/products/{id}`

### Delete product

`DELETE /api/products/:id`

Expected:

- Status `204 No Content`

---

## 7) How Frontend Uses API

Inside `public/script.js`:

- `fetch('/api/products')` loads product list
- `fetch('/api/products', { method: 'POST' ... })` creates product
- `fetch('/api/products/:id', { method: 'PATCH' ... })` updates price
- `fetch('/api/products/:id', { method: 'DELETE' })` deletes product

This is the practical browser-to-API integration flow.

---

## 8) How Local Database Is Connected

In `server.js`:

- `sqlite3.Database(path.join(__dirname, 'data', 'restapi.db'))`
- `CREATE TABLE IF NOT EXISTS products (...)`
- SQL statements run in CRUD handlers

So:

Frontend -> Express API -> SQLite DB -> JSON Response -> Frontend UI

---

## 9) Postman Testing Guide

1. Open Postman
2. Import: `postman/RestApi-Tutorial.postman_collection.json`
3. Set variable `base_url = http://localhost:3000`
4. Run requests in this order:

- Register User / Login User
- Health Check
- Seed Data
- List Products
- Create Product
- Update Product (PUT/PATCH)
- Delete Product

---

## 10) Suggested Practice Tasks

1. Add `stock` field to product.
2. Add category validation list.
3. Add API key auth middleware.
4. Add `/api/v1/products` versioning path.
5. Expand Jest + Supertest test coverage.

---

## 11) REST Best Practices Used Here

- Resource-based URLs (`/api/products`)
- Proper HTTP verbs
- Predictable status codes
- Input validation
- Consistent JSON error format
- Filtering, sorting, pagination support

---

## 12) Learning References Used

This project aligns with standard REST guidance and practical Node.js workflows from:

- Postman REST API concepts and examples
- Postman Node.js + Express build workflow
- REST constraints and resource-oriented design guidance

---

## 13) Full Backend End-to-End Tutorial

For complete backend-only coverage of REST API topics (architecture, validation, security, versioning, testing, deployment readiness), read:

- `docs/BACKEND_REST_API_END_TO_END.md`

## 14) Full Project Implementation + Diagram Explanations

For a complete record of everything implemented (including transfer APIs, UI upgrades, and explanations of your attached REST API diagrams), read:

- `docs/PROJECT_IMPLEMENTATION_AND_DIAGRAMS.md`

## 15) API / REST / RESTful Theory Notes

For the additional conceptual notes you shared (API basics, REST constraints, HTTP methods, status codes, endpoint design, and practical mapping), read:

- `docs/API_REST_RESTFUL_THEORY_NOTES.md`

## 16) Complete Backend/API Roadmap (Beginner → Advanced)

For a full industry-style progression plan (e-commerce, SaaS, fintech, trading, AI, real-time, cloud, DevOps, distributed systems) mapped to this app, read:

- `docs/COMPLETE_BACKEND_API_ROADMAP_FOR_THIS_APP.md`

---

Happy building 🚀
