// =====================================================
// LEGITTA BAKERY - PRODUCTION MANAGEMENT
// =====================================================

// KONFIGURASI SUPABASE
const SUPABASE_URL = "https://araecdddcwgidpzwvsly.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UNxMd5oFYFo6bPMk6xFUVQ_gudkAtaI";

const db = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const $ = id => document.getElementById(id);

let currentPeriodId = null;
let productionRows = [];
let isLoading = false;

// =====================================================
// FORMAT ANGKA
// =====================================================

function numberFormat(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

// =====================================================
// PESAN NOTIFIKASI
// =====================================================

function showMessage(message, type = "info") {
  const el = $("message");

  el.textContent = message;
  el.className = "message show " + type;
}

function hideMessage() {
  $("message").textContent = "";
  $("message").className = "message";
}

// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

// =====================================================
// SIDEBAR MOBILE
// =====================================================

function setupSidebar() {
  const sidebar = $("sidebar");
  const toggle = $("menuToggle");
  const overlay = $("sidebarOverlay");

  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  }

  toggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  });

  overlay.addEventListener("click", closeSidebar);

  window.addEventListener("resize", () => {
    if (window.innerWidth > 750) {
      closeSidebar();
    }
  });
}

// =====================================================
// CEK LOGIN DAN HAK AKSES ADMIN
// =====================================================

async function checkAdmin() {
  const { data: userData, error: userError } = await db.auth.getUser();

  if (userError || !userData.user) {
    window.location.href = "index.html";
    return false;
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "admin") {
    alert("Halaman ini hanya dapat diakses oleh admin.");
    window.location.href = "index.html";
    return false;
  }

  return true;
}

// =====================================================
// MEMUAT PERIODE PESANAN
// =====================================================

async function loadPeriods() {
  const select = $("periodSelect");

  select.innerHTML = '<option value="">Memuat periode...</option>';

  const { data, error } = await db
    .from("order_periods")
    .select("id,name,start_date,end_date,is_open")
    .order("start_date", { ascending: false });

  if (error) {
    showMessage("Gagal memuat periode: " + error.message, "error");
    select.innerHTML = '<option value="">Gagal memuat periode</option>';
    renderEmpty("Periode tidak dapat dimuat.");
    return;
  }

  if (!data || data.length === 0) {
    select.innerHTML = '<option value="">Belum ada periode</option>';
    productionRows = [];
    renderEmpty("Belum ada periode pesanan.");
    updateStats();
    return;
  }

  select.innerHTML = data.map(period => {
    const label = escapeHTML(period.name || "Periode tanpa nama");

    return `
      <option value="${escapeHTML(period.id)}">
        ${label}
      </option>
    `;
  }).join("");

  currentPeriodId = select.value;

  await loadProduction();
}

// =====================================================
// MEMUAT TARGET PRODUKSI
// =====================================================

