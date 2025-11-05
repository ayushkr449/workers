// app.js
// Replace BIN_ID if you have another. This is the workers bin id you supplied earlier.
const WORKERS_BIN_ID = "690b9427d0ea881f40d61cd1";
const JSONBIN_BASE = "https://api.jsonbin.io/v3/b";

// Proxy endpoint (you must deploy the serverless function and replace this URL)
const PROXY_REVIEW_ENDPOINT = "/api/review"; // If you host proxy on same domain via Vercel, this works.
// If proxy is deployed at e.g. https://your-vercel.app/api/review, replace above with full URL.

const categoryEl = document.getElementById("category");
const addressEl = document.getElementById("address");
const searchBtn = document.getElementById("searchBtn");
const resultsEl = document.getElementById("results");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modalContent");
const modalBack = document.getElementById("modalBack");
const contactBtn = document.getElementById("contactBtn");
const contactCard = document.getElementById("contactCard");

contactBtn.addEventListener("click", () => {
  contactCard.classList.toggle("hidden");
});

modalBack.addEventListener("click", () => {
  closeModal();
});

// helper: fetch workers JSON from JSONBin (public read assumed)
async function fetchWorkers() {
  const url = `${JSONBIN_BASE}/${WORKERS_BIN_ID}/latest`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch workers");
  const data = await res.json();
  // JSONbin v3 wraps content in record; try to extract sensible array
  // If your bin content is directly an array, it might be in data.record or data;
  return data.record || data || [];
}

// compute average rating from reviews array
function avgRating(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) return "No ratings";
  const sum = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0);
  return (sum / reviews.length).toFixed(1);
}

// render cards
function renderWorkers(list) {
  resultsEl.innerHTML = "";
  if (!list.length) {
    resultsEl.innerHTML = `<p style="color:var(--muted)">No workers found for selection.</p>`;
    return;
  }
  list.forEach(worker => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img src="${worker.Image || ''}" alt="${worker.Name}" onerror="this.style.opacity=.6">
      <div class="meta">
        <h3>${worker.Name}</h3>
        <p class="muted">${worker.Category} • ${worker.Address}</p>
        <p class="rating">Avg: ${avgRating(worker.Reviews)}</p>
      </div>
      <div class="actions">
        <button class="small-btn see-more">See more</button>
      </div>
    `;
    card.querySelector(".see-more").addEventListener("click", () => openModal(worker));
    resultsEl.appendChild(card);
  });
}

// open full-screen modal and show full info plus review form
function openModal(worker) {
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  modalContent.innerHTML = `
    <div class="modal-grid">
      <div>
        <img src="${worker.Image || ''}" alt="${worker.Name}" onerror="this.style.opacity=.6">
      </div>
      <div style="flex:1">
        <h2>${worker.Name}</h2>
        <p><strong>Category:</strong> ${worker.Category}</p>
        <p><strong>Address:</strong> ${worker.Address}</p>
        <p><strong>Phone:</strong> ${worker.PhoneNumber}</p>
        <p><strong>Services:</strong></p>
        <ul>
          ${(Array.isArray(worker.Services) ? worker.Services : []).map(s=>`<li>${s.service} — ${s.price}</li>`).join("")}
        </ul>

        <div class="review-list">
          <h4>Reviews (Avg: ${avgRating(worker.Reviews)})</h4>
          <div id="reviewItems">
            ${(Array.isArray(worker.Reviews) ? worker.Reviews : []).map(r=>`
              <div class="review-item">
                <strong>${r.user || "Anon"}</strong> — ${r.rating}/5
                <div style="color:var(--muted);font-size:13px">${r.comment || ""}</div>
                <div style="font-size:12px;color:#9aa">${r.date || ""}</div>
              </div>
            `).join("")}
          </div>
        </div>

        <div style="margin-top:12px;">
          <h4>Add Review</h4>
          <div class="form-row">
            <input id="revName" placeholder="Your name" />
            <input id="revRating" placeholder="Rating 1-5" type="number" min="1" max="5" />
          </div>
          <div class="form-row" style="margin-top:8px;">
            <textarea id="revComment" placeholder="Your comment"></textarea>
          </div>
          <div style="margin-top:8px;">
            <button id="submitReview" class="btn">Submit Review</button>
            <span id="revStatus" style="margin-left:10px;color:var(--muted)"></span>
          </div>
        </div>

      </div>
    </div>
  `;
  
  // add listener to submit
  document.getElementById("submitReview").addEventListener("click", async () => {
    const name = document.getElementById("revName").value.trim() || "Anon";
    const rating = Number(document.getElementById("revRating").value) || 5;
    const comment = document.getElementById("revComment").value.trim() || "";
    const status = document.getElementById("revStatus");
    status.textContent = "Saving...";
    try {
      // Prepare payload for proxy
      const payload = {
        binId: WORKERS_BIN_ID,
        identifier: { PhoneNumber: worker.PhoneNumber }, // server will match by PhoneNumber
        review: { user: name, rating, comment, date: new Date().toISOString().split('T')[0] }
      };
      const res = await fetch(PROXY_REVIEW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.message || "Failed");
      status.textContent = "Saved ✓ (reload to see updated reviews)";
      // Optionally append to UI
      const reviewItems = document.getElementById("reviewItems");
      const div = document.createElement("div");
      div.className = "review-item";
      div.innerHTML = `<strong>${name}</strong> — ${rating}/5 <div style="color:var(--muted);font-size:13px">${comment}</div><div style="font-size:12px;color:#9aa">${new Date().toISOString().split('T')[0]}</div>`;
      reviewItems.prepend(div);
    } catch (err) {
      console.error(err);
      status.textContent = "Save failed: " + (err.message || "");
    }
  });
}

function closeModal() {
  modal.classList.add("hidden");
  modalContent.innerHTML = "";
  document.body.style.overflow = "";
}

// search flow
searchBtn.addEventListener("click", async () => {
  const cat = categoryEl.value;
  const addr = addressEl.value;
  if (!cat || !addr) {
    alert("Please select both category and address.");
    return;
  }
  resultsEl.innerHTML = `<p style="color:var(--muted)">Loading...</p>`;
  try {
    const workersData = await fetchWorkers();
    // worker data might be inside an array property; attempt to detect
    let arr = [];
    if (Array.isArray(workersData)) arr = workersData;
    else if (Array.isArray(workersData.workers)) arr = workersData.workers;
    else if (Array.isArray(workersData.data)) arr = workersData.data;
    else arr = workersData; // fallback
    
    // normalize and filter by category + address fuzzy match
    const filtered = (arr || []).filter(w => {
      const matchCat = String(w.Category || "").toLowerCase() === String(cat).toLowerCase();
      const addrStr = String(w.Address || "").toLowerCase();
      const expected = String(addr || "").toLowerCase();
      const matchAddr = (addrStr.includes("maint") && expected.includes("mai")) ||
        (addrStr.includes("bar") && expected.includes("bar")) ||
        addrStr.includes(expected);
      return matchCat && matchAddr;
    });
    renderWorkers(filtered);
  } catch (err) {
    console.error(err);
    resultsEl.innerHTML = `<p style="color:red">Failed to load workers. If your JSONBin is private, change the frontend to fetch via your proxy or make the bin public read.</p>`;
  }
});

// initial small hint
resultsEl.innerHTML = `<p style="color:var(--muted)">Choose category and address then click "Search Workers".</p>`;
