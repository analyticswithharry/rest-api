// Cache frequently used DOM elements.
const output = document.getElementById("output");
const productsBox = document.getElementById("products");
const uploadedFilesEl = document.getElementById("uploadedFiles");
const backupFilesEl = document.getElementById("backupFiles");
const logsOutputEl = document.getElementById("logsOutput");

// Category-based Pexels fallback images for store cards.
const pexelsByCategory = {
  electronics:
    "https://images.pexels.com/photos/356056/pexels-photo-356056.jpeg?auto=compress&cs=tinysrgb&w=1200",
  stationery:
    "https://images.pexels.com/photos/261763/pexels-photo-261763.jpeg?auto=compress&cs=tinysrgb&w=1200",
  lifestyle:
    "https://images.pexels.com/photos/3735208/pexels-photo-3735208.jpeg?auto=compress&cs=tinysrgb&w=1200",
  books:
    "https://images.pexels.com/photos/3747468/pexels-photo-3747468.jpeg?auto=compress&cs=tinysrgb&w=1200",
};

const fallbackPexels =
  "https://images.pexels.com/photos/230544/pexels-photo-230544.jpeg?auto=compress&cs=tinysrgb&w=1200";

// Utility: print API responses/errors in the on-page console.
const print = (title, payload) => {
  output.textContent = `${title}\n${JSON.stringify(payload, null, 2)}`;
};

const getProductImage = (product) => {
  const key = String(product.category || "")
    .trim()
    .toLowerCase();
  return pexelsByCategory[key] || fallbackPexels;
};

// Reusable fetch helper:
// - sends request
// - safely parses response (JSON when possible)
// - throws normalized error payload for non-2xx responses
const fetchJSON = async (url, options = {}) => {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw {
      status: response.status,
      data,
    };
  }

  return { status: response.status, data };
};

// Load products from API using optional search + selected sort.
const loadProducts = async () => {
  try {
    // Read filter values from UI.
    const search = document.getElementById("search").value.trim();
    const [sort, order] = document.getElementById("sort").value.split(":");

    // Build query string with pagination and sorting defaults.
    const params = new URLSearchParams();
    params.set("limit", "20");
    params.set("sort", sort);
    params.set("order", order);
    if (search) params.set("q", search);

    const { data } = await fetchJSON(`/api/products?${params.toString()}`);
    renderProducts(data.data || []);
    print("GET /api/products", data);
  } catch (err) {
    print("GET /api/products - ERROR", err);
  }
};

// Render products into HTML cards with quick action buttons.
const renderProducts = (items) => {
  if (!items.length) {
    productsBox.innerHTML = "<p>No products found.</p>";
    return;
  }

  productsBox.innerHTML = items
    .map(
      (p) => `
      <div class="product">
        <img class="product-image" src="${getProductImage(p)}" alt="${p.name}" loading="lazy" />
        <div class="product-body">
          <h3>${p.name}</h3>
          <div class="meta">Category: ${p.category} | Price: $${Number(p.price).toFixed(2)} | ID: ${p.id}</div>
          <p>${p.description || "No description"}</p>
          <div class="actions">
            <button onclick="editProduct(${p.id})">EDIT All Details</button>
            <button onclick="updateCategory(${p.id})">PATCH Category</button>
            <button onclick="updateDescription(${p.id})">PATCH Description</button>
            <button onclick="updatePrice(${p.id})">PATCH Price</button>
            <button onclick="deleteProduct(${p.id})">DELETE</button>
          </div>
        </div>
      </div>
    `,
    )
    .join("");

  if (window.gsap) {
    gsap.fromTo(
      ".product",
      { y: 24, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.5,
        stagger: 0.05,
        ease: "power2.out",
      },
    );
  }
};

// Delete product by id, then refresh product list.
window.deleteProduct = async (id) => {
  try {
    const { status } = await fetchJSON(`/api/products/${id}`, {
      method: "DELETE",
    });
    print(`DELETE /api/products/${id}`, { success: true, status });
    await loadProducts();
  } catch (err) {
    print(`DELETE /api/products/${id} - ERROR`, err);
  }
};

// Edit multiple product fields from UI and send PATCH update.
window.editProduct = async (id) => {
  try {
    // Load latest product data so prompts are pre-filled with current values.
    const { data: existingResponse } = await fetchJSON(`/api/products/${id}`);
    const existing = existingResponse.data;

    const name = prompt("Edit product name:", existing.name);
    if (name === null) return;

    const category = prompt("Edit category:", existing.category);
    if (category === null) return;

    const description = prompt("Edit description:", existing.description || "");
    if (description === null) return;

    const priceInput = prompt("Edit price:", String(existing.price));
    if (priceInput === null) return;

    const price = Number(priceInput);
    if (Number.isNaN(price) || price < 0) {
      alert("Price must be a non-negative number");
      return;
    }

    const payload = {
      name: name.trim(),
      category: category.trim(),
      description: description.trim(),
      price,
    };

    const { data } = await fetchJSON(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    print(`PATCH /api/products/${id} (edit details)`, data);
    await loadProducts();
  } catch (err) {
    print(`PATCH /api/products/${id} (edit details) - ERROR`, err);
  }
};

// Prompt user for new price and send PATCH update.
window.updatePrice = async (id) => {
  const input = prompt("Enter new price:");
  if (input === null) return;

  // Basic client-side guard before API request.
  const price = Number(input);
  if (Number.isNaN(price) || price < 0) {
    alert("Price must be a non-negative number");
    return;
  }

  try {
    const { data } = await fetchJSON(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price }),
    });
    print(`PATCH /api/products/${id}`, data);
    await loadProducts();
  } catch (err) {
    print(`PATCH /api/products/${id} - ERROR`, err);
  }
};

