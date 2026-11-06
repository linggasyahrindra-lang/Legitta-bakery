const SUPABASE_URL="https://araecdddcwgidpzwvsly.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_UNxMd5oFYFo6bPMk6xFUVQ_gudkAtaI";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const show=(id,yes=true)=>$(id).classList.toggle("hidden",!yes);
const note=(id,t)=>{$(id).textContent=t;show(id,true)};
const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n)||0);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let currentRole=null,currentDp=50,productCache=[],periodCache=[],adminOrderCache=[],resellerMapCache={};

const ORDER_STATUSES=[
 {value:"pending",label:"Pending"},
 {value:"confirmed",label:"Dikonfirmasi"},
 {value:"processing",label:"Diproses"},
 {value:"ready",label:"Siap Diambil"},
 {value:"completed",label:"Selesai"},
 {value:"cancelled",label:"Dibatalkan"}
];
function statusLabel(v){return ORDER_STATUSES.find(s=>s.value===String(v||"").toLowerCase())?.label||(v||"Pending")}
function isHistoryOrder(o){return ["completed","cancelled","selesai","dibatalkan"].includes(String(o.order_status||"").toLowerCase())}

let activeSlide=0;
function goSlide(i){
 activeSlide=Math.max(0,Math.min(2,i));
 for(let n=0;n<3;n++)show("adminSlide"+n,n===activeSlide);
 document.querySelectorAll("[data-slide]").forEach(b=>b.classList.toggle("active",Number(b.dataset.slide)===activeSlide));
 $("slideCount").textContent="HALAMAN "+(activeSlide+1)+" DARI 3";
 $("prevSlide").disabled=activeSlide===0;$("nextSlide").disabled=activeSlide===2;
 window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll("[data-slide]").forEach(b=>b.onclick=()=>goSlide(Number(b.dataset.slide)));
$("prevSlide").onclick=()=>goSlide(activeSlide-1);$("nextSlide").onclick=()=>goSlide(activeSlide+1);
let touchStartX=0;
$("adminDashboard").addEventListener("touchstart",e=>{touchStartX=e.changedTouches[0].screenX},{passive:true});
$("adminDashboard").addEventListener("touchend",e=>{const d=e.changedTouches[0].screenX-touchStartX;if(Math.abs(d)>100)goSlide(activeSlide+(d<0?1:-1))},{passive:true});

function resetProductForm(){
 $("productForm").reset();$("productId").value="";$("saveProduct").textContent="Simpan Produk";show("cancelEdit",false);show("editActions",false);
}
async function loadProducts(){
 const {data,error}=await db.from("products").select("id,name,description,price,is_active,created_at").order("created_at",{ascending:false});
 if(error){$("adminProductList").textContent="Gagal memuat produk: "+error.message;$("resellerProductList").textContent="Gagal memuat produk: "+error.message;return}
 const all=data||[];productCache=all;
 $("adminProductList").innerHTML=all.length?all.map(p=>`<div class="item"><div class="topline"><b>${esc(p.name)}</b><span class="pill">${p.is_active?"Aktif":"Nonaktif"}</span></div><div>${money(p.price)}</div><div class="muted">${esc(p.description||"Tidak ada deskripsi")}</div><button data-edit="${esc(p.id)}">Edit</button><button class="secondary" data-toggle="${esc(p.id)}" data-active="${p.is_active}">${p.is_active?"Nonaktifkan":"Aktifkan"}</button></div>`).join(""):"Belum ada produk.";
 const active=all.filter(p=>p.is_active);
 $("resellerProductList").innerHTML=active.length?active.map(p=>`<div class="item"><div class="topline"><div><b>${esc(p.name)}</b><div>${money(p.price)}</div></div><div><label>Jumlah</label><input class="qty" type="number" min="0" step="1" value="0" data-qty="${esc(p.id)}"></div></div><div class="muted">${esc(p.description||"")}</div></div>`).join(""):"Belum ada produk aktif.";
 $("adminProductList").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{
  const p=all.find(x=>String(x.id)===b.dataset.edit);if(!p)return;
  $("productId").value=p.id;$("productName").value=p.name||"";$("productDescription").value=p.description||"";$("productPrice").value=p.price??0;$("saveProduct").textContent="Simpan Perubahan";show("cancelEdit",true);show("editActions",true);window.scrollTo({top:0,behavior:"smooth"});
 });
 $("adminProductList").querySelectorAll("[data-toggle]").forEach(b=>b.onclick=async()=>{
  b.disabled=true;const {error}=await db.from("products").update({is_active:b.dataset.active!=="true"}).eq("id",b.dataset.toggle);
  if(error)note("productMsg","Gagal mengubah status: "+error.message);else{note("productMsg","Status produk berhasil diperbarui.");await loadProducts()}
 });
 $("resellerProductList").querySelectorAll("[data-qty]").forEach(i=>i.addEventListener("input",refreshOrderSummary));refreshOrderSummary();
}
$("productForm").onsubmit=async e=>{
 e.preventDefault();$("saveProduct").disabled=true;const id=$("productId").value;
 const p={name:$("productName").value.trim(),description:$("productDescription").value.trim(),price:Number($("productPrice").value),is_active:true};
 const r=id?await db.from("products").update(p).eq("id",id):await db.from("products").insert(p);
 $("saveProduct").disabled=false;if(r.error){note("productMsg","Gagal menyimpan produk: "+r.error.message);return}
 note("productMsg",id?"Produk berhasil diperbarui.":"Produk berhasil ditambahkan.");resetProductForm();await loadProducts();
};
$("deleteProduct").onclick=async()=>{
 const id=$("productId").value,name=$("productName").value.trim()||"produk ini";if(!id)return;
 if(!confirm(`Yakin ingin menghapus "${name}"? Jika sudah dipakai dalam riwayat pesanan, database mungkin menolak penghapusan.`))return;
 $("deleteProduct").disabled=true;const {error}=await db.from("products").delete().eq("id",id);$("deleteProduct").disabled=false;
 if(error){note("productMsg","Produk tidak dapat dihapus. Kamu masih bisa menonaktifkannya. Detail: "+error.message);return}
 note("productMsg","Produk berhasil dihapus.");resetProductForm();await loadProducts();
};
$("cancelEdit").onclick=resetProductForm;

