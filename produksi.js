
const SUPABASE_URL = "https://araecdddcwgidpzwvsly.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UNxMd5oFYFo6bPMk6xFUVQ_gudkAtaI";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const $ = id => document.getElementById(id);

let productionRows = [];
let selectedPeriod = null;

function message(text, error = false) {
  $("productionMsg").textContent = text;
  $("productionMsg").style.color = error ? "#b94b43" : "#39845a";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

async function fetchAll(queryBuilder) {
  const results = [];
  const pageSize = 1000;

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await queryBuilder
      .range(start, start + pageSize - 1);

    if (error) throw error;

    results.push(...(data || []));

    if (!data || data.length < pageSize) break;
  }

  return results;
}

// Memastikan pengguna sudah login dan merupakan admin
async function checkAdmin() {
  const { data: authData, error: authError } =
    await db.auth.getUser();

  if (authError || !authData.user) {
    throw new Error("Silakan login terlebih dahulu melalui dashboard.");
  }

  const { data: profile, error } = await db
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  if (error) throw error;

  if (profile.role !== "admin") {
    throw new Error("Halaman ini hanya dapat diakses admin.");
  }
}

// Mengambil periode pesanan
async function loadProductionPeriods() {
  const { data, error } = await db
    .from("order_periods")
    .select("id,name,start_date,end_date,is_open")
    .order("start_date", { ascending: false });

  if (error) throw error;

  const select = $("productionPeriod");
  select.innerHTML = "";

  if (!data || data.length === 0) {
    select.innerHTML = '<option value="">Belum ada periode</option>';
    return;
  }

  data.forEach(period => {
    const option = document.createElement("option");
    option.value = period.id;
    option.textContent = period.name;
    select.appendChild(option);
  });

  select.value = data[0].id;
  selectedPeriod = data[0].id;
}

// Mengambil pesanan dan menghitung target produk
async function getProductionTargets(periodId) {
  const orders = await fetchAll(
    db.from("orders")
      .select("id,order_status")
      .eq("period_id", periodId)
      .neq("order_status", "cancelled")
      .order("id")
  );

  if (!orders.length) return [];

  const orderIds = orders.map(order => order.id);
  const itemResults = [];

  // Mengambil item secara bertahap agar aman untuk banyak pesanan
  for (let i = 0; i < orderIds.length; i += 200) {
    const batchIds = orderIds.slice(i, i + 200);

    const items = await fetchAll(
      db.from("order_items")
        .select("product_id,product_name,quantity")
        .in("order_id", batchIds)
        .order("id")
    );

    itemResults.push(...items);
  }

  const grouped = new Map();

  itemResults.forEach(item => {
    const name = item.product_name || "Produk tanpa nama";
    const key = item.product_id
      ? "id:" + item.product_id
      : "name:" + name;

    if (!grouped.has(key)) {
      grouped.set(key, {
        product_id: item.product_id,
        product_name: name,
        target: 0,
        produced: 0
      });
    }

    grouped.get(key).target += Number(item.quantity || 0);
  });

  return Array.from(grouped.values()).sort((a, b) =>
    a.product_name.localeCompare(b.product_name, "id")
  );
}

// Mengambil progres produksi yang sudah tersimpan
async function getSavedProgress(periodId) {
  const { data, error } = await db
    .from("production_progress")
    .select("product_id,produced_quantity")
    .eq("period_id", periodId);

  if (error) throw error;

  return new Map(
    (data || []).map(item => [
      item.product_id,
      Number(item.produced_quantity || 0)
    ])
  );
}

