/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const showMoreProductsButton = document.getElementById("showMoreProducts");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineButton = document.getElementById("generateRoutine");

/* Add your Cloudflare Worker URL here */
const workerURL = "https://fragrant-king-0f50.kspenc38.workers.dev/";

/* Keep the conversation so the Worker can answer follow-up questions */
const messages = [
  {
    role: "system",
    content: "You are a helpful L'Oréal beauty and routine advisor.",
  },
];

/* Restore previously selected products from this browser */
let selectedProducts = [];
let allProducts = [];
let filteredProducts = [];
let showAllProducts = false;
const initialProductLimit = 8;

try {
  const savedProducts = JSON.parse(
    localStorage.getItem("selectedProducts") || "[]"
  );

  if (Array.isArray(savedProducts)) {
    selectedProducts = savedProducts;
  }
} catch (error) {
  console.error("Could not restore saved products:", error);
}

/* Show a loading message until the product catalog is ready */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Loading products...
  </div>
`;

/* Save product selections so they are still here after a page reload */
function saveSelectedProducts() {
  try {
    localStorage.setItem("selectedProducts", JSON.stringify(selectedProducts));
  } catch (error) {
    console.error("Could not save selected products:", error);
  }
}

/* Update the selected-products list and selection styling */
function renderSelectedProducts() {
  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="selected-product-item">
          <span>${product.name}</span>
          <button type="button" class="remove-product" data-product-id="${product.id}">
            Remove
          </button>
        </div>
      `
    )
    .join("");

  productsContainer.querySelectorAll(".product-card").forEach((card) => {
    const isSelected = selectedProducts.some(
      (product) => String(product.id) === card.dataset.productId
    );
    card.classList.toggle("selected", isSelected);
    card.setAttribute("aria-pressed", String(isSelected));
  });
}

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");

  if (!response.ok) {
    throw new Error(`Could not load products.json (${response.status}).`);
  }

  const data = await response.json();

  if (!Array.isArray(data.products)) {
    throw new Error("products.json must contain a products array.");
  }

  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    showMoreProductsButton.hidden = true;
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products match your search. Try another name or category.
      </div>
    `;
    return;
  }

  const productsToShow = showAllProducts
    ? products
    : products.slice(0, initialProductLimit);

  productsContainer.innerHTML = productsToShow
    .map(
      (product) => `
    <div class="product-card" data-product-id="${product.id}" role="button" tabindex="0" aria-pressed="false">
      <img src="${product.image}" alt="${product.name}">
      <h3 class="product-name">${product.name}</h3>
      <div class="product-details-overlay">
        <p class="product-brand">${product.brand}</p>
        <p class="product-description">${product.description}</p>
      </div>
    </div>
  `
    )
    .join("");

  showMoreProductsButton.hidden = products.length <= initialProductLimit;
  showMoreProductsButton.textContent = showAllProducts
    ? "Show fewer products"
    : "Show more products";

  renderSelectedProducts();
}

/* Add or remove a product when its card is clicked or keyboard-activated */
function toggleProductSelection(productId) {
  const selectedIndex = selectedProducts.findIndex(
    (product) => String(product.id) === String(productId)
  );

  if (selectedIndex >= 0) {
    selectedProducts.splice(selectedIndex, 1);
  } else {
    const product = allProducts.find(
      (item) => String(item.id) === String(productId)
    );

    if (!product) return;

    selectedProducts.push(product);
  }

  saveSelectedProducts();
  renderSelectedProducts();
}

/* Filter products by the search text and selected category */
function filterProducts() {
  const searchText = productSearch.value.trim().toLowerCase();
  const selectedCategory = categoryFilter.value;
  filteredProducts = allProducts.filter((product) => {
    const matchesCategory =
      !selectedCategory || product.category === selectedCategory;
    const searchableText = `${product.name} ${product.brand} ${product.description}`.toLowerCase();
    const matchesSearch = searchableText.includes(searchText);

    return matchesCategory && matchesSearch;
  });

  showAllProducts = false;
  displayProducts(filteredProducts);
}

productSearch.addEventListener("input", filterProducts);
categoryFilter.addEventListener("change", filterProducts);

showMoreProductsButton.addEventListener("click", () => {
  showAllProducts = !showAllProducts;
  displayProducts(filteredProducts);
});

/* Load the product catalog once, then show all products initially */
async function initializeProductCatalog() {
  try {
    allProducts = await loadProducts();
    filterProducts();
  } catch (error) {
    console.error("Could not load products:", error);

    const message =
      window.location.protocol === "file:"
        ? "Products could not load from a file opened directly. Open this project with VS Code Live Server, then choose a category again."
        : "Products could not load. Check that products.json is available and try again.";

    productsContainer.innerHTML = `
      <div class="placeholder-message">${message}</div>
    `;
  }
}

initializeProductCatalog();

/* Send a message and the conversation history to the Cloudflare Worker */
async function sendMessageToWorker(content) {
  messages.push({ role: "user", content });
  chatWindow.textContent = "Thinking...";

  try {
    const response = await fetch(workerURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      throw new Error("The Worker response did not include a message.");
    }

    messages.push({ role: "assistant", content: reply });
    chatWindow.textContent = reply;
    return;
  } catch (error) {
    console.error("Could not contact the Cloudflare Worker:", error);
    messages.pop();
    throw error;
  }
}

/* Generate a routine using only the selected product details */
generateRoutineButton.addEventListener("click", async () => {
  if (selectedProducts.length === 0) {
    chatWindow.textContent = "Select at least one product before generating a routine.";
    return;
  }

  const routineRequest = `Create a personalized routine using only these selected products. Explain the order and when to use each product. If a product does not fit the routine, explain why. Selected products: ${JSON.stringify(
    selectedProducts.map(({ name, brand, category, description }) => ({
      name,
      brand,
      category,
      description,
    }))
  )}`;

  try {
    await sendMessageToWorker(routineRequest);
  } catch (error) {
    chatWindow.textContent = `Sorry, the routine request failed: ${error.message}`;
  }
});

/* Remove a product directly from the selected-products list */
selectedProductsList.addEventListener("click", (e) => {
  const removeButton = e.target.closest(".remove-product");

  if (removeButton) {
    toggleProductSelection(removeButton.dataset.productId);
  }
});

/* Select a product by clicking its card */
productsContainer.addEventListener("click", (e) => {
  const card = e.target.closest(".product-card");

  if (card) {
    toggleProductSelection(card.dataset.productId);
  }
});

/* Support selecting product cards with Enter or Space */
productsContainer.addEventListener("keydown", (e) => {
  const card = e.target.closest(".product-card");

  if (card && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    toggleProductSelection(card.dataset.productId);
  }
});

/* Send follow-up questions to the same conversation */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userMessage = userInput.value.trim();

  if (!userMessage) return;

  try {
    await sendMessageToWorker(userMessage);
    userInput.value = "";
  } catch (error) {
    chatWindow.textContent = `Sorry, your message failed: ${error.message}`;
  }
});

renderSelectedProducts();
