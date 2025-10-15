

const $ = sel => document.querySelector(sel);
const app = $("#app");
const overlay = $("#overlay");
const modalContent = $("#modal-content");

/* ---------- Security: tiny sanitizer for any injected HTML ---------- */
const SAFE = s => String(s ?? "").replace(/[&<>"'`=\/]/g, c => (
  {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;","/":"&#x2F;","`":"&#x60;","=":"&#x3D;"}[c]
));

/* ---------- Currency (relative to USD) ---------- */
const SYMBOL = { USD:"$", PKR:"₨", GBP:"£", EUR:"€", INR:"₹", BDT:"৳" };
const RATES  = { USD:1, PKR:277, GBP:0.79, EUR:0.92, INR:83, BDT:119 };
function convertFromUSD(amountUSD, currency){
  const cur = currency || STATE.currency || "USD";
  const v = (amountUSD || 0) * (RATES[cur] || 1);
  return Number(v);
}
function fmtMoneyUSDTo(cur, usd){
  const amt = convertFromUSD(usd, cur);
  try{ return new Intl.NumberFormat(undefined,{style:'currency',currency:cur}).format(amt); }
  catch{
    const decimals = (cur==="PKR"||cur==="BDT") ? 0 : 2;
    return `${SYMBOL[cur]||"$"} ${amt.toFixed(decimals)}`;
  }
}

/* ---------- Pricing constants ---------- */
const RENT_DEPOSIT_USD = 1000;          // refundable deposit per rental item
const SHIPPING_FEE_USD = 10;            // (NEW) flat shipping fee at checkout

/* ---------- Availability helpers (NEW) ---------- */
/* Per-product blackout dates (ISO yyyy-mm-dd) */
const RENTAL_BLACKOUTS = {
  "hr-bridal-24": ["2025-10-20","2025-10-22","2025-11-01"],
  "elan-ivory-bridal": [],
  "sana-red-classic": [],
  "nomi-mehndi": [],
  "faiza-pastel": [],
  "mariab-tea-pink": [],
  "hsy-sherwani-gold": [],
  "mnr-emerald-sherwani": [],
  "mk-suit-navy": [],
  "bag-valentino-rockstud": [],
  "bag-gucci-marmont": [],
  "bag-chanel-classic": [],
  "bag-lv-pochette": [],
  "heels-valentino-rockstud": [],
  "heels-jc-romy": [],
  "heels-ysl-opa": []
};
function todayISO(){ const d=new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }
function parseISO(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y, m-1, d); }
function daysBetween(aISO,bISO){
  const a=parseISO(aISO), b=parseISO(bISO);
  // inclusive days (e.g., 1-day rental when start=end)
  return Math.max(0, Math.round((b - a)/(1000*60*60*24)) + 1);
}
function rangeIntersectsBlackout(startISO, endISO, blackouts){
  if(!startISO||!endISO) return false;
  const s=parseISO(startISO), e=parseISO(endISO);
  for(const iso of blackouts||[]){
    const d=parseISO(iso);
    if(d>=s && d<=e) return true;
  }
  return false;
}

/* ---------- App state (persist safe bits only) ---------- */
const STATE = JSON.parse(localStorage.getItem("eco_state")||"{}");
if(STATE.signedIn === undefined) STATE.signedIn = false;
if(!STATE.country){ STATE.country = "USA"; STATE.currency = "USD"; }
if(STATE.emailUpdates === undefined) STATE.emailUpdates = false;
if(STATE.includeTaxes === undefined) STATE.includeTaxes = true;
if(!STATE.profile) STATE.profile = {name:"", address:"", phone:"", email:""};
if(!STATE.cart) STATE.cart = [];
if(!STATE.orders) STATE.orders = [];
if(!STATE.messages) STATE.messages = [];
if(!STATE.wishlist) STATE.wishlist = [];
if(!STATE.payMethod) STATE.payMethod = "card"; // safe to store just the chosen method
save();

// Sensitive payment details kept in-memory only
let PAYMENT = { method: STATE.payMethod || 'card', name:"", number:"", exp:"", cvv:"" };

function save(){ localStorage.setItem("eco_state", JSON.stringify(STATE)); }
function toast(msg){
  const t=$("#toast"); t.textContent=msg; t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),2000);
}
function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test((v||"").trim()); }

/* ---------- Header: button actions ---------- */
$("#btn-country").onclick = () => openCountry();
$("#btn-account").onclick = () => STATE.signedIn ? (location.hash="/account") : openAuth();
$("#btn-settings").onclick = () => openSettings();
$("#btn-wishlist").onclick = () => { location.hash="/wishlist"; };
$("#btn-cart").onclick = () => location.hash="/cart";
$("#btn-messages").onclick = () => { location.hash="/messages"; };
$("#btn-auth").onclick = () => STATE.signedIn
  ? (STATE.signedIn=false, save(), toast("Signed out"), renderHome(), updateHeaderAuth())
  : openAuth();

/* ---------- Modal helpers: focus trap + Esc + restore focus ---------- */
let lastActive = null;
function getFocusable(){
  return modalContent.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
}
function showModal(html, openerBtn){
  lastActive = openerBtn || document.activeElement;
  modalContent.innerHTML=html;
  overlay.style.display="flex";
  overlay.setAttribute("aria-hidden","false");
  openerBtn?.setAttribute('aria-expanded','true');
  const focusables = getFocusable();
  focusables[0]?.focus();
}
function closeModal(){
  overlay.style.display="none";
  overlay.setAttribute("aria-hidden","true");
  document.querySelector('[aria-expanded="true"]')?.setAttribute('aria-expanded','false');
  lastActive?.focus();
}
overlay.addEventListener("click",(e)=>{ if(e.target===overlay) closeModal(); });
window.addEventListener("keydown", e => {
  if(e.key==="Escape" && overlay.style.display==="flex") closeModal();
  if(e.key==="Tab" && overlay.style.display==="flex"){ // trap focus
    const f = [...getFocusable()]; if(!f.length) return;
    const i = f.indexOf(document.activeElement);
    if(e.shiftKey && (i<=0)){ f[f.length-1].focus(); e.preventDefault(); }
    else if(!e.shiftKey && (i===f.length-1)){ f[0].focus(); e.preventDefault(); }
  }
});

/* ---------- Country selector POPUP ---------- */
function openCountry(){
  const opts = [["USA","USD"],["UK","GBP"],["India","INR"],["EU","EUR"],["Pakistan","PKR"],["Bangladesh","BDT"]];
  showModal(`
    <div class="row">
      <h3>Select Country / Currency</h3>
      <button class="close-x" onclick="closeModal()">Close</button>
    </div>
    <div class="grid" style="gap:10px;margin-top:8px">
      ${opts.map(([c,cur])=>
        `<button class="country-btn ${STATE.country===c?'active':''}"
          style="display:flex;align-items:center;justify-content:space-between;border:1px solid var(--line);background:#fff;padding:10px 12px;border-radius:12px;cursor:pointer"
          onclick="setCountry('${c}','${cur}')">
          <span>${c}</span><span class="hint" style="font-size:12px;color:var(--muted)">${cur}</span>
        </button>`).join("")}
    </div>
  `, $("#btn-country"));
}
function setCountry(country, currency){
  STATE.country=country; STATE.currency=currency; save();
  toast(`Country set to ${country} · ${currency}`); closeModal(); route();
}