async function loadStoreSettings(){
 const {data,error}=await db.from("store_settings").select("id,dp_percentage").eq("id",1).maybeSingle();
 if(error){note("dpMsg","Gagal memuat pengaturan DP: "+error.message);return}
 if(data){currentDp=Number(data.dp_percentage);$("dpPercentage").value=currentDp;$("orderDpPercent").textContent=currentDp;refreshOrderSummary()}
 else note("dpMsg","Pengaturan DP belum memiliki data. Pastikan tabel store_settings berisi id 1.");
}
$("saveDp").onclick=async()=>{
 const v=Number($("dpPercentage").value);if(!Number.isFinite(v)||v<0||v>100){note("dpMsg","Masukkan DP antara 0 sampai 100 persen.");return}
 $("saveDp").disabled=true;const {error}=await db.from("store_settings").upsert({id:1,dp_percentage:v,updated_at:new Date().toISOString()},{onConflict:"id"});$("saveDp").disabled=false;
 if(error){note("dpMsg","Gagal menyimpan DP: "+error.message);return}
 currentDp=v;$("orderDpPercent").textContent=v;refreshOrderSummary();note("dpMsg","Pengaturan DP berhasil disimpan: "+v+"%.");
};

function resetPeriodForm(){$("periodForm").reset();$("periodId").value="";$("periodOpen").checked=true;$("savePeriod").textContent="Simpan Periode";show("cancelPeriodEdit",false)}
async function loadPeriods(){
 const {data,error}=await db.from("order_periods").select("id,name,start_date,end_date,is_open,created_at").order("created_at",{ascending:false});
 if(error){$("adminPeriodList").textContent="Gagal memuat periode: "+error.message;$("periods").textContent="Gagal memuat: "+error.message;return}
 const all=data||[];periodCache=all;
 $("adminPeriodList").innerHTML=all.length?all.map(x=>`<div class="item"><div class="topline"><b>${esc(x.name)}</b><span class="pill">${x.is_open?"Dibuka":"Ditutup"}</span></div><div class="muted">${esc(x.start_date||"-")} sampai ${esc(x.end_date||"-")}</div><button data-period-edit="${esc(x.id)}">Edit</button><button class="danger" data-period-delete="${esc(x.id)}">Hapus</button></div>`).join(""):"Belum ada periode.";
 $("periods").textContent=all.length?all.map(x=>`${x.name} (${x.is_open?"Dibuka":"Ditutup"})`).join(" · "):"Belum ada periode pesanan.";
 $("orderPeriod").innerHTML='<option value="">Pilih periode</option>'+all.filter(x=>x.is_open).map(x=>`<option value="${esc(x.id)}">${esc(x.name)} (${esc(x.start_date)} s.d. ${esc(x.end_date)})</option>`).join("");
 $("adminPeriodList").querySelectorAll("[data-period-edit]").forEach(b=>b.onclick=()=>{
  const x=all.find(v=>String(v.id)===b.dataset.periodEdit);if(!x)return;
  $("periodId").value=x.id;$("periodName").value=x.name||"";$("periodStart").value=x.start_date||"";$("periodEnd").value=x.end_date||"";$("periodOpen").checked=!!x.is_open;$("savePeriod").textContent="Simpan Perubahan";show("cancelPeriodEdit",true);window.scrollTo({top:0,behavior:"smooth"});
 });
 $("adminPeriodList").querySelectorAll("[data-period-delete]").forEach(b=>b.onclick=async()=>{
  const x=all.find(v=>v.id===b.dataset.periodDelete);if(!x||!confirm(`Yakin ingin menghapus periode "${x.name}"?`))return;
  b.disabled=true;const {error}=await db.from("order_periods").delete().eq("id",x.id);if(error){b.disabled=false;note("periodMsg","Gagal menghapus periode: "+error.message);return}
  note("periodMsg","Periode berhasil dihapus.");await loadPeriods();
 });
}
$("periodForm").onsubmit=async e=>{
 e.preventDefault();const start=$("periodStart").value,end=$("periodEnd").value;if(end<start){note("periodMsg","Tanggal akhir tidak boleh sebelum tanggal mulai.");return}
 const id=$("periodId").value,p={name:$("periodName").value.trim(),start_date:start,end_date:end,is_open:$("periodOpen").checked};
 $("savePeriod").disabled=true;const r=id?await db.from("order_periods").update(p).eq("id",id):await db.from("order_periods").insert(p);$("savePeriod").disabled=false;
 if(r.error){note("periodMsg","Gagal menyimpan periode: "+r.error.message);return}
 note("periodMsg",id?"Periode berhasil diperbarui.":"Periode berhasil ditambahkan.");resetPeriodForm();await loadPeriods();
};
$("cancelPeriodEdit").onclick=resetPeriodForm;

