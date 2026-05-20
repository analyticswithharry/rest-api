const statusEl = document.getElementById("afterStatus");
const gridEl = document.getElementById("afterGrid");

const getCategoryImage = (category = "") => {
  const key = String(category).toLowerCase();

  const imageMap = {
    electronics:
      "https://images.pexels.com/photos/356056/pexels-photo-356056.jpeg?auto=compress&cs=tinysrgb&w=1200",
    fashion:
      "https://images.pexels.com/photos/7679720/pexels-photo-7679720.jpeg?auto=compress&cs=tinysrgb&w=1200",
    books:
      "https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg?auto=compress&cs=tinysrgb&w=1200",
    home: "https://images.pexels.com/photos/1571459/pexels-photo-1571459.jpeg?auto=compress&cs=tinysrgb&w=1200",
    beauty:
      "https://images.pexels.com/photos/3373747/pexels-photo-3373747.jpeg?auto=compress&cs=tinysrgb&w=1200",
    sports:
      "https://images.pexels.com/photos/841130/pexels-photo-841130.jpeg?auto=compress&cs=tinysrgb&w=1200",
  };

  return (
    imageMap[key] ||
    "https://images.pexels.com/photos/5632402/pexels-photo-5632402.jpeg?auto=compress&cs=tinysrgb&w=1200"
  );
};

const renderProducts = (products) => {
  if (!products.length) {
    gridEl.innerHTML =
      "<article class='product-card'><h3>No products</h3><p>Add products using the main lab page.</p></article>";
    return;
  }

  gridEl.innerHTML = products
    .map(
      (p) => `
      <article class="product-card">
        <img
          class="product-media"
          src="${getCategoryImage(p.category)}"
          alt="${p.name}"
          loading="lazy"
        />
        <h3>${p.name}</h3>
        <p class="meta">Category: ${p.category} · ID: ${p.id}</p>
        <p>${p.description || "No description"}</p>
        <p class="price">$${Number(p.price).toFixed(2)}</p>
        <span class="mock-btn">View Product</span>
      </article>
    `,
    )
    .join("");
};

const loadAfterState = async () => {
  try {
    const res = await fetch(
      "/api/products?sort=created_at&order=desc&limit=12",
    );
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error?.message || "Failed to fetch products");
    }

    statusEl.className = "status status-success";
    statusEl.textContent = `Products loaded successfully (${data.total} total)`;

    renderProducts(data.data || []);
  } catch (error) {
    statusEl.className = "status status-error";
    statusEl.textContent = `Could not load products: ${error.message}`;
    gridEl.innerHTML = "";
  }
};

loadAfterState();