/* ---------- Settings POPUP ---------- */
function openSettings(){
  showModal(`
    <div class="row">
      <h3>Settings</h3>
      <button class="close-x" onclick="closeModal()">Close</button>
    </div>
    <label class="row" style="justify-content:flex-start;margin:8px 0">
      <input type="checkbox" id="set-email" ${STATE.emailUpdates?'checked':''} />
      <span>Email me order updates</span>
    </label>
    <label class="row" style="justify-content:flex-start;margin:8px 0">
      <input type="checkbox" id="set-taxes" ${STATE.includeTaxes?'checked':''} />
      <span>Show prices with taxes included</span>
    </label>
    <div style="margin-top:10px"><button class="btn btn-primary" onclick="saveSettings()">Save</button></div>
  `, $("#btn-settings"));
}
function saveSettings(){
  STATE.emailUpdates=$("#set-email").checked;
  STATE.includeTaxes=$("#set-taxes").checked;
  save(); toast("Settings saved"); closeModal();
}

/* ---------- Auth POPUP ---------- */
function openAuth(){
  showModal(`
    <div class="row">
      <h3>Login / Create Account</h3>
      <button class="close-x" onclick="closeModal()">Close</button>
    </div>
    <input id="auth-email" class="input" placeholder="Email" style="margin:8px 0" autocomplete="username">
    <input id="auth-pass" class="input" placeholder="Password" type="password" style="margin:8px 0" autocomplete="current-password">
    <div class="row" style="justify-content:flex-start">
      <button class="btn btn-dark" onclick="doLogin()">Login</button>
      <button class="btn btn-primary" onclick="doCreate()">Create Account</button>
    </div>
  `, $("#btn-auth"));
}
function doLogin(){
  const e=$("#auth-email").value, p=$("#auth-pass").value;
  if(!validEmail(e)||!p){ toast("Enter a valid email & password"); return; }
  STATE.signedIn=true;
  if(!STATE.profile.email) STATE.profile.email = e; // capture email into profile
  save(); closeModal(); toast("Welcome back!");
  if(!location.hash || location.hash==="#" || location.hash==="#/" ){ renderHome(); }
  updateHeaderAuth();
}
function doCreate(){ doLogin(); }

/* ---------- Newsletter (used by onclick in footer) ---------- */
function joinNewsletter(){
  const v=$("#newsletter").value;
  if(validEmail(v)){ toast("Thanks for joining!"); $("#newsletter").value=""; }
  else toast("Please enter a valid email");
}

/* ---------- Catalog data  ---------- */
const CATALOG = {
  bridal:[{id:"hr-bridal-24",name:"Hussain Rehar — Bridal Couture ’24",price:2500,rent:250,blurb:"Iconic fuchsia bridal set, worn twice, perfect condition.",seller:{name:"Fatima",email:"fatimaahmed27@gmail.com"},reviews:[{name:"Sara M.",rating:5,text:"Looked exactly like the listing. Fit guidance was spot on and it sparkled in photos."},{name:"Aiman K.",rating:5,text:"Arrived early and carefully packed. Deposit returned the next morning."}]},
          {id:"elan-ivory-bridal",name:"Élan — Ivory Crystal Bridal",price:3000,rent:300,blurb:"Ivory hand-embellished lehenga with crystal work; mint dupatta.",seller:{name:"Mahnoor",email:"mahnoor.s@example.com"},reviews:[{name:"Zoya R.",rating:4.8,text:"Gorgeous crystal work, very light to wear."},{name:"Hira S.",rating:5,text:"So elegant—tons of compliments!"}]},
          {id:"sana-red-classic",name:"Sana Safinaz — Classic Red Bridal",price:2200,rent:220,blurb:"Classic red with antique zardozi; lightweight skirt, rich look.",seller:{name:"Noor",email:"noor.aziz@example.com"},reviews:[{name:"Ayesha T.",rating:4.9,text:"Deep red & antique gold photographed beautifully."}]}],
  traditional:[{id:"nomi-mehndi",name:"Nomi Ansari — Mehndi Lehenga",price:1200,rent:130,blurb:"Vibrant multi-color lehenga, perfect for mehndi.",seller:{name:"Laiba",email:"laiba.k@example.com"},reviews:[{name:"Anum J.",rating:4.8,text:"Colors pop under lights; twirls beautifully."}]},
              {id:"faiza-pastel",name:"Faiza Saqlain — Pastel Pishwas",price:950,rent:110,blurb:"Pastel pishwas with handwork; dreamy twirl.",seller:{name:"Hiba",email:"hiba.b@example.com"},reviews:[{name:"Sidra P.",rating:4.7,text:"Very flattering silhouette; lots of compliments."}]},
              {id:"mariab-tea-pink",name:"Maria B — Tea Pink Formal",price:800,rent:95,blurb:"Tea pink net with pearls; great for dholki/engagement.",seller:{name:"Iqra",email:"iqra.q@example.com"},reviews:[{name:"Nimra S.",rating:4.6,text:"Exactly as described; easy to wear."}]}],
  groom:[{id:"hsy-sherwani-gold",name:"HSY — Gold Sherwani",price:1400,rent:160,blurb:"Classic gold sherwani; regal, fitted silhouette.",seller:{name:"Usman",email:"usman.r@example.com"},reviews:[{name:"Hamza M.",rating:4.8,text:"Tailoring was sharp; looked premium in photos."}]},
         {id:"mnr-emerald-sherwani",name:"MNR — Emerald Sherwani",price:1300,rent:150,blurb:"Emerald brocade; ideal for barat.",seller:{name:"Bilal",email:"bilal.s@example.com"},reviews:[{name:"Faisal K.",rating:4.7,text:"Rich color; comfortable fit."}]},
         {id:"mk-suit-navy",name:"Michael Kors — Navy Suit",price:600,rent:70,blurb:"Tailored two-piece; perfect for reception.",seller:{name:"Ahmad",email:"ahmad.t@example.com"},reviews:[{name:"Rehan D.",rating:4.6,text:"Clean, crisp suit. Looked brand new."}]}],
  bags:[{id:"bag-valentino-rockstud",name:"Valentino Garavani — Rockstud Shoulder",price:1900,rent:90,blurb:"Grain leather with signature studs.",seller:{name:"Areeba",email:"areeba.n@example.com"},reviews:[{name:"Minahil Z.",rating:4.9,text:"Perfect size for events; pristine condition."}]},
        {id:"bag-gucci-marmont",name:"Gucci — GG Marmont Matelassé",price:1700,rent:85,blurb:"Matelassé chevron leather with GG flap.",seller:{name:"Eman",email:"eman.h@example.com"},reviews:[{name:"Komal F.",rating:4.8,text:"Soft leather, goes with everything."}]},
        {id:"bag-chanel-classic",name:"Chanel — Classic Quilted Flap (Medium)",price:5400,rent:150,blurb:"Timeless quilt with chain strap.",seller:{name:"Anaya",email:"anaya.a@example.com"},reviews:[{name:"Haleema Q.",rating:5,text:"Iconic piece, immaculate."}]},
        {id:"bag-lv-pochette",name:"Louis Vuitton — Pochette Métis",price:2600,rent:110,blurb:"Monogram canvas, versatile crossbody.",seller:{name:"Zunaira",email:"zunaira.m@example.com"},reviews:[{name:"Aqsa V.",rating:4.8,text:"Great everyday luxury; secure clasp."}]}],
  heels:[{id:"heels-valentino-rockstud",name:"Valentino — Rockstud Pump 100",price:980,rent:55,blurb:"Pointed toe with signature studs.",seller:{name:"Kiran",email:"kiran.j@example.com"},reviews:[{name:"Rida S.",rating:4.7,text:"Runs a bit narrow; looks stunning."}]},
         {id:"heels-jc-romy",name:"Jimmy Choo — Romy Glitter",price:650,rent:40,blurb:"Classic glitter pump for receptions.",seller:{name:"Misha",email:"misha.k@example.com"},reviews:[{name:"Saba Y.",rating:4.8,text:"Comfortable for hours; glitter doesn’t shed."}]},
         {id:"heels-ysl-opa",name:"Saint Laurent — Opyum Slingback",price:995,rent:60,blurb:"YSL heel logo, sleek slingback.",seller:{name:"Mehak",email:"mehak.l@example.com"},reviews:[{name:"Anila H.",rating:4.7,text:"Elegant and stable; great grip."}]}],
};