async function loadProduction() {
  if (isLoading) return;

  const periodId = $("periodSelect").value;

  currentPeriodId = periodId;

  hideMessage();

  if (!periodId) {
    productionRows = [];
    renderEmpty("Silakan pilih periode pesanan.");
    updateStats();
    return;
  }

  isLoading = true;

  $("productionBody").innerHTML = `
    <div class="loading-state">
      <div class="loader"></div>
      <span>Menghitung target produksi...</span>
    </div>
  `;

  $("emptyState").classList.add("hidden");

  try {

    // Ambil pesanan berdasarkan periode.
    const { data: items, error: itemError } = await db
      .from("order_items")
      .select(`
        product_id,
        product_name,
        quantity,
        orders!inner (
          period_id,
          order_status
        )
      `)
      .eq("orders.period_id", periodId)
      .neq("orders.order_status", "cancelled");

    if (itemError) {
      throw new Error(
        "Gagal mengambil data pesanan: " + itemError.message
      );
    }

    // Gabungkan target produk yang sama.
    const targets = new Map();

    (items || []).forEach(item => {
      const productId = item.product_id;

      if (!productId) return;

      const quantity = Number(item.quantity || 0);

      if (!targets.has(productId)) {
        targets.set(productId, {
          product_id: productId,
          product_name: item.product_name || "Produk tanpa nama",
          target_quantity: 0,
          produced_quantity: 0
        });
      }

      const row = targets.get(productId);

      row.target_quantity += quantity;

      if (!row.product_name && item.product_name) {
        row.product_name = item.product_name;
      }
    });

    // Ambil progres produksi yang tersimpan.
    const { data: progress, error: progressError } = await db
      .from("production_progress")
      .select("product_id,produced_quantity")
      .eq("period_id", periodId);

    if (progressError) {
      throw new Error(
        "Gagal mengambil catatan produksi: " +
        progressError.message +
        ". Pastikan akses tabel production_progress tersedia."
      );
    }

    // Masukkan hasil produksi ke data target.
    (progress || []).forEach(record => {
      const row = targets.get(record.product_id);

      if (row) {
        row.produced_quantity = Number(
          record.produced_quantity || 0
        );
      }
    });

    productionRows = Array.from(targets.values()).sort(
      (a, b) => a.product_name.localeCompare(b.product_name, "id")
    );

    renderProduction();

  } catch (error) {

    showMessage(error.message, "error");

    productionRows = [];
    renderEmpty("Data produksi tidak dapat dimuat.");
    updateStats();

  } finally {
    isLoading = false;
  }
}

// =====================================================
// MENGHITUNG PROGRES PRODUK
// =====================================================

function getProgress(row) {
  const target = Number(row.target_quantity || 0);
  const produced = Number(row.produced_quantity || 0);

  if (target <= 0) return 0;

  return Math.min(
    100,
    Math.round((produced / target) * 100)
  );
}

// =====================================================
// MENAMPILKAN PRODUKSI
// =====================================================

function renderProduction() {
  const body = $("productionBody");

  if (!productionRows.length) {
    renderEmpty("Belum ada pesanan produk pada periode ini.");
    updateStats();
    return;
  }

  $("emptyState").classList.add("hidden");

  $("productCount").textContent =
    productionRows.length + " Produk";

  body.innerHTML = productionRows.map((row, index) => {

    const target = Number(row.target_quantity || 0);
    const produced = Number(row.produced_quantity || 0);

    const remaining = Math.max(0, target - produced);
    const percent = getProgress(row);

    return `
      <article class="production-card">

        <div class="production-card-top">
          <h3>${escapeHTML(row.product_name)}</h3>
          <span class="product-number">
            PRODUK ${String(index + 1).padStart(2, "0")}
          </span>
        </div>

        <div class="production-numbers">

          <div class="production-number-box">
            <span>Target</span>
            <strong>${numberFormat(target)}</strong>
          </div>

          <div class="production-number-box done">
            <span>Diproduksi</span>
            <strong>${numberFormat(produced)}</strong>
          </div>

          <div class="production-number-box left">
            <span>Sisa</span>
            <strong>${numberFormat(remaining)}</strong>
          </div>

        </div>

        <div class="product-progress-heading">
          <span>Progres produksi</span>
          <span class="production-percent">${percent}%</span>
        </div>

        <div class="progress-track">
          <div
            class="progress-fill"
            style="width:${percent}%"
          ></div>
        </div>

        <div class="production-input">

          <div class="input-group">
            <label for="qty-${index}">
              JUMLAH SUDAH DIPRODUKSI
            </label>

            <input
              type="number"
              id="qty-${index}"
              min="0"
              step="1"
              inputmode="numeric"
              value="${produced}"
              aria-label="Jumlah produksi ${escapeHTML(row.product_name)}"
            >
          </div>

          <button
            type="button"
            class="save-button"
            id="save-${index}"
            onclick="saveProduction(${index})"
          >
            Simpan
          </button>

        </div>

      </article>
    `;

  }).join("");

  updateStats();
}

// =====================================================
// MENAMPILKAN KEADAAN KOSONG
// =====================================================