/* MANAJEMEN RESELLER */
async function loadResellers(){
 $("resellerList").textContent="Memuat reseller…";
 const {data,error}=await db.from("profiles").select("id,full_name,phone,role,reseller_code,is_active,created_at").eq("role","reseller").order("created_at",{ascending:false});
 if(error){$("resellerList").textContent="Gagal memuat reseller: "+error.message;return}
 const list=data||[];if(!list.length){$("resellerList").textContent="Belum ada reseller terdaftar.";return}
 $("resellerList").innerHTML=list.map(r=>`<div class="item"><div class="topline"><b>${esc(r.full_name)}</b><span class="pill">${r.is_active?"Aktif":"Nonaktif"}</span></div><div class="muted">Kode reseller: ${esc(r.reseller_code||"-")}</div><div class="muted">No. HP: ${esc(r.phone||"-")}</div><button class="${r.is_active?"danger":"secondary"}" data-reseller-toggle="${esc(r.id)}" data-active="${r.is_active}">${r.is_active?"Nonaktifkan":"Aktifkan"}</button><button class="danger" data-reseller-delete="${esc(r.id)}">Hapus Permanen</button></div>`).join("");
 $("resellerList").querySelectorAll("[data-reseller-toggle]").forEach(b=>b.onclick=async()=>{
  const next=b.dataset.active!=="true";if(!confirm(`Yakin ingin ${next?"mengaktifkan":"menonaktifkan"} reseller ini?`))return;
  b.disabled=true;const {error}=await db.from("profiles").update({is_active:next}).eq("id",b.dataset.resellerToggle).eq("role","reseller");
  if(error){b.disabled=false;note("resellerMsg","Gagal mengubah status: "+error.message);return}
  note("resellerMsg","Status reseller berhasil diperbarui.");await loadResellers();
 });
 $("resellerList").querySelectorAll("[data-reseller-delete]").forEach(b=>b.onclick=async()=>{
  const id=b.dataset.resellerDelete;
  if(!confirm("PERINGATAN HAPUS PERMANEN!\n\nAkun login dan profil reseller akan dihapus.\nReseller yang memiliki riwayat pesanan tidak dapat dihapus.\n\nTindakan ini tidak dapat dibatalkan.\n\nLanjutkan?"))return;
  b.disabled=true;b.textContent="Menghapus…";
  const {data,error}=await db.functions.invoke("smooth-processor",{body:{reseller_id:id}});
  if(error||data?.error||!data?.success){b.disabled=false;b.textContent="Hapus Permanen";note("resellerMsg","Gagal menghapus reseller: "+(error?.message||data?.error||"Penghapusan gagal."));return}
  note("resellerMsg","Reseller berhasil dihapus permanen.");await loadResellers();
 });
}
$("resellerForm").onsubmit=async e=>{
 e.preventDefault();const p={name:$("resellerName").value.trim(),email:$("resellerEmail").value.trim(),phone:$("resellerPhone").value.trim(),password:$("resellerPassword").value};
 if(p.password.length<8){note("resellerMsg","Password minimal 8 karakter.");return}
 $("createResellerBtn").disabled=true;note("resellerMsg","Sedang membuat akun reseller…");
 const {data,error}=await db.functions.invoke("bright-responder",{body:p});$("createResellerBtn").disabled=false;
 if(error||data?.error){note("resellerMsg","Gagal membuat reseller: "+(error?.message||data?.error));return}
 $("resellerForm").reset();note("resellerMsg","Akun reseller berhasil dibuat!\nNama: "+(data.reseller?.name||p.name)+"\nEmail: "+(data.reseller?.email||p.email)+"\nKode reseller: "+(data.reseller?.reseller_code||"-")+"\nBerikan email dan password awal kepada reseller.");await loadResellers();
};