/* ---------- Small helpers for UI bits ---------- */
function avgRating(arr){ if(!arr||!arr.length) return 0; const n=arr.reduce((s,r)=>s+Number(r.rating||0),0)/arr.length; return Math.round(n*10)/10; }
function tile(key, icon, title, blurb){
  return `<a class="tile" href="#/category/${key}"><div class="icon" aria-hidden="true">${icon}</div><div style="font-weight:600">${title}</div><div class="muted" style="font-size:14px">${blurb}</div></a>`;
}
function feature(icon,title,lines){
  return `<div class="card"><div class="thumb" style="width:48px;height:48px;border-radius:999px;background:#ecfdf5;border:1px solid var(--line);">${icon}</div><div style="font-weight:600;margin:8px 0 4px">${title}</div><ul style="margin:0;padding-left:18px;color:var(--muted);font-size:14px">${lines.map(l=>`<li>${l}</li>`).join("")}</ul></div>`;
}
function productTile(p){
  const cur=STATE.currency||"USD";
  return `<a class="card soft" href="#/product/${p.id}">
    <div class="portrait shimmer" aria-hidden="true"></div>
    <div style="margin-top:10px;font-weight:700">${p.name}</div>
    <div class="muted" style="font-size:14px">${p.blurb||""}</div>
    <div class="row" style="margin-top:8px">
      <span class="pill">${fmtMoneyUSDTo(cur, p.price)}</span>
      <span class="pill">Rent ${fmtMoneyUSDTo(cur, p.rent)}/day</span>
    </div>
  </a>`;
}

/* ======================= Views ======================= */
function renderHome(){
  const heroTitle = STATE.signedIn ? "Welcome back!" : "Rent Elegance. Resell Style.";
  const showFeatures = !STATE.signedIn;
  app.innerHTML = `
    <section class="hero section">
      <div class="container center">
        <h1>${heroTitle}</h1>
        <p class="muted" style="max-width:760px;margin:10px auto 0">A curated marketplace to rent or resell designer wedding wear, bags, and heels—luxury made accessible. High fashion, low footprint.</p>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="center">Categories</h2>
        <div class="grid" style="grid-template-columns:repeat(5,1fr);gap:14px">
          ${tile("bridal","👰‍♀️","Designer Bridal Dress","Explore curated designer bridal dresses.")}
          ${tile("traditional","🥻","Designer Traditional Wedding Dress","Explore curated designer traditional wedding dresses.")}
          ${tile("bags","👜","Designer Bags","Explore curated luxury bags.")}
          ${tile("heels","👠","Designer Shoes/Heels","Explore curated designer shoes & heels.")}
          ${tile("groom","🤵","Groom Suits & Sherwanis","Explore HSY & MNR sherwanis, suits, waistcoats.")}
        </div>
      </div>
    </section>

    ${ showFeatures ? `
    <section class="section" style="border-top:1px solid var(--line)">
      <div class="container center">
        <h2>Designed for Every Occasion</h2>
        <p class="muted" style="max-width:760px;margin:8px auto 0">Key features that make EcoWear inclusive, easy to use, and perfect for renting or reselling designer pieces.</p>
        <div class="grid g-4" style="margin-top:16px">
          ${feature("🧵","Curated & Authentic",["Verified designers","Clear condition and honest photos"])}
          ${feature("⚡️","Simple & Intuitive",["List or rent in minutes","Clean, fast search & filters","Live availability dates"])}
          ${feature("🔒","Secure & Trusted",["Safe checkout + protections","Reviews and verified profiles","Dispute support"])}
          ${feature("♻️","Sustainable & Circular",["Extend garment life","High fashion, low footprint"])}
        </div>
      </div>
    </section>` : ``}
  `;
  updateHeaderAuth();
}
function updateHeaderAuth(){ $("#btn-auth").textContent = STATE.signedIn ? "Sign out" : "Sign up / Log in"; }

function renderCategory(slug){
  const items = CATALOG[slug]||[];
  const titleMap = {
    bridal:"Designer Bridal Dress", traditional:"Designer Traditional Wedding Dress",
    groom:"Groom Suits & Sherwanis", bags:"Designer Bags", heels:"Designer Shoes/Heels"
  };
  app.innerHTML = `
    <section class="section"><div class="container">
      <div class="row" style="justify-content:space-between;align-items:flex-end">
        <h2 style="margin:0">${titleMap[slug]||"Category"}</h2>
        <a class="pill" href="#/">← Back to Home</a>
      </div>
      ${items.length
        ? `<div class="grid g-3" style="margin-top:14px">${items.map(prod=>productTile(prod)).join("")}</div>`
        : `<div class="card muted" style="margin-top:12px">No items in this category yet.</div>`}
    </div></section>
  `;
}

