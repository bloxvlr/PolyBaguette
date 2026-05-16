const supabaseUrl = 'https://revviobatyajeuxucklz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJldnZpb2JhdHlhamV1eHVja2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NDMxMjIsImV4cCI6MjA5NDUxOTEyMn0.QCTwOY0peGp7zPkQmSWoPfzbcW6Jmg3CkMJSeYQ-ybM';
const supabaseClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

// State
let state = {
    isLoggedIn: false,
    user: null, // from profiles table
    session: null,
    markets: [],
    currentMarket: null,
    tradeMode: 'buy', 
    tradeAmount: 0,
    selectedOutcome: null,
    activeCategory: 'all'
};

// Formatting utilities
const formatEuro = (pc) => (pc * 0.92).toFixed(2);
const formatPC = (val) => Number(val).toFixed(2);
const formatVol = (vol) => {
    if (vol >= 1000000) return '$' + (vol / 1000000).toFixed(1) + 'M';
    if (vol >= 1000) return '$' + (vol / 1000).toFixed(1) + 'k';
    return '$' + vol;
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        if (window.lucide) lucide.createIcons();
    } catch(e) { console.error(e); }
    
    initTicker();
    
    if (!supabaseClient) {
        showToast("Erreur de connexion à la base de données (Bloqueur de pub ?)", "error");
        document.getElementById('loadingMarkets').style.display = 'none';
        state.markets = getFallbackMarkets();
        renderMarkets(state.markets);
        return;
    }
    
    // Setup Supabase Auth listener
    supabaseClient.auth.onAuthStateChange((event, session) => {
        state.session = session;
        if (session) {
            fetchUserProfile(session.user.id);
        } else {
            state.isLoggedIn = false;
            state.user = null;
            updateAuthUI();
        }
    });

    // Check current session safely
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (data && data.session) {
            state.session = data.session;
            await fetchUserProfile(data.session.user.id);
        }
    } catch(e) { console.error("Session error:", e); }
    
    await loadMarkets();
    await loadRecentTransactions();
});

// --- AUTH & PROFILES ---

window.onload = function () {
    if (window.google) {
        google.accounts.id.initialize({
            client_id: "736237428802-lub0be3mmmctafqjv0bp12fr9ho40uv0.apps.googleusercontent.com",
            callback: handleCredentialResponse
        });
        
        const loginBtn = document.getElementById("googleBtnLogin");
        if (loginBtn) {
            google.accounts.id.renderButton(loginBtn, { theme: "filled_black", size: "large", width: 330 });
        }
    }
};

async function handleCredentialResponse(response) {
    if (!supabaseClient) return showToast("Erreur de base de données", "error");
    
    // Authenticate with Supabase using the Google ID Token
    const { data, error } = await supabaseClient.auth.signInWithIdToken({
        provider: 'google',
        token: response.credential,
    });
    
    if (error) {
        showToast("Erreur d'authentification : " + error.message, "error");
        return;
    }
    
    closeModal('loginModal');
    showToast("Connexion réussie !", "success");
}

async function logout() {
    await supabaseClient.auth.signOut();
    document.getElementById('walletDropdown').classList.remove('show');
    showToast("Déconnecté", "info");
    navigateTo('home');
}

async function fetchUserProfile(userId) {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
    if (data) {
        state.user = data;
        state.isLoggedIn = true;
        updateAuthUI();
    }
}