/* PESANAN RESELLER */
function refreshOrderSummary(){
 let total=0;productCache.filter(p=>p.is_active).forEach(p=>{const i=$("resellerProductList").querySelector(`[data-qty="${p.id}"]`);total+=Math.max(0,Math.floor(Number(i?.value)||0))*Number(p.price||0)});
 const dp=Math.round(total*currentDp/100);$("orderTotal").textContent=money(total);$("orderDp").textContent=money(dp);$("orderRemaining").textContent=money(total-dp);
}
async function submitResellerOrder(e){
 e.preventDefault();const periodId=$("orderPeriod").value,pickupDate=$("pickupDate").value,period=periodCache.find(p=>String(p.id)===String(periodId));
 if(!period){note("orderMsg","Pilih periode pesanan yang tersedia.");return}
 if(!period.is_open){note("orderMsg","Periode pesanan sudah ditutup.");return}
 if(!pickupDate){note("orderMsg","Pilih tanggal pengambilan.");return}
 if(pickupDate<period.start_date||pickupDate>period.end_date){note("orderMsg","Tanggal pengambilan harus berada dalam periode pesanan.");return}
 const items=[];
 for(const p of productCache.filter(x=>x.is_active)){
  const i=$("resellerProductList").querySelector(`[data-qty="${p.id}"]`),q=Math.max(0,Math.floor(Number(i?.value)||0));
  if(q>0)items.push({product_id:p.id,product_name:p.name,quantity:q,unit_price:Number(p.price)});
 }
 if(!items.length){note("orderMsg","Pilih minimal satu produk dan jumlahnya.");return}
 const total=items.reduce((s,x)=>s+x.quantity*x.unit_price,0),dpAmount=Math.round(total*currentDp/100);
 if(!confirm(`Kirim pesanan dengan total ${money(total)} dan DP ${money(dpAmount)}?`))return;
 $("submitOrder").disabled=true;note("orderMsg","Sedang mengirim pesanan…");
 const {data:{user},error:userError}=await db.auth.getUser();
 if(userError||!user){$("submitOrder").disabled=false;note("orderMsg","Sesi login tidak ditemukan. Silakan login ulang.");return}
 const orderNumber="LGT-"+Date.now();
 const {data:order,error:orderError}=await db.from("orders").insert({order_number:orderNumber,reseller_id:user.id,period_id:periodId,pickup_date:pickupDate,total_amount:total,dp_percentage:currentDp,dp_amount:dpAmount,paid_amount:0,payment_status:"unpaid",order_status:"pending",notes:$("orderNotes").value.trim()}).select("id").single();
 if(orderError){$("submitOrder").disabled=false;note("orderMsg","Pesanan gagal dibuat: "+orderError.message);return}
 const {error:itemError}=await db.from("order_items").insert(items.map(x=>({order_id:order.id,product_id:x.product_id,product_name:x.product_name,quantity:x.quantity,unit_price:x.unit_price})));
 $("submitOrder").disabled=false;
 if(itemError){note("orderMsg","Nomor pesanan "+orderNumber+" sudah tercatat, tetapi detail produk gagal disimpan. Jangan kirim ulang. Hubungi admin. Detail: "+itemError.message);return}
 $("orderForm").reset();$("resellerProductList").querySelectorAll("[data-qty]").forEach(i=>i.value=0);refreshOrderSummary();
 note("orderMsg","Pesanan berhasil dikirim!\nNomor pesanan: "+orderNumber+"\nTotal: "+money(total)+"\nDP: "+money(dpAmount));await loadMyOrders();
}
$("orderForm").onsubmit=submitResellerOrder;
$("resellerProductList").addEventListener("input",refreshOrderSummary);