/* ---------- Product page (original UI) + Availability picker (NEW) ---------- */
function renderProduct(id){
  const product = findProduct(id);
  if(!product){ renderNotFound(); return; }
  const isHR = id==="hr-bridal-24";
  const ratingAvg = avgRating(product.reviews||[]);
  const cur = STATE.currency||"USD";
  const wished = STATE.wishlist.includes(id);
  const blackouts = RENTAL_BLACKOUTS[id] || [];

  app.innerHTML = `
    <section class="section"><div class="container grid g-2" style="align-items:start">
      <div>
        <div class="row">
          <div class="grid" style="gap:10px">${[1,2,3,4,5].map(i=>`<div class="thumb shimmer" aria-hidden="true"></div>`).join("")}</div>
          <div class="portrait shimmer" style="flex:1;min-height:460px" aria-label="Product image placeholder"></div>
        </div>
      </div>
      <div>
        <h1 style="margin:0">${product.name}</h1>
        <div style="margin-top:6px;color:var(--emerald);font-weight:700;font-size:20px">${fmtMoneyUSDTo(cur, product.price)}</div>
        <div class="muted" style="font-size:14px">In stock ${STATE.includeTaxes? '· prices include tax' : '· tax calculated at payment'}</div>

        <h3 style="margin:18px 0 6px">Description</h3>
        <p class="muted" style="color:#334155">
          ${isHR ? "Iconic bridal ensemble from Hussain Rehar’s Bridal Couture ’24 collection. Worn twice, perfect condition, professionally cleaned and stored. Includes dupatta and blouse; tailored for a 26–28\" waist, height 5'4\"–5'7\" with heels. Ideal for barat or reception; lightweight yet richly embellished." : (product.blurb||"Beautiful designer piece in excellent condition, ready to wear.")}
        </p>

        <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:10px">
          ${ STATE.signedIn
            ? `<button class="btn btn-primary" onclick="addBuyToCart('${product.id}')">Add to Cart</button>
               <button class="btn btn-outline" onclick="buyNow('${product.id}')">Buy Now</button>`
            : `<button class="btn btn-dark" onclick="openAuth()">Sign in to Purchase</button>` }
          <button class="btn" style="border:1px solid var(--line)" onclick="toggleWishlist('${product.id}')">${wished?'★ In Wishlist':'☆ Add to Wishlist'}</button>
          <button class="btn" style="border:1px solid var(--line)" onclick="messageSeller('${SAFE(product.seller?.name||"Seller")}','${SAFE(product.seller?.email||"seller@example.com")}')">Message Seller</button>
        </div>

        <!-- Rent calculator + deposit note -->
        <div class="card" style="margin-top:12px">
          <div style="font-weight:600;margin-bottom:6px">Rent this item</div>

          <!-- Availability picker (NEW) -->
          <div class="grid g-2" style="margin-bottom:8px">
            <div>
              <label class="muted" for="avail-start" style="font-size:13px">Start date</label>
              <input id="avail-start" class="input" type="date" min="${todayISO()}">
            </div>
            <div>
              <label class="muted" for="avail-end" style="font-size:13px">End date</label>
              <input id="avail-end" class="input" type="date" min="${todayISO()}">
            </div>
          </div>
          <div class="muted" style="font-size:12px;margin:-4px 0 8px">
            ${blackouts.length ? `Blackout (unavailable): ${blackouts.join(", ")}` : `No blackout dates for this item`}
          </div>

          <div class="row" style="justify-content:flex-start;flex-wrap:wrap;gap:8px">
            <span class="pill">Rate: ${fmtMoneyUSDTo(cur, product.rent)}/day</span>
            <input id="rent-days" class="input" type="number" min="1" value="1" style="width:120px" aria-label="Rental days (auto from dates)">
            <span id="rent-total" class="pill">Total: ${fmtMoneyUSDTo(cur, product.rent)}</span>
            <span class="pill" title="Refunded after return in acceptable condition">+${fmtMoneyUSDTo(cur, RENT_DEPOSIT_USD)} refundable deposit</span>
            <span id="avail-status" class="muted" style="font-size:12px"></span>
            ${ STATE.signedIn ? `<button id="btn-add-rental" class="btn btn-primary" onclick="addRentalToCart('${product.id}')">Add Rental to Cart</button>` : `<button class="btn btn-dark" onclick="openAuth()">Sign in to Rent</button>`}
          </div>
        </div>

        <hr />
        <h3 style="margin:0 0 6px">Seller Information</h3>
        <div class="muted">Sold by: <b>${SAFE(product.seller?.name||"EcoWear Partner")}</b><br/>Email: ${SAFE(product.seller?.email||"seller@example.com")}</div>
      </div>
    </div></section>

    <section class="section"><div class="container">
      <h2 style="margin:0 0 8px">Reviews <span class="muted" style="font-size:16px">(${ratingAvg||"0.0"})</span></h2>
      ${ (product.reviews||[]).map(r=>`
        <div class="card" style="margin-bottom:10px">
          <div class="badge" aria-label="rating">★★★★★ <span class="muted" style="margin-left:6px">${r.rating}</span></div>
          <div style="font-weight:600;margin-top:6px">${SAFE(r.name)}</div>
          <p class="muted" style="margin:6px 0 0">“${SAFE(r.text)}”</p>
        </div>`).join("") || `<div class="card muted">No reviews yet.</div>`}
      <div style="margin-top:14px"><a class="pill" href="javascript:history.back()">← Back</a></div>
    </div></section>
  `;

  // ---- Interactivity for rental days/total + blackout validation (NEW) ----
  const daysInput = $("#rent-days"),
        totalEl = $("#rent-total"),
        startEl = $("#avail-start"),
        endEl = $("#avail-end"),
        statusEl = $("#avail-status"),
        addBtn = $("#btn-add-rental");

  function updateByDays(){
    const d = Math.max(1, parseInt(daysInput.value||"1",10));
    daysInput.value = d;
    totalEl.textContent = `Total: ${fmtMoneyUSDTo(STATE.currency||"USD",(product.rent||0)*d)}`;
  }
  function validateAvailability(){
    const s = startEl.value, e = endEl.value;
    if(!s || !e){ statusEl.textContent=""; addBtn?.removeAttribute("disabled"); return; }
    // inclusive day count from start/end
    const d = Math.max(1, daysBetween(s,e));
    daysInput.value = d; updateByDays();

    const blocked = rangeIntersectsBlackout(s, e, blackouts);
    if(blocked){
      statusEl.textContent = "Selected range includes a blackout date — choose different dates.";
      addBtn?.setAttribute("disabled","disabled");
    }else{
      statusEl.textContent = `Selected ${d} day${d>1?"s":""} (inclusive).`;
      addBtn?.removeAttribute("disabled");
    }
  }
  daysInput?.addEventListener("input", updateByDays);
  startEl?.addEventListener("change", validateAvailability);
  endEl?.addEventListener("change", validateAvailability);
  updateByDays();
}

/* ---------- Messages ----------
   - If signed out: show “Sign in to see your messages.”
   - If signed in: inbox (left) + conversation (right) + quick reply
--------------------------------------------------------------- */
let lastMsgTs = 0;
const UI_MESSAGES = { selectedIndex: 0 };

function renderMessages(){
  if(!STATE.signedIn){
    app.innerHTML = `
      <section class="section"><div class="container">
        <h2 style="margin:0 0 8px">Messages</h2>
        <div class="card muted">Sign in to see your messages.</div>
        <div style="margin-top:10px"><button class="btn btn-dark" onclick="openAuth()">Sign in</button> <a class="pill" href="#/">← Home</a></div>
      </div></section>
    `;
    return;
  }

  const threads = STATE.messages || [];
  const hasThreads = threads.length > 0;
  const sel = Math.min(UI_MESSAGES.selectedIndex, Math.max(0, threads.length-1));
  const active = hasThreads ? threads[sel] : null;

  app.innerHTML = `
    <section class="section">
      <div class="container">
        <div class="row" style="justify-content:space-between;align-items:flex-end">
          <h2 style="margin:0">Messages</h2>
          <a class="pill" href="#/">← Home</a>
        </div>

        <div class="grid g-2" style="margin-top:12px;align-items:start">
          <!-- Inbox (left) -->
          <div class="card">
            <div style="font-weight:600;margin-bottom:8px">Inbox</div>
            ${ hasThreads ? threads.map((t,i)=>`
              <button class="btn" style="width:100%;text-align:left;border:1px solid var(--line);margin:6px 0;background:${i===sel?'#ecfdf5':'#fff'}"
                onclick="(function(){ UI_MESSAGES.selectedIndex=${i}; renderMessages(); })()">
                <div style="font-weight:600">${SAFE(t.with)}</div>
                <div class="muted" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  ${(t.thread[t.thread.length-1]?.me ? 'You: ' : 'Them: ')}${SAFE(t.thread[t.thread.length-1]?.text || '')}
                </div>
              </button>
            `).join("") : `<div class="muted">No messages yet.</div>`}
          </div>

          <!-- Conversation (right) -->
          <div class="card">
            <div style="font-weight:600;margin-bottom:8px">Conversation</div>
            ${ active ? `
              <div class="muted" style="margin-bottom:8px">Chat with <b>${SAFE(active.with)}</b></div>
              <div id="thread" class="card" style="background:#f8fafc;max-height:300px;overflow:auto">
                ${active.thread.map(m=>`
                  <div style="margin:8px 0"><b>${m.me?'You':'Them'}:</b> ${SAFE(m.text)}</div>
                `).join("")}
              </div>
              <div class="row" style="margin-top:10px;gap:8px;align-items:flex-start">
                <input id="msg-input" class="input" placeholder="Type a message…">
                <button class="btn btn-primary" onclick="sendReply(${sel})">Send</button>
              </div>
            ` : `<div class="muted">Select a conversation from the inbox.</div>`}
          </div>
        </div>
      </div>
    </section>
  `;
}
function sendReply(idx){
  const v = ($("#msg-input")?.value || "").trim();
  if(!v) return;
  const threads = STATE.messages || [];
  if(!threads[idx]) return;
  const now = Date.now();
  if(now - lastMsgTs < 800) { toast("Please wait a moment before sending again"); return; }
  lastMsgTs = now;
  threads[idx].thread.push({me:true, text:v, ts:now});
  save();
  renderMessages();
}

