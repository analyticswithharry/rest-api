# API, REST, and RESTful — Theory Notes (Added)

This document captures the additional theory you shared and maps it to practical backend work in this project.

---

## 1) API vs REST vs RESTful

- **API (Application Programming Interface)**: A contract that defines how one software system talks to another.
- **REST (Representational State Transfer)**: An architectural style for networked systems.
- **RESTful API**: An API that follows REST constraints and patterns.

In short:

- API = interface concept
- REST = design style
- RESTful API = implementation of that style

---

## 2) Core REST Ideas

### Resource-oriented design

Use nouns/resources in URLs, not action verbs.

- Good: `/api/products`, `/api/products/12`
- Avoid: `/api/getProducts`, `/api/deleteProduct`

### Stateless communication

Each request must contain enough information to be understood independently.
Server does not depend on client session memory between requests.

### Uniform interface

Use standard HTTP methods, status codes, and representations consistently.

### Representation

Resources are transferred in a representation format (typically JSON in web APIs).

---

## 3) HTTP Methods (Practical Meaning)

- `GET`: Read/fetch resource(s)
- `POST`: Create or submit for processing
- `PUT`: Replace full resource state
- `PATCH`: Partially update resource
- `DELETE`: Remove resource

### Safe vs idempotent (important interview + real design topic)

- **Safe** methods do not request state change (`GET`, `HEAD`, `OPTIONS`, `TRACE`).
- **Idempotent** methods produce same intended result when repeated (`GET`, `PUT`, `DELETE`, etc.).
- `POST` is generally **not idempotent**.

---

## 4) Request and Response Anatomy

Typical request includes:

- Endpoint URL (resource identifier)
- Method (`GET`, `POST`, etc.)
- Headers (e.g., `Content-Type`, `Authorization`)
- Optional body/payload (`POST`, `PUT`, `PATCH`)
- Query parameters for filtering/sorting/pagination

Typical response includes:

- Status code
- Headers
- Optional response body (usually JSON)

---

## 5) HTTP Status Code Groups

- `1xx` informational
- `2xx` success
- `3xx` redirection
- `4xx` client-side error
- `5xx` server-side error

Frequently used in this project:

- `200 OK` (successful read/update result)
- `201 Created` (new resource created)
- `204 No Content` (successful delete with no response body)
- `400 Bad Request` (validation/input error)
- `404 Not Found` (resource missing)
- `500 Internal Server Error` (unexpected backend error)

---

## 6) URL and Endpoint Best Practices

- Keep endpoint names plural and consistent (`/products`)
- Use path parameters for specific resource IDs (`/products/:id`)
- Use query params for list shaping:
  - filter: `?category=electronics`
  - search: `?q=mouse`
  - sort: `?sort=price&order=asc`
  - paginate: `?page=1&limit=10`
- Prefer predictable naming over clever naming

---

## 7) REST Constraints and Why They Matter

- **Client-server separation**: frontend and backend evolve independently
- **Statelessness**: easier horizontal scaling
- **Cacheability**: faster performance where safe
- **Layered system**: proxies/gateways/load balancers fit naturally
- **Uniform interface**: better developer experience and interoperability

---

## 8) Security and Reliability Essentials

- Validate all incoming data
- Return meaningful but safe errors
- Use HTTPS in real deployments
- Use auth where needed (API key, bearer token, OAuth flows depending on system)
- Avoid exposing sensitive data in query strings when possible
- Log requests/errors and monitor failure rates

---

## 9) Testing Mindset for REST APIs

Test at multiple levels:

- Functional behavior (correct output)
- Validation and edge cases
- Authentication/authorization scenarios
- Performance and rate behavior
- Regression checks after changes

Tools commonly used:

- Postman (manual + collection-based testing)
- Automated integration tests (e.g., Jest + Supertest for Node)

---

## 10) Mapping Theory to This Repository

This project already demonstrates these ideas:

- Resource-based routes: `/api/products`
- CRUD with HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
- Correct status code usage (`200`, `201`, `204`, `400`, `404`, `500`)
- Query-driven list operations: search, filter, sort, pagination
- Frontend-to-API integration via `fetch()`
- Local persistence via SQLite
- Request logging + backup and transfer endpoints (extended practical operations)

---

## 11) Quick Mental Model

A REST API call is:

**Client intent** + **HTTP method** + **resource URL** + **optional payload**
→ processed by server
→ **status + representation** returned to client.

If this loop is clear, REST becomes easy to design and debug.

---

## 12) Source Alignment (for these notes)

These notes were consolidated from the theory references shared in this conversation and standard HTTP references:

- GeeksforGeeks: API fundamentals and categories
- AWS: RESTful API concepts (resources, methods, auth, response structure)
- MDN + RFC 9110 aligned method/status semantics

(Paraphrased and structured for learning; not copied verbatim.)
