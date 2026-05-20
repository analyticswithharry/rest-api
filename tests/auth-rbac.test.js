const path = require("path");
const fs = require("fs");
const request = require("supertest");

const testDbPath = path.join(__dirname, "tmp-auth-rbac.db");
process.env.DB_PATH = testDbPath;
process.env.JWT_SECRET = "test_jwt_secret_123";
process.env.JWT_EXPIRES_IN = "1h";

if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const { app, closeDatabase } = require("../server");

const registerAndGetToken = async (suffix, role) => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      username: `user_${suffix}`,
      password: "password123",
      role,
    });

  expect(response.status).toBe(201);
  expect(response.body.success).toBe(true);
  return response.body.data.token;
};

afterAll(async () => {
  await closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

describe("Auth + RBAC", () => {
  test("register and login return JWT", async () => {
    const registerRes = await request(app).post("/api/auth/register").send({
      username: "alice",
      password: "password123",
      role: "viewer",
    });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.token).toBeDefined();

    const loginRes = await request(app).post("/api/auth/login").send({
      username: "alice",
      password: "password123",
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeDefined();
    expect(loginRes.body.data.user.role).toBe("viewer");
  });

  test("unauthenticated user cannot create product", async () => {
    const res = await request(app).post("/api/products").send({
      name: "Desk Lamp",
      category: "electronics",
      price: 19.99,
      description: "Warm light lamp",
    });

    expect(res.status).toBe(401);
  });

  test("viewer cannot create product", async () => {
    const viewerToken = await registerAndGetToken("viewer_1", "viewer");

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({
        name: "Desk Lamp",
        category: "electronics",
        price: 19.99,
        description: "Warm light lamp",
      });

    expect(res.status).toBe(403);
  });

  test("editor can create product but cannot delete", async () => {
    const editorToken = await registerAndGetToken("editor_1", "editor");

    const createRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${editorToken}`)
      .send({
        name: "USB Hub",
        category: "electronics",
        price: 24.99,
        description: "Multi-port hub",
      });

    expect(createRes.status).toBe(201);
    const productId = createRes.body.data.id;

    const deleteRes = await request(app)
      .delete(`/api/products/${productId}`)
      .set("Authorization", `Bearer ${editorToken}`);

    expect(deleteRes.status).toBe(403);
  });

  test("admin can delete product", async () => {
    const editorToken = await registerAndGetToken("editor_2", "editor");
    const adminToken = await registerAndGetToken("admin_1", "admin");

    const createRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${editorToken}`)
      .send({
        name: "Gaming Mouse",
        category: "electronics",
        price: 49.99,
        description: "High precision",
      });

    expect(createRes.status).toBe(201);

    const deleteRes = await request(app)
      .delete(`/api/products/${createRes.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(204);
  });
});