/* ---------- Wishlist page  ---------- */
function renderWishlist(){
  const ids = STATE.wishlist||[];
  const items = ids.map(id=>findProduct(id)).filter(Boolean);
  const cur=STATE.currency||"USD";
  app.innerHTML = `
    <section class="section"><div class="container">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">Your Wishlist</h2><a class="pill" href="#/">← Home</a></div>
      ${items.length===0 ? `<div class="card muted" style="margin-top:10px">No items yet. Browse categories and add ☆.</div>` :
        `<div class="grid g-3" style="margin-top:12px">
          ${items.map(p=>`
            <div class="card soft">
              <div class="portrait shimmer" aria-hidden="true"></div>
              <div style="margin-top:10px;font-weight:700">${p.name}</div>
              <div class="muted" style="font-size:14px">${p.blurb||""}</div>
              <div class="row" style="margin-top:8px;justify-content:space-between">
                <span class="pill">${fmtMoneyUSDTo(cur,p.price)}</span>
                <a class="btn btn-primary" href="#/product/${p.id}">View</a>
              </div>
              <div style="margin-top:8px"><button class="btn" style="border:1px solid var(--line)" onclick="toggleWishlist('${p.id}')">Remove</button></div>
            </div>
          `).join("")}
        </div>`}
    </div></section>
  `;
}

/* ---------- Account page: shows shipping line in orders (NEW) ---------- */
function renderAccount(){
  if(!STATE.signedIn){ openAuth(); return; }
  const p = STATE.profile || {name:"",address:"",phone:"",email:""};
  const orders = STATE.orders || [];
  const cur = STATE.currency||"USD";
  app.innerHTML = `
    <section class="section"><div class="container">
      <div class="row" style="justify-content:space-between;align-items:flex-end">
        <h2 style="margin:0">My Account</h2>
        <a class="pill" href="#/">← Home</a>
      </div>
      <div class="grid g-2" style="margin-top:12px">
        <div class="card">
          <div style="font-weight:600;margin-bottom:6px">Profile</div>
          <input id="pf-name" class="input" placeholder="Full Name" value="${SAFE(p.name||'')}" style="margin:6px 0">
          <input id="pf-address" class="input" placeholder="Address" value="${SAFE(p.address||'')}" style="margin:6px 0">
          <input id="pf-email" class="input" placeholder="Email" value="${SAFE(p.email||'')}" style="margin:6px 0">
          <input id="pf-phone" class="input" placeholder="Phone" value="${SAFE(p.phone||'')}" style="margin:6px 0">
          <button class="btn btn-primary" onclick="saveProfile()">Save Profile</button>
        </div>
        <div class="card">
          <div style="font-weight:600;margin-bottom:6px">Order History</div>
          ${orders.length===0 ? `<div class="muted">No orders yet.</div>` :
            orders.map(o=>`
              <div class="card" style="margin-bottom:8px">
                <div><b>Order #${o.id}</b> · ${new Date(o.date).toLocaleString()}</div>
                <div class="muted" style="margin:6px 0">Payment: ${SAFE(String(o.method).toUpperCase())}</div>
                <ul style="margin:6px 0;padding-left:18px">
                  ${o.items.map(it=>`<li>${SAFE(it.name)} ${it.type==='rent' ? `(Rent × ${it.days}d)` : ''} — ${fmtMoneyUSDTo(cur, lineUSD(it))}</li>`).join("")}
                </ul>
                <div>Subtotal: <b>${fmtMoneyUSDTo(cur, o.subtotalUSD)}</b></div>
                <div>Tax (2%): <b>${fmtMoneyUSDTo(cur, o.taxUSD)}</b></div>
                <div>Shipping: <b>${fmtMoneyUSDTo(cur, o.shippingUSD || 0)}</b></div> <!-- NEW -->
                ${o.depositUSD ? `<div>Refundable deposit: <b>${fmtMoneyUSDTo(cur, o.depositUSD)}</b></div>` : ``}
                <div style="font-weight:700">Total: ${fmtMoneyUSDTo(cur, o.totalUSD)}</div>
              </div>
            `).join("")}
        </div>
      </div>
    </div></section>
  `;
}
function saveProfile(){
  STATE.profile={
    name:$("#pf-name").value.trim(),
    address:$("#pf-address").value.trim(),
    email:$("#pf-email").value.trim(),
    phone:$("#pf-phone").value.trim()
  };
  save(); toast("Profile saved");
}

/* ---------- Cart / Checkout / Payment / Confirmation ---------- */
function calcDepositUSD(items){ return (items||[]).filter(it=>it.type==='rent').length * RENT_DEPOSIT_USD; }
function addBuyToCart(id){
  const p=findProduct(id); if(!p){ toast("Item not found"); return; }
  STATE.cart.push({id:p.id,name:p.name,type:'buy',priceUSD:p.price}); save(); toast("Added to cart");
}
function addRentalToCart(id){
  const p=findProduct(id); if(!p){ toast("Item not found"); return; }
  const d = Math.max(1, parseInt(($("#rent-days")?.value)||"1",10));
  STATE.cart.push({id:p.id,name:p.name,type:'rent',rentUSD:p.rent,days:d,totalUSD:(p.rent||0)*d});
  save(); toast(`Rental added (${d} day${d>1?'s':''})`);
}
function buyNow(id){ addBuyToCart(id); location.hash="/cart"; }
function findProduct(id){ for(const list of Object.values(CATALOG)){ const x=list.find(y=>y.id===id); if(x) return x; } return null; }
function lineUSD(it){ return it.type==='rent' ? (it.totalUSD||((it.rentUSD||0)*(it.days||1))) : (it.priceUSD||0); }