// Prompt user for new category and send PATCH update.
window.updateCategory = async (id) => {
  const input = prompt("Enter new category:");
  if (input === null) return;

  const category = input.trim();
  if (category.length < 2) {
    alert("Category must be at least 2 characters");
    return;
  }

  try {
    const { data } = await fetchJSON(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    print(`PATCH /api/products/${id} (category)`, data);
    await loadProducts();
  } catch (err) {
    print(`PATCH /api/products/${id} (category) - ERROR`, err);
  }
};

// Prompt user for new description and send PATCH update.
window.updateDescription = async (id) => {
  const input = prompt("Enter new description:");
  if (input === null) return;

  const description = input.trim();

  try {
    const { data } = await fetchJSON(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    print(`PATCH /api/products/${id} (description)`, data);
    await loadProducts();
  } catch (err) {
    print(`PATCH /api/products/${id} (description) - ERROR`, err);
  }
};

// Handle create form submission (POST /api/products).
document.getElementById("createForm").addEventListener("submit", async (e) => {
  // Prevent normal form submit so we can send async request.
  e.preventDefault();

  // Build payload from form fields.
  const payload = {
    name: document.getElementById("name").value.trim(),
    category: document.getElementById("category").value.trim(),
    price: Number(document.getElementById("price").value),
    description: document.getElementById("description").value.trim(),
  };

  try {
    const { data } = await fetchJSON("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    print("POST /api/products", data);
    e.target.reset();
    await loadProducts();
  } catch (err) {
    print("POST /api/products - ERROR", err);
  }
});

// Manual refresh button for list endpoint.
document.getElementById("loadBtn").addEventListener("click", loadProducts);

// Seed button inserts sample data in DB, then refreshes list.
document.getElementById("seedBtn").addEventListener("click", async () => {
  try {
    const { data } = await fetchJSON("/api/seed", { method: "POST" });
    print("POST /api/seed", data);
    await loadProducts();
  } catch (err) {
    print("POST /api/seed - ERROR", err);
  }
});

// Upload photo/video/document to backend transfer API.
document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const input = document.getElementById("uploadFile");
  const file = input.files?.[0];
  if (!file) {
    alert("Please choose a file first");
    return;
  }

  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/transfer/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) throw data;

    print("POST /api/transfer/upload", data);
    input.value = "";
    await loadUploadedFiles();
  } catch (err) {
    print("POST /api/transfer/upload - ERROR", err);
  }
});

const renderSimpleList = (targetEl, items, emptyText = "No data") => {
  if (!targetEl) return;

  if (!items.length) {
    targetEl.innerHTML = `<li>${emptyText}</li>`;
    return;
  }

  targetEl.innerHTML = items
    .map(
      (item) =>
        `<li><a href="${item.url}" target="_blank" rel="noreferrer">${item.name || item.url}</a></li>`,
    )
    .join("");
};

const loadUploadedFiles = async () => {
  try {
    const { data } = await fetchJSON("/api/transfer/files");
    renderSimpleList(uploadedFilesEl, data.data || [], "No uploaded files yet");
    print("GET /api/transfer/files", data);
  } catch (err) {
    print("GET /api/transfer/files - ERROR", err);
  }
};

const loadBackups = async () => {
  try {
    const { data } = await fetchJSON("/api/transfer/backups");
    renderSimpleList(backupFilesEl, data.data || [], "No backups yet");
    print("GET /api/transfer/backups", data);
  } catch (err) {
    print("GET /api/transfer/backups - ERROR", err);
  }
};

const loadLogs = async () => {
  try {
    const { data } = await fetchJSON("/api/transfer/logs?limit=80");
    if (logsOutputEl) {
      logsOutputEl.textContent = JSON.stringify(data.data || [], null, 2);
    }
    print("GET /api/transfer/logs", { count: (data.data || []).length });
  } catch (err) {
    print("GET /api/transfer/logs - ERROR", err);
  }
};

document
  .getElementById("refreshFilesBtn")
  ?.addEventListener("click", loadUploadedFiles);

document
  .getElementById("createBackupBtn")
  ?.addEventListener("click", async () => {
    try {
      const { data } = await fetchJSON("/api/transfer/backup/create", {
        method: "POST",
      });
      print("POST /api/transfer/backup/create", data);
      await loadBackups();
    } catch (err) {
      print("POST /api/transfer/backup/create - ERROR", err);
    }
  });

document
  .getElementById("loadBackupsBtn")
  ?.addEventListener("click", loadBackups);
document.getElementById("loadLogsBtn")?.addEventListener("click", loadLogs);

if (window.gsap) {
  gsap.registerPlugin(window.ScrollTrigger);
  gsap.from(".site-header", {
    y: -20,
    opacity: 0,
    duration: 0.6,
    ease: "power2.out",
  });

  gsap.from(".card", {
    y: 30,
    opacity: 0,
    duration: 0.55,
    stagger: 0.08,
    ease: "power2.out",
  });
}

// Initial data load when page opens.
loadProducts();
loadUploadedFiles();
loadBackups();