// Menghitung dan menampilkan rekap
function renderProduction() {
  const list = $("productionList");
  list.innerHTML = "";

  const totalTarget = productionRows.reduce(
    (sum, row) => sum + row.target, 0
  );

  const totalDone = productionRows.reduce(
    (sum, row) => sum + row.produced, 0
  );

  const totalRemaining = productionRows.reduce(
    (sum, row) => sum + Math.max(0, row.target - row.produced), 0
  );

  $("productionTotalTarget").textContent = formatNumber(totalTarget);
  $("productionTotalDone").textContent = formatNumber(totalDone);
  $("productionTotalRemaining").textContent = formatNumber(totalRemaining);

  if (!productionRows.length) {
    list.innerHTML =
      '<div class="empty">Belum ada pesanan produk pada periode ini.</div>';
    $("productionSummary").classList.remove("hidden");
    return;
  }

  productionRows.forEach((row, index) => {
    const percent = row.target > 0
      ? Math.min(100, Math.round(row.produced / row.target * 100))
      : 0;

    const remaining = Math.max(0, row.target - row.produced);
    const card = document.createElement("div");
    card.className = "production-card";

    const title = document.createElement("h3");
    title.textContent = row.product_name;

    const numbers = document.createElement("div");
    numbers.className = "production-numbers";
    numbers.textContent =
      `Target: ${formatNumber(row.target)} | ` +
      `Diproduksi: ${formatNumber(row.produced)} | ` +
      `Sisa: ${formatNumber(remaining)}`;

    const track = document.createElement("div");
    track.className = "progress-track";

    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.width = percent + "%";
    track.appendChild(fill);

    const percentText = document.createElement("div");
    percentText.className = "production-percent";
    percentText.textContent = percent + "% selesai";

    card.append(title, numbers, track, percentText);

    if (row.product_id) {
      const inputArea = document.createElement("div");
      inputArea.className = "production-input";

      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.max = String(row.target);
      input.value = String(row.produced);
      input.setAttribute("aria-label", "Jumlah sudah diproduksi");

      const button = document.createElement("button");
      button.textContent = "Simpan";

      button.addEventListener("click", async () => {
        const value = input.value.trim();
        const quantity = Number(value);

        if (
          value === "" ||
          !Number.isSafeInteger(quantity) ||
          quantity < 0 ||
          quantity > row.target
        ) {
          alert("Masukkan jumlah produksi antara 0 dan target.");
          return;
        }

        button.disabled = true;
        button.textContent = "Menyimpan...";

        try {
          const { error } = await db
            .from("production_progress")
            .upsert({
              period_id: selectedPeriod,
              product_id: row.product_id,
              produced_quantity: quantity,
              updated_at: new Date().toISOString()
            }, {
              onConflict: "period_id,product_id"
            });

          if (error) throw error;

          row.produced = quantity;
          renderProduction();
          message("Jumlah produksi berhasil disimpan.");
        } catch (error) {
          console.error(error);
          alert("Gagal menyimpan: " + error.message);
          button.disabled = false;
          button.textContent = "Simpan";
        }
      });

      inputArea.append(input, button);
      card.appendChild(inputArea);
    } else {
      const warning = document.createElement("p");
      warning.className = "message";
      warning.textContent =
        "Produk ini tidak memiliki ID produk, sehingga progresnya belum dapat disimpan.";
      card.appendChild(warning);
    }

    list.appendChild(card);
  });

  $("productionSummary").classList.remove("hidden");
}

// Memuat rekap periode terpilih
async function loadProduction() {
  const periodId = $("productionPeriod").value;

  if (!periodId) {
    message("Pilih periode terlebih dahulu.", true);
    return;
  }

  selectedPeriod = periodId;
  $("refreshProduction").disabled = true;
  message("Sedang menghitung pesanan...");

  try {
    const [targets, saved] = await Promise.all([
      getProductionTargets(periodId),
      getSavedProgress(periodId)
    ]);

    productionRows = targets.map(row => ({
      ...row,
      produced: row.product_id
        ? (saved.get(row.product_id) || 0)
        : 0
    }));

    renderProduction();
    message("Rekap produksi berhasil dimuat.");
  } catch (error) {
    console.error(error);
    message("Gagal memuat rekap: " + error.message, true);
  } finally {
    $("refreshProduction").disabled = false;
  }
}

// Inisialisasi halaman
async function initProduction() {
  try {
    message("Memeriksa akses admin...");
    await checkAdmin();
    await loadProductionPeriods();

    $("productionPeriod").addEventListener("change", () => {
      selectedPeriod = $("productionPeriod").value;
    });

    $("refreshProduction").addEventListener(
      "click",
      loadProduction
    );

    if (selectedPeriod) {
      await loadProduction();
    } else {
      message("Belum ada periode pesanan.", true);
    }
  } catch (error) {
    console.error(error);
    message(error.message, true);
  }
}

initProduction();