function renderCart(){
  const cur=STATE.currency||"USD"; const items=STATE.cart||[];
  const subtotalUSD=items.reduce((s,it)=>s+lineUSD(it),0);
  const depositUSD = calcDepositUSD(items);
  app.innerHTML = `
    <section class="section"><div class="container">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">Cart</h2><a class="pill" href="#/">← Continue shopping</a></div>
      ${items.length===0 ? `<div class="card muted" style="margin-top:10px">Your cart is empty.</div>` : `
        <div class="card" style="margin-top:10px">
          ${items.map((it)=>`
            <div class="row" style="justify-content:space-between;margin:6px 0">
              <div>${SAFE(it.name)} ${it.type==='rent' ? `<span class='pill'>Rent × ${it.days}d</span>` : `<span class='pill'>Buy</span>`}</div>
              <div>${fmtMoneyUSDTo(cur, lineUSD(it))}</div>
            </div>`).join("")}
          <hr/>
          <div class="row" style="justify-content:space-between"><div>Subtotal</div><div><b>${fmtMoneyUSDTo(cur, subtotalUSD)}</b></div></div>
          ${depositUSD ? `<div class="row" style="justify-content:space-between"><div>Refundable deposit (rentals)</div><div><b>${fmtMoneyUSDTo(cur, depositUSD)}</b></div></div>
          <div class="muted" style="margin-top:6px;font-size:13px">Deposit is added at payment and refunded after acceptable return.</div>` : ``}
        </div>
        <div style="margin-top:12px">
          ${STATE.signedIn ? `<button class="btn btn-primary" onclick="goCheckout()">Checkout</button>` : `<button class="btn btn-dark" onclick="openAuth()">Sign in to Checkout</button>`}
          <button class="btn" style="border:1px solid var(--line)" onclick="clearCart()">Clear Cart</button>
        </div>`}
    </div></section>`;
}
function clearCart(){ STATE.cart=[]; save(); renderCart(); }
function goCheckout(){ location.hash="/checkout"; }

/* ---------- Checkout (adds Shipping line: $10 flat) ---------- */
function renderCheckout(){
  const cur=STATE.currency||"USD"; const items=STATE.cart||[];
  const subtotalUSD=items.reduce((s,it)=>s+lineUSD(it),0);
  const depositUSD = calcDepositUSD(items);
  const shippingUSD = items.length ? SHIPPING_FEE_USD : 0; // NEW

  app.innerHTML = `
    <section class="section"><div class="container">
      <h2 style="margin:0 0 8px">Checkout</h2>
      <div class="grid g-2">
        <div class="card">
          <div style="font-weight:600;margin-bottom:6px">Shipping</div>
          <input id="ship-name" class="input" placeholder="Full Name" value="${SAFE(STATE.profile.name||'')}" style="margin:6px 0">
          <input id="ship-address" class="input" placeholder="Address" value="${SAFE(STATE.profile.address||'')}" style="margin:6px 0">
          <input id="ship-phone" class="input" placeholder="Phone" value="${SAFE(STATE.profile.phone||'')}" style="margin:6px 0">
        </div>
        <div class="card">
          <div style="font-weight:600;margin-bottom:6px">Order Summary</div>
          ${items.map(it=>`<div class="row" style="justify-content:space-between"><span>${SAFE(it.name)} ${it.type==='rent'?`(Rent × ${it.days}d)`:''}</span><span>${fmtMoneyUSDTo(cur, lineUSD(it))}</span></div>`).join("")}
          <hr/>
          <div class="row" style="justify-content:space-between"><span>Subtotal</span><span><b>${fmtMoneyUSDTo(cur, subtotalUSD)}</b></span></div>
          <div class="row" style="justify-content:space-between"><span>Shipping</span><span><b>${fmtMoneyUSDTo(cur, shippingUSD)}</b></span></div> <!-- NEW -->
          ${depositUSD ? `<div class="row" style="justify-content:space-between"><span>Refundable deposit (rentals)</span><span><b>${fmtMoneyUSDTo(cur, depositUSD)}</b></span></div>` : ``}
          <div style="margin-top:12px"><button class="btn btn-primary" onclick="goPayment()">Continue to Payment</button></div>
        </div>
      </div>
    </div></section>`;
}

/* ---------- Payment (includes Shipping in totals) ---------- */
function goPayment(){ location.hash="#/payment"; }
function renderPayment(){
  const cur=STATE.currency||"USD"; const items=STATE.cart||[];
  const subtotalUSD=items.reduce((s,it)=>s+lineUSD(it),0);
  const depositUSD = calcDepositUSD(items);
  const shippingUSD = items.length ? SHIPPING_FEE_USD : 0; // NEW
  const taxUSD = STATE.includeTaxes ? +(subtotalUSD*0.02).toFixed(2) : 0;
  const totalUSD = subtotalUSD + taxUSD + depositUSD + shippingUSD; // NEW

  app.innerHTML = `
    <section class="section"><div class="container">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">Payment</h2>
        <a class="pill" href="#/checkout">← Back to Checkout</a>
      </div>
      <div class="grid g-2" style="margin-top:12px">
        <div class="card">
          <div style="font-weight:600;margin-bottom:6px">Payment Method</div>
          <label class="row" style="justify-content:flex-start">
            <input type="radio" name="pm" value="card" ${PAYMENT.method==='card'?'checked':''} onclick="setPaymentMethod('card')">
            <span>Credit / Debit Card</span>
          </label>
          <label class="row" style="justify-content:flex-start">
            <input type="radio" name="pm" value="cod" ${PAYMENT.method==='cod'?'checked':''} onclick="setPaymentMethod('cod')">
            <span>Cash on Delivery (prototype)</span>
          </label>

          <div id="card-fields" style="margin-top:10px;${PAYMENT.method==='card'?'':'display:none'}">
            <input id="pm-name" class="input" placeholder="Name on card" value="" style="margin:6px 0" autocomplete="cc-name">
            <input id="pm-number" class="input" placeholder="Card number (16 digits)" value="" style="margin:6px 0" inputmode="numeric" autocomplete="cc-number">
            <div class="grid g-2">
              <input id="pm-exp" class="input" placeholder="MM/YY" value="" autocomplete="cc-exp">
              <input id="pm-cvv" class="input" placeholder="CVV" value="" inputmode="numeric" autocomplete="cc-csc">
            </div>
          </div>
        </div>

        <div class="card">
          <div style="font-weight:600;margin-bottom:6px">Payable</div>
          <div class="row" style="justify-content:space-between"><span>Subtotal</span><span>${fmtMoneyUSDTo(cur, subtotalUSD)}</span></div>
          <div class="row" style="justify-content:space-between"><span>Tax (2%)</span><span>${fmtMoneyUSDTo(cur, taxUSD)}</span></div>
          <div class="row" style="justify-content:space-between"><span>Shipping</span><span>${fmtMoneyUSDTo(cur, shippingUSD)}</span></div> <!-- NEW -->
          ${depositUSD ? `<div class="row" style="justify-content:space-between"><span>Refundable deposit (rentals)</span><span>${fmtMoneyUSDTo(cur, depositUSD)}</span></div>` : ``}
          <hr/>
          <div class="row" style="justify-content:space-between;font-weight:700"><span>Total</span><span>${fmtMoneyUSDTo(cur, totalUSD)}</span></div>
          <div class="muted" style="margin-top:6px;font-size:13px">Deposit is refunded after the item is returned in acceptable condition.</div>
          <div style="margin-top:12px">
            <button class="btn btn-primary" onclick="placeOrder()">Place Order</button>
          </div>
        </div>
      </div>
    </div></section>
  `;
}
function setPaymentMethod(m){
  PAYMENT.method = m; STATE.payMethod = m; save();
  const el = document.getElementById("card-fields");
  if(el){
    if(m==='card'){ el.style.display = "block"; }
    else { el.style.display = "none"; // clear sensitive fields
      const f = ['pm-name','pm-number','pm-exp','pm-cvv'];
      f.forEach(id=>{ const x=document.getElementById(id); if(x) x.value=''; });
      PAYMENT = { method:m, name:"", number:"", exp:"", cvv:"" };
    }
  }
}
function validateCard(){
  if(PAYMENT.method!=='card') return true;
  const name = ($("#pm-name")?.value||"").trim();
  const num  = ($("#pm-number")?.value||"").replace(/\s+/g,"");
  const exp  = ($("#pm-exp")?.value||"").trim();
  const cvv  = ($("#pm-cvv")?.value||"").trim();
  if(!name || !/^\d{16}$/.test(num) || !/^\d{2}\/\d{2}$/.test(exp) || !/^\d{3,4}$/.test(cvv)){
    toast("Enter valid card details"); return false;
  }
  PAYMENT = {method:"card", name, number:num, exp, cvv};
  return true;
}