function updateAuthUI() {
    if (state.isLoggedIn && state.user) {
        document.getElementById('authButtons').style.display = 'none';
        document.getElementById('walletDisplay').style.display = 'block';
        document.getElementById('userAvatar').style.display = 'flex';
        
        if (state.user.avatar_url) {
            document.getElementById('userAvatar').innerHTML = `<img src="${state.user.avatar_url}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
            document.getElementById('userAvatar').innerHTML = `<span id="userAvatarLetter">${state.user.username.charAt(0).toUpperCase()}</span>`;
        }
        
        document.getElementById('fabCreate').style.display = 'flex';
        updateWalletBalances();
    } else {
        document.getElementById('authButtons').style.display = 'flex';
        document.getElementById('walletDisplay').style.display = 'none';
        document.getElementById('userAvatar').style.display = 'none';
        document.getElementById('fabCreate').style.display = 'none';
    }
}

function updateWalletBalances() {
    if(!state.user) return;
    const bal = state.user.balance;
    const usdEquivalent = formatEuro(bal);
    
    document.getElementById('walletBalance').innerText = formatPC(bal);
    document.getElementById('walletDropdownBalance').innerText = formatPC(bal) + ' PLC';
    document.getElementById('walletDropdownEuro').innerText = `$ ${usdEquivalent} USD`;
    document.getElementById('walletItemBalance').innerText = formatPC(bal);
    document.getElementById('walletItemEur').innerText = `$ ${usdEquivalent}`;
}

function toggleWalletDropdown() {
    document.getElementById('walletDropdown').classList.toggle('show');
}

// --- SEND MONEY ---

async function handleSendMoney(e) {
    e.preventDefault();
    if(!state.isLoggedIn) return;
    
    const email = document.getElementById('sendEmail').value;
    const amount = parseFloat(document.getElementById('sendAmount').value);
    const btn = document.getElementById('btnSend');
    
    if (amount <= 0) return showToast("Montant invalide", "error");
    
    btn.innerText = "Envoi...";
    btn.disabled = true;

    // Execute RPC function
    const { data, error } = await supabaseClient.rpc('send_plc', { 
        receiver_email: email, 
        transfer_amount: amount 
    });

    btn.innerText = "Envoyer les PLC";
    btn.disabled = false;

    if (error) {
        showToast(error.message || "Erreur lors de l'envoi", "error");
    } else {
        showToast(`Vous avez envoyé ${amount} PLC à ${email}`, "success");
        closeModal('sendModal');
        document.getElementById('sendEmail').value = '';
        document.getElementById('sendAmount').value = '';
        await fetchUserProfile(state.session.user.id); // refresh balance
    }
}

// --- MARKETS FETCHING ---

async function loadMarkets() {
    const loadingEl = document.getElementById('loadingMarkets');
    if(loadingEl) loadingEl.style.display = 'block';
    
    try {
        // Fetch markets and their outcomes
        const { data: markets, error } = await supabaseClient
            .from('markets')
            .select('*, outcomes(*)')
            .order('created_at', { ascending: false });
            
        if(loadingEl) loadingEl.style.display = 'none';
        
        if (error) {
            console.error("Erreur DB:", error);
            showToast("Affichage des marchés de démonstration (la base de données est vide ou inaccessible).", "error");
            state.markets = getFallbackMarkets();
            renderMarkets(state.markets);
            return;
        }
        
        state.markets = markets || [];
        
        // Si la base est vide, on ajoute des faux marchés localement pour la démo
        if (state.markets.length === 0) {
            state.markets = getFallbackMarkets();
        }
        
        renderMarkets(state.markets);
    } catch (e) {
        console.error("Fetch error:", e);
        if(loadingEl) loadingEl.style.display = 'none';
        state.markets = getFallbackMarkets();
        renderMarkets(state.markets);
    }
}

// --- UI / NAVIGATION ---

function navigateTo(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    if(pageId === 'home') {
        document.getElementById('homePage').classList.add('active');
        document.getElementById('navHome').classList.add('active');
        renderMarkets(state.markets);
    } else if (pageId === 'portfolio') {
        if(!state.isLoggedIn) return showToast('Vous devez être connecté', 'error');
        document.getElementById('portfolioPage').classList.add('active');
        document.getElementById('navPortfolio').classList.add('active');
        renderPortfolio();
    } else if (pageId === 'leaderboard') {
        document.getElementById('leaderboardPage').classList.add('active');
        document.getElementById('navLeaderboard').classList.add('active');
        renderLeaderboard();
    } else if (pageId === 'profile') {
        if(!state.isLoggedIn) return showToast('Vous devez être connecté', 'error');
        document.getElementById('profilePage').classList.add('active');
        renderProfile();
    }
    setTimeout(() => lucide.createIcons(), 50);
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// --- MARKETS RENDERING ---

function filterCategory(cat, btnElement) {
    state.activeCategory = cat;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    
    renderMarkets(state.markets);
}

function renderMarkets(marketsData) {
    let filtered = marketsData;
    if (state.activeCategory !== 'all') {
        filtered = marketsData.filter(m => m.category.toLowerCase() === state.activeCategory.toLowerCase());
    }
    
    const grid = document.getElementById('marketsGrid');
    if (!grid) return;
    
    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-muted)">Aucun marché trouvé dans cette catégorie.</div>';
        return;
    }
    
    const featured = filtered[0]; // first market as featured
    const fmElement = document.getElementById('featuredMarket');
    if (fmElement && featured) {
        fmElement.innerHTML = `
            <div class="fm-header">
                <img src="${featured.icon_url || 'https://picsum.photos/100'}" class="fm-icon">
                <div>
                    <div class="fm-title">${featured.title}</div>
                    <div class="fm-stats">
                        <span>${formatVol(featured.volume || 0)} Vol.</span>
                        <span>Se termine le ${new Date(featured.end_date).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>
            <div class="fm-outcomes">
                ${(featured.outcomes || []).map(o => `
                    <div class="fm-outcome">
                        <span class="fm-outcome-name">${o.name}</span>
                        <div class="fm-outcome-bar-container">
                            <div class="fm-outcome-bar" style="width: ${o.probability}%"></div>
                        </div>
                        <span class="fm-outcome-prob">${o.probability}%</span>
                    </div>
                `).join('')}
            </div>
        `;
        fmElement.onclick = () => openMarketDetail(featured.id);
    }
    
    grid.innerHTML = filtered.slice(1).map(m => `
        <div class="market-card" onclick="openMarketDetail('${m.id}')">
            <div class="mc-header">
                <img src="${m.icon_url || 'https://picsum.photos/100'}" class="mc-icon">
                <div class="mc-title">${m.title}</div>
            </div>
            <div class="mc-outcomes">
                ${(m.outcomes || []).slice(0, 2).map(o => `
                    <div class="mc-outcome-row">
                        <span class="mc-outcome-label">${o.name}</span>
                        <div>
                            <span class="mc-prob mr-2 ${o.name==='Oui' || o.name==='Up' ? 'text-green' : 'text-red'}">${o.probability}%</span>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="mc-footer">
                <span>${formatVol(m.volume || 0)} Vol.</span>
                <span>${new Date(m.end_date).toLocaleDateString()}</span>
            </div>
        </div>
    `).join('');
    
    setTimeout(() => lucide.createIcons(), 50);
}

// --- MARKET DETAIL & TRADING ---

function openMarketDetail(id) {
    const market = state.markets.find(m => m.id === id);
    if(!market) return;
    state.currentMarket = market;
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('marketPage').classList.add('active');
    
    document.getElementById('marketBreadcrumb').innerHTML = `Marchés > ${market.category} > ${market.title}`;
    
    document.getElementById('marketDetailHeader').innerHTML = `
        <img src="${market.icon_url || 'https://picsum.photos/100'}" class="md-icon">
        <div>
            <div class="md-title">${market.title}</div>
            <div class="md-stats">
                <span><i data-lucide="award" class="icon-sm"></i> ${formatVol(market.volume || 0)} Vol.</span>
                <span><i data-lucide="calendar" class="icon-sm"></i> ${new Date(market.end_date).toLocaleDateString()}</span>
            </div>
        </div>
    `;
    
    document.getElementById('tradingPanelHeader').innerHTML = `
        <img src="${market.icon_url || 'https://picsum.photos/100'}" class="tp-icon">
        <div class="tp-title">${market.title}</div>
    `;
    
    renderMarketOutcomes(market);
    renderTradingChoices(market);
    drawMockChart();
    
    document.getElementById('marketTabContent').innerHTML = `
        <h3>Règles du marché</h3>
        <p>${market.description}</p>
    `;
    setTimeout(() => lucide.createIcons(), 50);
}

function renderMarketOutcomes(market) {
    document.getElementById('marketOutcomesList').innerHTML = (market.outcomes || []).map(o => `
        <div class="md-outcome-row">
            <div class="md-outcome-left">
                <div class="md-outcome-name">${o.name}</div>
            </div>
            <div class="md-outcome-center">${o.probability}%</div>
            <div class="md-outcome-right">
                <button class="btn-buy-yes" onclick="setupTrade('${o.name}')">Miser</button>
            </div>
        </div>
    `).join('');
}

function renderTradingChoices(market) {
    const outcomes = market.outcomes || [];
    if(outcomes.length === 2) {
        document.getElementById('tradingChoices').innerHTML = `
            <button class="choice-btn choice-btn-yes selected" onclick="selectOutcome('${outcomes[0].name}', this)">
                ${outcomes[0].name} <span>${outcomes[0].probability}¢</span>
            </button>
            <button class="choice-btn choice-btn-no" onclick="selectOutcome('${outcomes[1].name}', this)">
                ${outcomes[1].name} <span>${outcomes[1].probability}¢</span>
            </button>
        `;
        state.selectedOutcome = outcomes[0];
    } else {
        document.getElementById('tradingChoices').innerHTML = `
            <select style="width:100%; padding: 12px; background:var(--bg-main); color:white; border:1px solid var(--border-color); border-radius:8px;" onchange="selectOutcome(this.value)">
                ${outcomes.map(o => `<option value="${o.name}">${o.name} - ${o.probability}¢</option>`).join('')}
            </select>
        `;
        state.selectedOutcome = outcomes[0];
    }
    updateTradePreview();
}

function setupTrade(outcomeName) {
    const btn = document.querySelector(`.choice-btn:contains('${outcomeName}')`);
    if(btn) selectOutcome(outcomeName, btn);
}

function selectOutcome(name, btn) {
    state.selectedOutcome = state.currentMarket.outcomes.find(o => o.name === name);
    if(btn && btn.classList) {
        document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    }
    updateTradePreview();
}

function setTradeAmount(add) {
    const input = document.getElementById('tradeAmount');
    input.value = parseFloat(input.value || 0) + add;
    updateTradePreview();
}

function updateTradePreview() {
    const amount = parseFloat(document.getElementById('tradeAmount').value) || 0;
    state.tradeAmount = amount;
    
    if (!state.selectedOutcome) return;
    
    const prob = state.selectedOutcome.probability / 100;
    const shares = prob > 0 ? (amount / prob).toFixed(2) : 0;
    const potential = (shares * 1).toFixed(2);
    
    document.getElementById('previewShares').innerText = shares;
    document.getElementById('previewProfit').innerText = `+${potential} PLC`;
    
    const btn = document.getElementById('tradeButton');
    if(amount > 0) {
        btn.classList.add('active-yes');
        btn.innerText = `Négocier ${state.selectedOutcome.name}`;
    } else {
        btn.classList.remove('active-yes', 'active-no');
        btn.innerText = 'Négocier';
    }
}

async function executeTrade() {
    if(!state.isLoggedIn) {
        showToast("Vous devez être connecté", "error");
        return;
    }
    
    if(state.tradeAmount <= 0) return;
    
    if(state.user.balance < state.tradeAmount) {
        showToast('Fonds insuffisants !', 'error');
        return;
    }
    
    const btn = document.getElementById('tradeButton');
    btn.disabled = true;
    btn.innerText = "Transaction...";
    
    const prob = state.selectedOutcome.probability / 100;
    const shares = state.tradeAmount / prob;

    // Supabase insertions
    const { error: posError } = await supabaseClient.from('positions').insert({
        user_id: state.user.id,
        market_id: state.currentMarket.id,
        outcome_id: state.selectedOutcome.id,
        shares: shares,
        invested_amount: state.tradeAmount
    });
    
    if (posError) {
        btn.disabled = false;
        btn.innerText = "Négocier";
        return showToast("Erreur lors de la transaction", "error");
    }
    
    // Update balance
    await supabaseClient.from('profiles').update({ balance: state.user.balance - state.tradeAmount }).eq('id', state.user.id);
    
    await fetchUserProfile(state.session.user.id);
    
    btn.disabled = false;
    showToast(`Vous avez misé ${state.tradeAmount} PLC sur ${state.selectedOutcome.name}`, 'success');
    document.getElementById('tradeAmount').value = 0;
    updateTradePreview();
}

// --- CREATE MARKET ---

async function handleCreateMarket(e) {
    e.preventDefault();
    if(!state.isLoggedIn) return showToast("Connectez-vous", "error");
    
    const title = document.getElementById('cmQuestion').value;
    const category = document.getElementById('cmCategory').value;
    const endDate = document.getElementById('cmEndDate').value;
    const liquidity = parseFloat(document.getElementById('cmLiquidity').value);
    const desc = document.getElementById('cmDescription').value;
    const iconUrl = document.getElementById('cmIcon').value;
    
    if(state.user.balance < liquidity) {
        showToast("Fonds insuffisants pour apporter la liquidité.", "error");
        return;
    }
    
    const btn = document.getElementById('btnCreateMarket');
    btn.disabled = true;
    btn.innerText = "Création...";
    
    // Insert Market
    const { data: marketData, error: mError } = await supabaseClient.from('markets').insert({
        creator_id: state.user.id,
        title,
        category,
        description: desc,
        icon_url: iconUrl,
        end_date: endDate,
        liquidity,
        source: 'User Creation'
    }).select().single();
    
    if (mError) {
        btn.disabled = false;
        return showToast("Erreur de création", "error");
    }
    
    // Insert Outcomes (Oui / Non par défaut pour simplifier)
    await supabaseClient.from('outcomes').insert([
        { market_id: marketData.id, name: 'Oui', probability: 50, current_price: 0.5 },
        { market_id: marketData.id, name: 'Non', probability: 50, current_price: 0.5 }
    ]);
    
    // Deduct liquidity
    await supabaseClient.from('profiles').update({ balance: state.user.balance - liquidity }).eq('id', state.user.id);
    
    await fetchUserProfile(state.session.user.id);
    await loadMarkets();
    
    btn.disabled = false;
    btn.innerText = "Ouvrir le Marché";
    closeModal('createMarketModal');
    showToast("Votre Marché est publié !", "success");
}

// --- PROFILE EDIT ---

function openEditProfile() {
    document.getElementById('editPseudo').value = state.user.username;
    document.getElementById('editAvatar').value = state.user.avatar_url || '';
    openModal('editProfileModal');
}

async function handleEditProfile(e) {
    e.preventDefault();
    const newName = document.getElementById('editPseudo').value;
    const newAvatar = document.getElementById('editAvatar').value;
    
    const { error } = await supabaseClient.from('profiles').update({
        username: newName,
        avatar_url: newAvatar
    }).eq('id', state.user.id);
    
    if (error) {
        showToast("Erreur lors de la modification", "error");
    } else {
        showToast("Profil mis à jour", "success");
        closeModal('editProfileModal');
        await fetchUserProfile(state.session.user.id);
        renderProfile(); // refresh page
    }
}

// --- SEARCH ---

function handleSearch() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const dropdown = document.getElementById('searchResults');
    
    if (q.length < 2) {
        dropdown.style.display = 'none';
        return;
    }
    
    // Search markets locally
    const mResults = state.markets.filter(m => m.title.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
    
    // For users, we should ideally fetch from Supabase, but let's do a quick query
    supabaseClient.from('profiles').select('id, username, avatar_url').ilike('username', `%${q}%`).limit(3).then(({data: uResults}) => {
        let html = '';
        if (mResults.length > 0) {
            html += '<div class="sr-cat">Marchés</div>';
            mResults.slice(0, 3).forEach(m => {
                html += `<div class="sr-item" onclick="openMarketDetail('${m.id}'); document.getElementById('searchResults').style.display='none';">${m.title}</div>`;
            });
        }
        if (uResults && uResults.length > 0) {
            html += '<div class="sr-cat">Boulangers</div>';
            uResults.forEach(u => {
                html += `<div class="sr-item" style="display:flex; align-items:center; gap:8px;">
                    <img src="${u.avatar_url || 'https://picsum.photos/30'}" style="width:24px; height:24px; border-radius:50%"> ${u.username}
                </div>`;
            });
        }
        
        if (html === '') html = '<div class="sr-item text-muted">Aucun résultat</div>';
        
        dropdown.innerHTML = html;
        dropdown.style.display = 'block';
    });
}

// --- RENDER PORTFOLIO ---
async function renderPortfolio() {
    if(!state.user) return;
    
    const { data: positions } = await supabaseClient
        .from('positions')
        .select('*, outcomes(name), markets(title)')
        .eq('user_id', state.user.id);
        
    const posList = positions || [];
    const invested = posList.reduce((sum, p) => sum + p.invested_amount, 0);
    const total = state.user.balance + invested;
    
    document.getElementById('portBalance').innerText = formatPC(state.user.balance) + ' PLC';
    document.getElementById('portPositions').innerText = formatPC(invested) + ' PLC';
    document.getElementById('portTotal').innerText = formatPC(total) + ' PLC';
    
    const content = document.getElementById('portfolioContent');
    if(posList.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <i data-lucide="cookie" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 16px;"></i>
                <p>Votre portefeuille est vide !</p>
                <button class="btn-primary" onclick="navigateTo('home')">Explorer les marchés</button>
            </div>
        `;
        setTimeout(() => lucide.createIcons(), 50);
        return;
    }
    
    content.innerHTML = posList.map(p => `
        <div class="position-card">
            <div class="pos-market">
                <div>
                    <div class="pos-title">${p.markets.title}</div>
                    <span class="pos-outcome">${p.outcomes.name}</span>
                </div>
            </div>
            <div class="pos-stats">
                <div class="pos-stat-col">
                    <span class="pos-stat-label">Parts</span>
                    <span class="pos-stat-val">${p.shares.toFixed(2)}</span>
                </div>
                <div class="pos-stat-col">
                    <span class="pos-stat-label">Investi</span>
                    <span class="pos-stat-val">${p.invested_amount.toFixed(2)} PLC</span>
                </div>
            </div>
        </div>
    `).join('');
}

// --- RENDER LEADERBOARD ---
async function renderLeaderboard() {
    const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('*')
        .order('balance', { ascending: false })
        .limit(10);
        
    const table = document.getElementById('leaderboardTable');
    if (!profiles) return;
    
    table.innerHTML = `
        <div class="lb-row lb-header">
            <div class="lb-rank">#</div>
            <div class="lb-user">Boulanger</div>
            <div class="lb-score">Portefeuille (PLC)</div>
        </div>
        ${profiles.map((u, i) => `
            <div class="lb-row">
                <div class="lb-rank">${i+1}</div>
                <div class="lb-user">
                    ${u.avatar_url ? `<img src="${u.avatar_url}" class="lb-avatar" style="object-fit:cover">` : `<div class="lb-avatar">${u.username[0]}</div>`}
                    ${u.username}
                </div>
                <div class="lb-score">${formatPC(u.balance)} PLC</div>
            </div>
        `).join('')}
    `;
}

// --- PROFILE ---
function renderProfile() {
    if(!state.user) return;
    const content = document.getElementById('profileContent');
    
    content.innerHTML = `
        <div class="profile-header">
            ${state.user.avatar_url 
                ? `<img src="${state.user.avatar_url}" class="profile-avatar-large" style="object-fit: cover;">`
                : `<div class="profile-avatar-large">${state.user.username[0].toUpperCase()}</div>`
            }
            <div class="profile-info">
                <h1>${state.user.username} <button style="background:none; border:none; cursor:pointer; color:var(--text-muted)" onclick="openEditProfile()"><i data-lucide="edit-2" class="icon-sm"></i></button></h1>
                <div class="profile-date">Inscrit le ${new Date(state.user.created_at).toLocaleDateString()}</div>
            </div>
        </div>
        <div class="profile-stats-grid">
            <div class="portfolio-card">
                <span class="portfolio-label">Solde Actuel</span>
                <span class="portfolio-value">${formatPC(state.user.balance)} PLC</span>
            </div>
        </div>
    `;
    setTimeout(() => lucide.createIcons(), 50);
}

// --- UTILS & MOCKS ---

async function loadRecentTransactions() {
    // Just a placeholder
    const list = document.getElementById('transactionsList');
    if(list) list.innerHTML = '<div class="text-muted">Aucune transaction récente</div>';
}

function initTicker() {
    const tickerContent = document.getElementById('tickerContent');
    if (tickerContent) {
        tickerContent.innerHTML = `<span class="ticker-item">Bienvenue sur PolyBaguette, la version française de Polymarket !</span>`;
    }
}

function drawMockChart() {
    const canvas = document.getElementById('marketChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(0, canvas.height/2);
    for(let i=0; i<canvas.width; i+=10) { ctx.lineTo(i, canvas.height/2 + (Math.random()-0.5)*50); }
    ctx.strokeStyle = '#2B6FED';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    const grad = ctx.createLinearGradient(0,0,0,canvas.height);
    grad.addColorStop(0, 'rgba(43, 111, 237, 0.2)');
    grad.addColorStop(1, 'rgba(43, 111, 237, 0)');
    ctx.fillStyle = grad;
    ctx.fill();
}

function showToast(msg, type='info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<div style="width:8px; height:8px; border-radius:50%; background: ${type==='error'?'var(--accent-red)':'var(--accent-green)'}"></div><div>${msg}</div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'slideOut 0.3s forwards'; setTimeout(() => toast.remove(), 300); }, 3000);
}

HTMLElement.prototype.contains = function(text) { return this.innerText.includes(text); };

function getFallbackMarkets() {
    return [
        {
            id: 'demo1', title: 'Dissolution de l\'Assemblée en 2026 ?', category: 'Politique', description: 'Le président va-t-il dissoudre l\'assemblée ?', end_date: '2026-12-31', liquidity: 100, volume: 5400,
            outcomes: [{ id:'o1', name: 'Oui', probability: 35 }, { id:'o2', name: 'Non', probability: 65 }]
        },
        {
            id: 'demo2', title: 'Vainqueur de la Ligue des Champions 2026', category: 'Sports', description: 'Qui va gagner ?', end_date: '2026-06-01', liquidity: 500, volume: 12000,
            outcomes: [{ id:'o3', name: 'Real Madrid', probability: 45 }, { id:'o4', name: 'PSG', probability: 20 }]
        }
    ];
}