/* PEMBAYARAN RESELLER */
const paymentStatusLabel=s=>({pending:"Menunggu Verifikasi",approved:"Disetujui",rejected:"Ditolak"}[s]||s||"-");
async function loadMyOrders(){
 const {data:orders,error}=await db.from("orders").select("*").order("created_at",{ascending:false}).limit(30);
 if(error){$("orders").textContent="Gagal memuat pesanan: "+error.message;return}
 const list=orders||[];
 if(!list.length){$("orders").textContent="Belum ada pesanan.";return}
 const ids=list.map(o=>o.id);
 const {data:payments,error:payError}=await db.from("payments").select("id,order_id,amount,payment_method,proof_url,verification_status,paid_at,created_at").in("order_id",ids).order("created_at",{ascending:false});
 if(payError){$("orders").textContent="Gagal memuat pembayaran: "+payError.message;return}
 const grouped={};(payments||[]).forEach(p=>(grouped[p.order_id]??=[]).push(p));
 $("orders").innerHTML=list.map(o=>{
  const ps=grouped[o.id]||[],paid=Number(o.paid_amount)||0,total=Number(o.total_amount)||0,remaining=Math.max(0,total-paid);
  const pending=ps.filter(p=>p.verification_status==="pending").reduce((s,p)=>s+Number(p.amount),0);
  const available=Math.max(0,remaining-pending);
  return `<div class="item">
   <div class="topline"><b>${esc(o.order_number)}</b><span class="pill">${esc(statusLabel(o.order_status))}</span></div>
   <div class="money-summary">
    <div class="detail-row"><span>Total pesanan</span><b>${money(total)}</b></div>
    <div class="detail-row"><span>DP (${esc(o.dp_percentage)}%)</span><span>${money(o.dp_amount)}</span></div>
    <div class="detail-row"><span>Sudah disetujui</span><b>${money(paid)}</b></div>
    <div class="detail-row"><span>Menunggu verifikasi</span><span>${money(pending)}</span></div>
    <div class="detail-row"><b>Sisa tagihan</b><b>${money(remaining)}</b></div>
    <div class="detail-row"><span>Status pembayaran</span><b>${esc(o.payment_status||"unpaid")}</b></div>
   </div>
   <h3 style="margin-top:12px">Riwayat Pembayaran</h3>
   ${ps.length?ps.map(p=>`<div class="payment-box"><div class="topline"><b>${money(p.amount)}</b><span class="pill">${esc(paymentStatusLabel(p.verification_status))}</span></div><div class="muted">Metode: ${p.payment_method==="transfer"?"Transfer":p.payment_method==="cash"?"Cash":esc(p.payment_method)}</div><div class="muted">Tanggal: ${esc(p.created_at||"-")}</div></div>`).join(""):'<p class="muted">Belum ada pembayaran.</p>'}
   ${remaining>0&&o.order_status!=="cancelled"&&available>0?`
    <div class="payment-box">
     <h3>Kirim Pembayaran</h3>
     <div class="muted">Nominal maksimal yang bisa diajukan sekarang: ${money(available)}</div>
     <label>Nominal pembayaran</label><input type="number" min="1" max="${available}" step="1" id="payAmount-${esc(o.id)}" placeholder="Masukkan nominal">
     <label>Metode pembayaran</label><select id="payMethod-${esc(o.id)}"><option value="transfer">Transfer bank</option><option value="cash">Cash / Tunai</option></select>
     <div id="proofWrap-${esc(o.id)}"><label>Upload bukti transfer (gambar maks. 5 MB)</label><input id="proof-${esc(o.id)}" type="file" accept="image/*"></div>
     <button class="small-button" data-submit-payment="${esc(o.id)}">Kirim Pembayaran</button>
     <div class="payment-status" id="payMsg-${esc(o.id)}"></div>
    </div>`:remaining<=0?'<p class="muted">Pembayaran sudah lunas.</p>':pending>0?'<p class="muted">Pengajuan pembayaran sedang menunggu verifikasi.</p>':'<p class="muted">Pembayaran tidak tersedia untuk pesanan ini.</p>'}
  </div>`;
 }).join("");
 list.forEach(o=>{
  const method=$("payMethod-"+o.id);if(!method)return;
  method.onchange=()=>show("proofWrap-"+o.id,method.value==="transfer");
 });
 $("orders").querySelectorAll("[data-submit-payment]").forEach(b=>b.onclick=()=>submitPayment(b.dataset.submitPayment,b));
}
async function submitPayment(orderId,button){
 const msg=$("payMsg-"+orderId),amount=Number($("payAmount-"+orderId).value),method=$("payMethod-"+orderId).value;
 if(!Number.isFinite(amount)||amount<=0){msg.textContent="Masukkan nominal pembayaran yang benar.";return}
 let proofPath=null;
 button.disabled=true;msg.textContent="Sedang mengirim pembayaran…";
 try{
  const {data:{user},error:userError}=await db.auth.getUser();
  if(userError||!user)throw new Error("Sesi login berakhir. Silakan login ulang.");
  if(method==="transfer"){
   const file=$("proof-"+orderId).files[0];
   if(!file)throw new Error("Bukti transfer wajib diunggah.");
   if(!file.type.startsWith("image/"))throw new Error("File bukti harus berupa gambar.");
   if(file.size>5*1024*1024)throw new Error("Ukuran gambar maksimal 5 MB.");
   const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
   proofPath=`${user.id}/${orderId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
   const {error:uploadError}=await db.storage.from("payment-proofs").upload(proofPath,file,{cacheControl:"3600",upsert:false,contentType:file.type});
   if(uploadError)throw uploadError;
  }
  const {error}=await db.from("payments").insert({order_id:orderId,amount,payment_method:method,proof_url:proofPath,verification_status:"pending"});
  if(error)throw error;
  alert("Pengajuan pembayaran berhasil dikirim. Tunggu verifikasi admin.");
  await loadMyOrders();
 }catch(e){msg.textContent="Gagal: "+(e.message||e);button.disabled=false}
}

/* ADMIN: PESANAN, PEMBAYARAN DAN RIWAYAT */
async function loadAdminOrders(){
 $("activeOrderList").textContent="Memuat pesanan aktif…";$("historyOrderList").textContent="Memuat riwayat…";show("adminOrderMsg",false);
 const {data:orders,error}=await db.from("orders").select("id,order_number,reseller_id,period_id,pickup_date,total_amount,dp_percentage,dp_amount,paid_amount,payment_status,order_status,notes,created_at").order("created_at",{ascending:false});
 if(error){$("activeOrderList").textContent="Gagal memuat pesanan: "+error.message;$("historyOrderList").textContent="Gagal memuat riwayat: "+error.message;return}
 adminOrderCache=orders||[];const ids=[...new Set(adminOrderCache.map(o=>o.reseller_id).filter(Boolean))];resellerMapCache={};
 if(ids.length){const {data}=await db.from("profiles").select("id,full_name,phone").in("id",ids);(data||[]).forEach(r=>resellerMapCache[r.id]=r)}
 renderAdminOrderLists();
}
function orderCard(o,history=false){
 const reseller=resellerMapCache[o.reseller_id],period=periodCache.find(p=>String(p.id)===String(o.period_id));
 const paid=Number(o.paid_amount)||0,total=Number(o.total_amount)||0,remaining=Math.max(0,total-paid);
 const canDelete=!history&&String(o.payment_status||"").toLowerCase()==="unpaid"&&paid<=0;
 return `<div class="item">
  <div class="topline"><b>${esc(o.order_number||"Pesanan tanpa nomor")}</b><span class="pill">${esc(statusLabel(o.order_status))}</span></div>
  <div style="margin-top:8px"><b>${esc(reseller?.full_name||"Reseller tidak ditemukan")}</b></div>
  <div class="muted">HP: ${esc(reseller?.phone||"-")}</div><div class="muted">Periode: ${esc(period?.name||"Periode tidak ditemukan")}</div><div class="muted">Tanggal pengambilan: ${esc(o.pickup_date||"-")}</div>
  <div class="money-summary">
   <div class="detail-row"><span>Total pesanan</span><b>${money(total)}</b></div>
   <div class="detail-row"><span>DP (${esc(o.dp_percentage??0)}%)</span><span>${money(o.dp_amount)}</span></div>
   <div class="detail-row"><span>Sudah dibayar</span><span>${money(paid)}</span></div>
   <div class="detail-row"><b>Sisa tagihan</b><b>${money(remaining)}</b></div>
   <div class="detail-row"><span>Status pembayaran</span><b>${esc(o.payment_status||"-")}</b></div>
  </div>
  ${!history?`<label>Ubah status pesanan</label><select class="status-select" data-order-status="${esc(o.id)}">${ORDER_STATUSES.map(s=>`<option value="${s.value}" ${String(o.order_status||"pending").toLowerCase()===s.value?"selected":""}>${s.label}</option>`).join("")}</select>`:""}
  <div class="topline" style="margin-top:8px">
   <button class="small-button" data-order-detail="${esc(o.id)}">Lihat Detail</button>
   ${!history&&remaining>0&&o.order_status!=="cancelled"?`<button class="small-button" data-cash-payment="${esc(o.id)}">Catat Cash</button>`:""}
   ${canDelete?`<button class="danger small-button" data-order-delete="${esc(o.id)}">Hapus Pesanan</button>`:""}
  </div>
  <div id="orderDetail-${esc(o.id)}" class="order-detail hidden"></div>
 </div>`;
}
function renderAdminOrderLists(){
 const active=adminOrderCache.filter(o=>!isHistoryOrder(o)),history=adminOrderCache.filter(isHistoryOrder);
 $("activeOrderList").innerHTML=active.length?active.map(o=>orderCard(o,false)).join(""):"Tidak ada pesanan aktif saat ini.";
 $("historyOrderList").innerHTML=history.length?history.map(o=>orderCard(o,true)).join(""):"Belum ada riwayat pesanan.";
 attachOrderActions();filterHistory();
}
async function showAdminOrderDetail(id,button){
 const target=$("orderDetail-"+id);
 if(!target)return;
 if(!target.classList.contains("hidden")){show(target.id,false);button.textContent="Lihat Detail";return}
 button.disabled=true;button.textContent="Memuat…";target.innerHTML='<div class="muted">Memuat detail…</div>';show(target.id,true);
 const [items,payments]=await Promise.all([
  db.from("order_items").select("id,product_name,quantity,unit_price,subtotal").eq("order_id",id),
  db.from("payments").select("id,amount,payment_method,proof_url,verification_status,paid_at,created_at").eq("order_id",id).order("created_at",{ascending:false})
 ]);
 let html="<h3>Detail Produk</h3>";
 if(items.error)html+=`<div class="status">Gagal memuat produk: ${esc(items.error.message)}</div>`;
 else if(!items.data?.length)html+='<p class="muted">Belum ada detail produk.</p>';
 else html+=items.data.map(x=>`<div class="detail-row"><span>${esc(x.product_name)} × ${esc(x.quantity)}</span><b>${money(x.subtotal??Number(x.quantity)*Number(x.unit_price))}</b></div>`).join("");
 html+='<h3 style="margin-top:16px">Riwayat Pembayaran</h3>';
 if(payments.error)html+=`<div class="status">Gagal memuat pembayaran: ${esc(payments.error.message)}</div>`;
 else if(!payments.data?.length)html+='<p class="muted">Belum ada pembayaran.</p>';
 else{
  for(const p of payments.data){
   let proof="";
   if(p.proof_url){
    if(/^https?:\/\//i.test(p.proof_url))proof=`<a href="${esc(p.proof_url)}" target="_blank" rel="noopener">Buka bukti pembayaran</a>`;
    else{
     const {data:signed,error:signedError}=await db.storage.from("payment-proofs").createSignedUrl(p.proof_url,300);
     proof=signedError?'<span class="muted">Bukti tidak dapat dibuka</span>':`<a href="${esc(signed.signedUrl)}" target="_blank" rel="noopener">Buka bukti transfer</a>`;
    }
   }else proof='<span class="muted">Tidak ada bukti (cash)</span>';
   html+=`<div class="payment-box">
    <div class="topline"><b>${money(p.amount)}</b><span class="pill">${esc(paymentStatusLabel(p.verification_status))}</span></div>
    <div class="muted">Metode: ${p.payment_method==="transfer"?"Transfer":p.payment_method==="cash"?"Cash":esc(p.payment_method||"-")}</div>
    <div class="muted">Tanggal: ${esc(p.created_at||"-")}</div>
    <div style="margin-top:7px">${proof}</div>
    ${p.verification_status==="pending"?`<div class="payment-actions"><button class="small-button" data-verify-payment="${esc(p.id)}" data-approve="true">Setujui</button><button class="danger small-button" data-verify-payment="${esc(p.id)}" data-approve="false">Tolak</button></div>`:""}
   </div>`;
  }
 }
 target.innerHTML=html;button.disabled=false;button.textContent="Tutup Detail";
 target.querySelectorAll("[data-verify-payment]").forEach(b=>b.onclick=async()=>{
  const approve=b.dataset.approve==="true";
  const msg=approve?"Setujui pembayaran ini? Pastikan bukti transfer sudah diperiksa atau uang cash benar-benar sudah diterima.":"Tolak pembayaran ini?";
  if(!confirm(msg))return;
  b.disabled=true;
  const {data,error}=await db.rpc("admin_verify_payment",{p_payment_id:b.dataset.verifyPayment,p_approve:approve});
  if(error){alert("Gagal memproses pembayaran: "+error.message);b.disabled=false;return}
  if(data?.success===false){alert(data.error||"Pembayaran gagal diproses.");b.disabled=false;return}
  alert(approve?"Pembayaran berhasil disetujui.":"Pembayaran berhasil ditolak.");
  await loadAdminOrders();await loadMyOrders();
 });
}
function attachOrderActions(){
 document.querySelectorAll("[data-order-status]").forEach(s=>s.onchange=async()=>{
  const id=s.dataset.orderStatus,order=adminOrderCache.find(o=>String(o.id)===String(id));if(!order)return;
  const old=order.order_status||"pending",next=s.value;
  if(!confirm("Ubah status pesanan "+order.order_number+" menjadi "+statusLabel(next)+"?")){s.value=old;return}
  s.disabled=true;const {error}=await db.from("orders").update({order_status:next}).eq("id",id);s.disabled=false;
  if(error){note("adminOrderMsg","Gagal mengubah status: "+error.message);s.value=old;return}
  note("adminOrderMsg","Status pesanan berhasil diubah.");await loadAdminOrders();await loadMyOrders();
 });
 document.querySelectorAll("[data-order-detail]").forEach(b=>b.onclick=()=>showAdminOrderDetail(b.dataset.orderDetail,b));
 document.querySelectorAll("[data-order-delete]").forEach(b=>b.onclick=async()=>{
  const id=b.dataset.orderDelete,order=adminOrderCache.find(o=>String(o.id)===String(id));if(!order)return;
  if(!confirm("Yakin ingin menghapus pesanan "+order.order_number+"? Penghapusan hanya diizinkan jika belum ada pembayaran."))return;
  b.disabled=true;b.textContent="Menghapus…";
  const {data,error}=await db.rpc("admin_delete_unpaid_order",{p_order_id:id});
  if(error||data?.success===false||data?.error){b.disabled=false;b.textContent="Hapus Pesanan";note("adminOrderMsg","Gagal menghapus pesanan: "+(error?.message||data?.error||data?.message||"Tidak memenuhi syarat."));return}
  note("adminOrderMsg","Pesanan berhasil dihapus.");await loadAdminOrders();await loadMyOrders();
 });
 document.querySelectorAll("[data-cash-payment]").forEach(b=>b.onclick=async()=>{
  const id=b.dataset.cashPayment,order=adminOrderCache.find(o=>String(o.id)===String(id));if(!order)return;
  const {data:pending,error:pendingError}=await db.from("payments").select("id").eq("order_id",id).eq("payment_method","cash").eq("verification_status","pending");
  if(pendingError){alert("Tidak dapat memeriksa pembayaran tertunda: "+pendingError.message);return}
  if(pending?.length){alert("Ada pengajuan cash yang masih menunggu verifikasi. Buka detail pesanan dan setujui pengajuan tersebut agar tidak tercatat dua kali.");return}
  const remaining=Math.max(0,Number(order.total_amount)-Number(order.paid_amount||0));
  const raw=prompt("Masukkan nominal cash yang benar-benar sudah diterima. Sisa tagihan: "+money(remaining));
  if(raw===null)return;const amount=Number(raw);
  if(!Number.isFinite(amount)||amount<=0||amount>remaining){alert("Nominal tidak valid atau melebihi sisa tagihan.");return}
  if(!confirm("Pastikan uang cash sebesar "+money(amount)+" sudah benar-benar diterima. Lanjutkan?"))return;
  b.disabled=true;
  const {data,error}=await db.rpc("admin_record_cash_payment",{p_order_id:id,p_amount:amount});
  b.disabled=false;
  if(error){alert("Gagal mencatat cash: "+error.message);return}
  if(data?.success===false){alert(data.error||"Gagal mencatat cash.");return}
  alert("Pembayaran cash berhasil dicatat.");await loadAdminOrders();await loadMyOrders();
 });
}
function filterHistory(){
 const q=($("historySearch").value||"").toLowerCase().trim(),filter=$("historyFilter").value;
 const history=adminOrderCache.filter(o=>{
  if(!isHistoryOrder(o))return false;
  const name=resellerMapCache[o.reseller_id]?.full_name||"",text=((o.order_number||"")+" "+name).toLowerCase(),s=String(o.order_status||"").toLowerCase();
  return text.includes(q)&&(!filter||s===filter||(filter==="completed"&&s==="selesai")||(filter==="cancelled"&&s==="dibatalkan"));
 });
 $("historyOrderList").innerHTML=history.length?history.map(o=>orderCard(o,true)).join(""):"Tidak ada riwayat yang cocok dengan pencarian.";
 $("historyOrderList").querySelectorAll("[data-order-detail]").forEach(b=>b.onclick=()=>showAdminOrderDetail(b.dataset.orderDetail,b));
}
$("historySearch").addEventListener("input",filterHistory);$("historyFilter").addEventListener("change",filterHistory);
$("refreshAdminOrders").onclick=loadAdminOrders;$("refreshHistory").onclick=loadAdminOrders;

async function loadDashboard(user){
 show("login",false);show("app",true);
 const {data:profile,error}=await db.from("profiles").select("full_name,role,is_active").eq("id",user.id).maybeSingle();
 if(error){note("dataMsg","Gagal membaca profil: "+error.message);return}
 if(!profile){note("dataMsg","Profil akun belum ditemukan. Periksa tabel profiles.");return}
 if(profile.is_active===false){note("dataMsg","Akun tidak aktif. Hubungi admin.");return}
 currentRole=profile.role;$("welcome").textContent="Halo, "+(profile.full_name||"Pengguna")+"!";$("roleText").textContent="Masuk sebagai: "+profile.role;
 const admin=profile.role==="admin";show("adminDashboard",admin);show("resellerArea",profile.role==="reseller");
 if(!admin&&profile.role!=="reseller"){note("dataMsg","Role akun tidak dikenali. Hubungi admin.");return}
 if(admin)goSlide(0);
 await loadProducts();await loadPeriods();await loadMyOrders();await loadStoreSettings();
 if(admin){await loadResellers();await loadAdminOrders()}
}
$("loginBtn").onclick=async()=>{
 $("loginBtn").disabled=true;note("loginMsg","Sedang masuk…");
 const {data,error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
 $("loginBtn").disabled=false;if(error){note("loginMsg","Login gagal: "+error.message);return}
 show("loginMsg",false);await loadDashboard(data.user);
};
$("logoutBtn").onclick=async()=>{
 await db.auth.signOut();currentRole=null;show("app",false);show("login",true);$("password").value="";
};
(async()=>{
 const {data}=await db.auth.getSession();if(data.session)await loadDashboard(data.session.user);
})();