/* ---------- Place order: stores shippingUSD on the order (NEW) ---------- */
function placeOrder(){
  const items=STATE.cart||[];
  if(items.length===0){ toast("Cart is empty"); return; }
  if(PAYMENT.method==='card' && !validateCard()) return;

  const subtotalUSD = items.reduce((s,it)=>s+lineUSD(it),0);
  const depositUSD = calcDepositUSD(items);
  const shippingUSD = items.length ? SHIPPING_FEE_USD : 0;              // NEW
  const taxUSD = STATE.includeTaxes ? +(subtotalUSD*0.02).toFixed(2) : 0;
  const totalUSD = subtotalUSD + taxUSD + depositUSD + shippingUSD;     // NEW

  const id=Math.floor(Math.random()*900000+100000);
  STATE.orders.unshift({
    id, items:[...items],
    subtotalUSD, taxUSD, depositUSD, shippingUSD, totalUSD,             // NEW
    method:PAYMENT.method, date:Date.now()
  });
  STATE.cart=[];
  save();
  toast("Order placed!");
  location.hash="/confirm";
}

/* ---------- Confirmation: shows shipping line (NEW) ---------- */
function renderConfirmation(){
  const last = (STATE.orders||[])[0];
  const cur = STATE.currency||"USD";
  if(!last){ renderNotFound(); return; }
  app.innerHTML = `
    <section class="section"><div class="container center">
      <h2 style="margin:0">Order Confirmed</h2>
      <p class="muted">Order #${last.id} · ${new Date(last.date).toLocaleString()}</p>
      <p class="muted">Payment method: <b>${SAFE(String(last.method).toUpperCase())}</b></p>
      <div class="card" style="max-width:560px;margin:12px auto;text-align:left">
        ${last.items.map(it=>`<div class="row" style="justify-content:space-between"><span>${SAFE(it.name)} ${it.type==='rent'?`(Rent × ${it.days}d)`:''}</span><span>${fmtMoneyUSDTo(cur, lineUSD(it))}</span></div>`).join("")}
        <hr/>
        <div class="row" style="justify-content:space-between"><span>Subtotal</span><span>${fmtMoneyUSDTo(cur,last.subtotalUSD)}</span></div>
        <div class="row" style="justify-content:space-between"><span>Tax (2%)</span><span>${fmtMoneyUSDTo(cur,last.taxUSD)}</span></div>
        <div class="row" style="justify-content:space-between"><span>Shipping</span><span>${fmtMoneyUSDTo(cur,last.shippingUSD || 0)}</span></div> <!-- NEW -->
        ${last.depositUSD ? `<div class="row" style="justify-content:space-between"><span>Refundable deposit (rentals)</span><span>${fmtMoneyUSDTo(cur,last.depositUSD)}</span></div>` : ``}
        <div class="row" style="justify-content:space-between;font-weight:700"><span>Total</span><span>${fmtMoneyUSDTo(cur,last.totalUSD)}</span></div>
      </div>
      <div style="margin-top:10px"><a class="pill" href="#/">← Home</a> <a class="pill" href="#/messages">Messages</a> <a class="pill" href="#/account">View in Account</a></div>
    </div></section>`;
}

/* ---------- Wishlist toggle  ---------- */
function toggleWishlist(id){
  const idx = STATE.wishlist.indexOf(id);
  if(idx>-1){ STATE.wishlist.splice(idx,1); toast("Removed from Wishlist"); }
  else { STATE.wishlist.unshift(id); toast("Added to Wishlist"); }
  save();
  if(location.hash.startsWith("#/product/")) renderProduct(id);
  if(location.hash==="#/wishlist") renderWishlist();
}

/* ---------- Message a seller (creates thread) ---------- */
function messageSeller(name,email){
  if(!STATE.signedIn){ openAuth(); return; }
  const now = Date.now();
  if(now - lastMsgTs < 3000){ toast("Please wait a moment before sending again"); return; }
  lastMsgTs = now;
  const key = `${name} <${email}>`;
  let entry = STATE.messages.find(m=>m.with===key);
  if(!entry){ entry = {with:key, thread:[]}; STATE.messages.unshift(entry); }
  entry.thread.push({me:true,text:"Hi! I’m interested in this item.",ts:Date.now()});
  save(); toast("Message sent"); location.hash="/messages";
}