function renderEmpty(message) {
  $("productionBody").innerHTML = "";

  $("emptyState").innerHTML = `
    <div class="empty-icon">▤</div>
    <strong>Belum ada data produksi</strong>
    <p>${escapeHTML(message)}</p>
  `;

  $("emptyState").classList.remove("hidden");

  $("productCount").textContent = "0 Produk";
}

// =====================================================
// MEMPERBARUI RINGKASAN
// =====================================================

function updateStats() {

  const target = productionRows.reduce(
    (sum, row) => sum + Number(row.target_quantity || 0),
    0
  );

  const produced = productionRows.reduce(
    (sum, row) => sum + Number(row.produced_quantity || 0),
    0
  );

  const remaining = productionRows.reduce(
    (sum, row) => sum + Math.max(
      0,
      Number(row.target_quantity || 0) -
      Number(row.produced_quantity || 0)
    ),
    0
  );

  const percent = target > 0
    ? Math.min(100, Math.round((produced / target) * 100))
    : 0;

  $("totalTarget").textContent = numberFormat(target);
  $("totalProduced").textContent = numberFormat(produced);
  $("totalRemaining").textContent = numberFormat(remaining);

  $("overallPercent").textContent = percent + "%";
  $("overallProgress").style.width = percent + "%";

  $("overallProducedText").textContent =
    numberFormat(produced) + " produk selesai";

  $("overallTargetText").textContent =
    "Target " + numberFormat(target) + " produk";
}

// =====================================================
// SIMPAN PRODUKSI
// =====================================================

async function saveProduction(index) {

  const row = productionRows[index];

  if (!row || !currentPeriodId) return;

  const input = $("qty-" + index);
  const button = $("save-" + index);

  if (!input || !button) return;

  const value = Number(input.value);

  if (!Number.isInteger(value) || value < 0) {
    showMessage(
      "Jumlah produksi harus berupa angka bulat minimal 0.",
      "error"
    );

    input.focus();
    return;
  }

  // Cegah klik berulang.
  button.disabled = true;
  button.textContent = "Menyimpan...";

  input.disabled = true;

  try {

    const { error } = await db
      .from("production_progress")
      .upsert({
        period_id: currentPeriodId,
        product_id: row.product_id,
        produced_quantity: value,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "period_id,product_id"
      });

    if (error) {
      throw error;
    }

    row.produced_quantity = value;

    showMessage(
      "Catatan produksi " + row.product_name +
      " berhasil disimpan.",
      "success"
    );

    // Perbarui tampilan setelah berhasil disimpan.
    renderProduction();

  } catch (error) {

    showMessage(
      "Gagal menyimpan produksi: " + error.message,
      "error"
    );

    button.disabled = false;
    button.textContent = "Simpan";

    input.disabled = false;
  }
}

// =====================================================
// LOGOUT
// =====================================================

async function logout() {

  const button = $("logoutBtn");

  button.disabled = true;
  button.textContent = "Sedang keluar...";

  const { error } = await db.auth.signOut();

  if (error) {
    button.disabled = false;
    button.textContent = "↪ Keluar dari akun";

    showMessage(
      "Gagal keluar: " + error.message,
      "error"
    );

    return;
  }

  window.location.href = "index.html";
}

// =====================================================
// EVENT LISTENERS
// =====================================================

function setupEvents() {

  $("periodSelect").addEventListener("change", loadProduction);

  $("refreshBtn").addEventListener("click", loadProduction);

  $("logoutBtn").addEventListener("click", logout);

  setupSidebar();
}

// =====================================================
// MULAI APLIKASI
// =====================================================

async function init() {

  setupEvents();

  if (!db) {
    showMessage(
      "Supabase gagal dimuat. Periksa koneksi internet.",
      "error"
    );

    renderEmpty("Supabase tidak dapat dihubungkan.");
    return;
  }

  const allowed = await checkAdmin();

  if (!allowed) return;

  await loadPeriods();
}

init();