/* ---------- Footer pages + 404  ---------- */
function renderAbout(){ app.innerHTML = `<section class="section"><div class="container" style="max-width:760px"><h2 class="center" style="margin-top:0">About EcoWear</h2><h3>Founder — Sehar Ali</h3><p class="muted">Sehar Ali founded EcoWear to bring the joy of designer fashion to more people while cutting fashion waste. Inspired by South Asian bridal and traditional couture, she saw how once-worn pieces sit in closets after a single event. EcoWear turns those outfits—and premium accessories—into a shared, circular wardrobe that celebrates culture, craft, and smart spending.</p><h3>Our Mission</h3><p class="muted">EcoWear’s mission is to make luxury fashion accessible and sustainable. We extend a garment’s life through renting and responsible resale, so you can wear exceptional pieces without the full retail cost—or the environmental cost. By curating verified designers and clear condition standards, we keep quality high, prices fair, and closets light.</p><p class="muted"><i>Wear what you love, share what you own, and keep beautiful clothes in motion—not in storage.</i></p><div style="margin-top:12px"><a class="pill" href="#/">← Back to Home</a></div></div></section>`; }
function renderFAQ(){ const qa=[["Do I need an account to use EcoWear?","You can browse without an account, but you’ll need one to rent, buy, list, message, or save items. Creating an account also enables reviews and order tracking."],["How do rentals work from start to finish?","Pick your dates, pay the rental fee (and a refundable deposit if required), and the owner ships or arranges pickup. Do not clean the item yourself; owners handle professional cleaning. Return by the due date using the included return label."],["What if the item doesn’t fit or isn’t as described?","Start a Fit/Quality claim within 24 hours of delivery. Keep tags on and return the unworn item for a refund (minus shipping) if the listing was inaccurate or the fit is clearly off from the provided measurements."],["What happens if an item is damaged or returned late?","Normal wear is OK. Significant damage, missing parts, or late returns may be deducted from the deposit per the listing’s policy. Always contact Support immediately so we can help resolve it fairly."],["What currencies do you support?","Prices default to USD and can be viewed in PKR, GBP, EUR, INR, and BDT. For the MVP, checkout is processed in USD; your bank handles conversion at its rate."],["How does shipping/pickup work?","Owners can offer courier shipping or local pickup. Shipping costs and delivery windows are shown at checkout; return labels are provided for rentals. International shipping depends on the item and the owner’s settings."],["When do owners get paid?","For rentals, payouts are released after the item is returned in acceptable condition. For sales, payouts occur after buyer delivery confirmation (or automatic confirmation after a short window). Funds typically arrive in 3–5 business days to your payout method."]]; app.innerHTML = `<section class="section"><div class="container" style="max-width:760px"><h2 class="center" style="margin-top:0">Frequently Asked Questions</h2>${qa.map(([q,a],i)=>`<details class="card" style="margin:10px 0"><summary style="font-weight:600;cursor:pointer">Q${i+1}. ${SAFE(q)}</summary><p class="muted" style="margin-top:6px">${SAFE(a)}</p></details>`).join("")}<div style="margin-top:12px"><a class="pill" href="#/">← Back to Home</a></div></div></section>`; }
function renderReturns(){ app.innerHTML = `<section class="section"><div class="container" style="max-width:760px"><h2 class="center" style="margin-top:0">Return & Exchange Policy</h2><p class="muted">For rentals, start a Fit/Quality claim within 24 hours of delivery if the item doesn’t match the listing or the provided measurements; the garment must be unworn, unaltered, with all tags/security seals attached. Use the included return label and ship by the due date; owners handle professional cleaning—please don’t clean the item yourself. Normal wear is fine; late returns or damage may be deducted from the deposit per the listing’s policy. For purchases (resale), you have a 3-day inspection window from delivery to request a return for items that are misdescribed or have undisclosed flaws; items must be returned in original condition with tags attached (buyer pays return shipping unless we confirm misrepresentation). Exchanges are subject to availability; we’ll help rebook a different size/style and charge or credit any price difference. Non-returnable categories include final-sale items, intimate wear, and custom-altered pieces. To begin, open a case in Orders with clear photos within the required window; we’ll review and share instructions, and approved refunds go back to the original payment method (bank timelines typically 3–5 business days). For cross-border orders, duties/taxes are set by the carrier or customs and are generally non-refundable by EcoWear.</p><div style="margin-top:12px"><a class="pill" href="#/">← Back to Home</a></div></div></section>`; }
function renderPrivacy(){ app.innerHTML = `<section class="section"><div class="container" style="max-width:760px"><h2 class="center" style="margin-top:0">Privacy Policy</h2><p class="muted"><b>Protecting your privacy at EcoWear:</b> Your data is safe, never shared without consent. We do not sell personal data. We only share limited data with service providers (payments, shipping) under contract, and as required by law. You can request data export or deletion at any time.</p><div style="margin-top:12px"><a class="pill" href="#/">← Back to Home</a></div></div></section>`; }
function renderShipping(){ app.innerHTML = `<section class="section"><div class="container" style="max-width:760px"><h2 class="center" style="margin-top:0"><b>Shipping Policy</b></h2><p class="muted center">Shipment charges will be added at the time of checkout as per location and weight of the outfit. For any duty and customs at destination country, it will be the client’s responsibility.</p><div style="margin-top:12px"><a class="pill" href="#/">← Back to Home</a></div></div></section>`; }
function renderContact(){ app.innerHTML = `<section class="section"><div class="container" style="max-width:760px"><h2 class="center" style="margin-top:0;letter-spacing:.06em">CONTACT US</h2><form onsubmit="toast('Message sent (prototype)'); this.reset(); return false;" class="grid" style="gap:12px"><input class="input" placeholder="First Name"><input class="input" placeholder="Last Name"><input class="input" placeholder="Company Name"><input class="input" placeholder="Address"><input class="input" placeholder="Email" type="email"><textarea class="input" rows="6" placeholder="Message"></textarea><div><button class="btn btn-dark" type="submit">Send</button></div></form><div style="margin-top:12px"><a class="pill" href="#/">← Back to Home</a></div></div></section>`; }
function renderNotFound(){ app.innerHTML = `<section class="section"><div class="container"><h2>Page not found</h2><a class="pill" href="#/">← Home</a></div></section>`; }

/* ---------- Router ---------- */
function route(){
  const h = location.hash.replace(/^#\/?/, "");
  if(!h){ renderHome(); return; }
  const [seg,a] = h.split("/");
  if(seg==="category" && a){ renderCategory(a); return; }
  if(seg==="product" && a){ renderProduct(a); return; }
  if(seg==="sell"){ renderSell(); return; }
  if(seg==="rent"){ renderRent(); return; }
  if(seg==="messages"){ renderMessages(); return; }
  if(seg==="wishlist"){ renderWishlist(); return; }
  if(seg==="account"){ renderAccount(); return; }
  if(seg==="cart"){ renderCart(); return; }
  if(seg==="checkout"){ renderCheckout(); return; }
  if(seg==="payment"){ renderPayment(); return; }
  if(seg==="confirm"){ renderConfirmation(); return; }
  if(seg==="about"){ renderAbout(); return; }
  if(seg==="faq"){ renderFAQ(); return; }
  if(seg==="returns"){ renderReturns(); return; }
  if(seg==="privacy"){ renderPrivacy(); return; }
  if(seg==="shipping"){ renderShipping(); return; }
  if(seg==="contact"){ renderContact(); return; }
  renderNotFound();
}
window.addEventListener("hashchange", route);
route();
updateHeaderAuth();

/* ---------- Simple Sell / Rent info pages  ---------- */
function renderSell(){ app.innerHTML = `
  <section class="section"><div class="container">
    <h2 style="margin:0 0 8px">List Your Designer Item</h2>
    <p class="muted">Upload details, choose category and Men/Women section, specify sizes, and set availability for rents.</p>
    <div class="grid g-2" style="margin-top:12px">
      <div>
        <input class="input" placeholder="Title" style="margin-bottom:10px">
        <div class="grid g-2"><input class="input" placeholder="Choose Category"><input class="input" placeholder="Brand"></div>
        <input class="input" placeholder="Price (USD)" style="margin:10px 0" inputmode="decimal">
        <input class="input" placeholder="Size (e.g., 38 EU, M, 40R)">
      </div>
      <div>
        <div class="grid g-2"><select class="input"><option>Women</option><option>Men</option></select><input class="input" placeholder="Rent per day (USD)" inputmode="decimal"></div>
        <div class="grid g-2" style="margin-top:10px"><input class="input" type="date" placeholder="Available from"><input class="input" type="date" placeholder="Available to"></div>
        <textarea class="input" rows="5" placeholder="Description / Notes" style="margin-top:10px"></textarea>
      </div>
    </div>
    <div class="hint" style="margin-top:8px">Images: Upload in next step · Verification required for designer labels · Secure payments & deposits for rentals</div>
    <div style="margin-top:12px"><button class="btn btn-primary" onclick="toast('Saved (prototype)')">Save Draft</button></div>
  </div></section>`; }
function renderRent(){ app.innerHTML = `
  <section class="section"><div class="container">
    <h2 style="margin:0 0 8px">How Renting Works</h2>
    <div class="card" style="background:#f8fafc">
      <ol style="margin:0;padding-left:18px">
        <li>Choose Men or Women section, then pick a category.</li>
        <li>Select dates, pay the rental fee (and a refundable deposit if required), and check out securely.</li>
        <li>Receive, wear, return — ratings keep the community trusted.</li>
      </ol>
    </div>
  </div></section>`; }
