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
    
    loadWalletTransactions();
}

async function loadWalletTransactions() {
    if(!state.user || !supabaseClient || !state.session) return;
    
    let html = '';
    try {
        const userEmail = state.session.user.email;
        const userId = state.user.id;
        
        let txs = [];
        // On essaye avec sender_id d'abord
        let { data, error } = await supabaseClient.from('transactions')
            .select('*')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .order('created_at', { ascending: false })
            .limit(10);
            
        if (error) {
            // Si ça échoue, on essaye avec les emails
            const { data: dataEmail } = await supabaseClient.from('transactions')
                .select('*')
                .or(`sender_email.eq.${userEmail},receiver_email.eq.${userEmail}`)
                .order('created_at', { ascending: false })
                .limit(10);
            txs = dataEmail || [];
        } else {
            txs = data || [];
        }
            
        if (txs && txs.length > 0) {
            html += txs.map(t => {
                const isSender = (t.sender_id === userId) || (t.sender_email === userEmail);
                const color = isSender ? 'var(--accent-red)' : 'var(--accent-green)';
                const sign = isSender ? '-' : '+';
                const label = isSender ? 'Envoyé' : 'Reçu';
                const amount = t.amount || t.transfer_amount || 0;
                
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; font-size: 0.85rem;">
                        <div style="color: var(--text-muted);"><i data-lucide="${isSender ? 'arrow-up-right' : 'arrow-down-left'}" style="width:14px; height:14px; vertical-align:middle; margin-right:4px;"></i>${label}</div>
                        <div style="color: ${color}; font-weight: 600;">${sign}${amount} PLC</div>
                    </div>
                `;
            }).join('');
        } else {
            html = '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">Aucun transfert récent</div>';
        }
    } catch(e) {
        html = '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">Aucun transfert récent</div>';
    }
    
    const list = document.getElementById('walletTransactionsList');
    if(list) {
        list.innerHTML = html;
        setTimeout(() => lucide.createIcons(), 10);
    }
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
    
    // Featured market: the one with highest volume
    const sorted = [...filtered].sort((a,b) => (b.volume||0) - (a.volume||0));
    const featured = sorted[0];
    const fmElement = document.getElementById('featuredMarket');
    if (fmElement && featured) {
        fmElement.style.display = 'block';
        fmElement.style.cursor = 'pointer';
        const favs = JSON.parse(localStorage.getItem('pb_favorites') || '[]');
        const isFav = favs.includes(featured.id);
        fmElement.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
                <span style="font-size:0.8rem; color:var(--accent-blue); font-weight:700; text-transform:uppercase; letter-spacing:1px;">🔥 ${featured.category}</span>
            </div>
            <div style="display:flex; gap:16px; align-items:flex-start; margin-bottom:20px;">
                <img src="${featured.icon_url || 'https://picsum.photos/100'}" style="width:48px; height:48px; border-radius:50%; object-fit:cover;">
                <div style="flex:1;">
                    <div style="font-size:1.4rem; font-weight:700; line-height:1.3; margin-bottom:6px;">${featured.title}</div>
                    <div style="font-size:0.9rem; color:var(--text-muted);">${formatVol(featured.volume||0)} Vol. &nbsp;·&nbsp; Se termine le ${new Date(featured.end_date).toLocaleDateString()}</div>
                </div>
                <div style="display:flex; gap:10px;">
                    <button onclick="event.stopPropagation(); shareMarket('${featured.id}')" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:8px; cursor:pointer; color:var(--text-muted);"><i data-lucide='share-2' style='width:16px;height:16px;'></i></button>
                    <button id="fav-feat-${featured.id}" onclick="event.stopPropagation(); toggleFavorite('${featured.id}', this)" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:8px; cursor:pointer; color:${isFav ? 'var(--accent-blue)' : 'var(--text-muted)'};"><i data-lucide='bookmark' style='width:16px;height:16px;'></i></button>
                </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px;">
                ${(featured.outcomes||[]).slice(0,3).map(o => `
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                        <span style="font-size:1rem; font-weight:500; color:var(--text-secondary);">${o.name}</span>
                        <div style="display:flex; align-items:center; gap:12px;">
                            <span style="font-size:1.1rem; font-weight:700;">${Math.round(o.probability)}%</span>
                            <button style="background:rgba(39,174,96,0.15); color:#27ae60; border:none; border-radius:6px; padding:8px 16px; font-weight:600; cursor:pointer;">Oui.</button>
                            <button style="background:rgba(235,87,87,0.15); color:#eb5757; border:none; border-radius:6px; padding:8px 16px; font-weight:600; cursor:pointer;">Non.</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        fmElement.onclick = () => openMarketDetail(featured.id);
        setTimeout(() => lucide.createIcons(), 20);
    }
    
    const rest = sorted.slice(1);
    if (rest.length === 0) {
        grid.innerHTML = '';
        return;
    }
    
    const favs = JSON.parse(localStorage.getItem('pb_favorites') || '[]');
    grid.innerHTML = rest.map(m => {
        const isFav = favs.includes(m.id);
        return `
        <div class="market-card" onclick="openMarketDetail('${m.id}')" style="display:flex; flex-direction:column; min-height: 200px;">
            <div class="mc-header" style="display: flex; gap: 12px; align-items: flex-start; margin-bottom: 20px;">
                <img src="${m.icon_url || 'https://picsum.photos/100'}" class="mc-icon" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">
                <div class="mc-title" style="font-weight: 600; font-size: 1.05rem; line-height: 1.3; color: var(--text-primary);">${m.title}</div>
            </div>
            <div class="mc-outcomes" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">
                ${(!m.outcomes || m.outcomes.length === 0) ? `
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                        <span style="color:var(--text-secondary);font-size:0.95rem;font-weight:500;">Oui</span>
                        <div style="display:flex;align-items:center;gap:12px;">
                            <span style="background:var(--accent-blue);color:white;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;text-transform:uppercase;">Nouveau</span>
                            <span style="font-weight:600;font-size:1rem;color:var(--text-primary);">0%</span>
                            <div style="display:flex;gap:6px;">
                                <button style="background:rgba(39,174,96,0.15);color:#27ae60;border:none;border-radius:6px;padding:6px 12px;font-weight:600;font-size:0.85rem;cursor:pointer;">Oui.</button>
                                <button style="background:rgba(235,87,87,0.15);color:#eb5757;border:none;border-radius:6px;padding:6px 12px;font-weight:600;font-size:0.85rem;cursor:pointer;">Non.</button>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                        <span style="color:var(--text-secondary);font-size:0.95rem;font-weight:500;">Non</span>
                        <div style="display:flex;align-items:center;gap:12px;">
                            <span style="font-weight:600;font-size:1rem;color:var(--text-primary);">0%</span>
                            <div style="display:flex;gap:6px;">
                                <button style="background:rgba(39,174,96,0.15);color:#27ae60;border:none;border-radius:6px;padding:6px 12px;font-weight:600;font-size:0.85rem;cursor:pointer;">Oui.</button>
                                <button style="background:rgba(235,87,87,0.15);color:#eb5757;border:none;border-radius:6px;padding:6px 12px;font-weight:600;font-size:0.85rem;cursor:pointer;">Non.</button>
                            </div>
                        </div>
                    </div>
                ` : m.outcomes.slice(0, 3).map((o, index) => `
                    <div class="mc-outcome-row" style="display:flex;align-items:center;justify-content:space-between;">
                        <span style="color:var(--text-secondary);font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;font-weight:500;">${o.name}</span>
                        <div style="display:flex;align-items:center;gap:12px;">
                            ${(m.volume === 0 && index === 0) ? '<span style="background:var(--accent-blue);color:white;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;text-transform:uppercase;">Nouveau</span>' : ''}
                            <span style="font-weight:600;font-size:1rem;color:var(--text-primary);">${Math.round(o.probability)}%</span>
                            <div style="display:flex;gap:6px;">
                                <button class="btn-mc-yes" style="background:rgba(39,174,96,0.15);color:#27ae60;border:1px solid transparent;border-radius:6px;padding:6px 12px;font-weight:600;font-size:0.85rem;cursor:pointer;transition:0.2s;">Oui.</button>
                                <button class="btn-mc-no" style="background:rgba(235,87,87,0.15);color:#eb5757;border:1px solid transparent;border-radius:6px;padding:6px 12px;font-weight:600;font-size:0.85rem;cursor:pointer;transition:0.2s;">Non.</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="mc-footer" style="display:flex;justify-content:space-between;align-items:center;color:var(--text-muted);font-size:0.85rem;margin-top:auto;font-weight:500;">
                <span>${formatVol(m.volume || 0)} Vol.</span>
                <div style="display:flex;gap:10px;">
                    <button id="share-${m.id}" onclick="event.stopPropagation(); shareMarket('${m.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;"><i data-lucide='share-2' style='width:16px;height:16px;'></i></button>
                    <button id="fav-${m.id}" onclick="event.stopPropagation(); toggleFavorite('${m.id}', this)" style="background:none;border:none;cursor:pointer;color:${isFav ? 'var(--accent-blue)' : 'var(--text-muted)'};padding:2px;"><i data-lucide='bookmark' style='width:16px;height:16px;'></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
    
    setTimeout(() => lucide.createIcons(), 50);
}

function setMarketView(mode, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    const grid = document.getElementById('marketsGrid');
    if(mode === 'list') {
        grid.style.gridTemplateColumns = '1fr';
    } else {
        grid.style.gridTemplateColumns = '';
    }
}

function shareMarket(marketId) {
    const url = `${window.location.origin}${window.location.pathname}?market=${marketId}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Lien copié dans le presse-papier !', 'success');
    }).catch(() => {
        showToast('Lien : ' + url, 'info');
    });
}

function toggleFavorite(marketId, btn) {
    let favs = JSON.parse(localStorage.getItem('pb_favorites') || '[]');
    if(favs.includes(marketId)) {
        favs = favs.filter(id => id !== marketId);
        if(btn) btn.style.color = 'var(--text-muted)';
        showToast('Retiré des favoris', 'info');
    } else {
        favs.push(marketId);
        if(btn) btn.style.color = 'var(--accent-blue)';
        showToast('Ajouté aux favoris !', 'success');
    }
    localStorage.setItem('pb_favorites', JSON.stringify(favs));
}

// --- MARKET DETAIL & TRADING ---

async function openMarketDetail(id) {
    const market = state.markets.find(m => m.id === id);
    if(!market) return;
    state.currentMarket = market;
    
    // Reset trade mode to buy
    state.tradeMode = 'buy';
    document.querySelectorAll('.trade-tab').forEach((b, i) => {
        if(i === 0) b.classList.add('active'); else b.classList.remove('active');
    });
    
    // Fetch market positions for real chart and owned shares
    let positions = [];
    if (supabaseClient) {
        const { data } = await supabaseClient.from('positions').select('*').eq('market_id', id).order('created_at', { ascending: true });
        positions = data || [];
    }
    state.marketPositions = positions;
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('marketPage').classList.add('active');
    
    document.getElementById('marketBreadcrumb').innerHTML = `Marchés > ${market.category} > ${market.title}`;
    
    document.getElementById('marketDetailHeader').innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
            <div style="display:flex; gap:16px;">
                <img src="${market.icon_url || 'https://picsum.photos/100'}" class="md-icon">
                <div>
                    <div class="md-title">${market.title}</div>
                    <div class="md-stats">
                        <span id="marketVolumeUI"><i data-lucide="award" class="icon-sm"></i> ${formatVol(market.volume || 0)} Vol.</span>
                        <span><i data-lucide="calendar" class="icon-sm"></i> ${new Date(market.end_date).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:8px;">
                ${state.user && state.user.id === market.creator_id ? 
                    `<button class="btn-wallet-action btn-danger" onclick="deleteMarket('${market.id}')" style="padding: 6px 12px; font-size: 0.8rem;"><i data-lucide="trash-2"></i> Supprimer</button>` 
                    : ''}
                <button class="btn-wallet-action" onclick="reportMarket('${market.id}')" style="padding: 6px 12px; font-size: 0.8rem; background: var(--bg-card); color: var(--text-primary);"><i data-lucide="flag"></i> Signaler</button>
            </div>
        </div>
    `;
    
    document.getElementById('tradingPanelHeader').innerHTML = `
        <img src="${market.icon_url || 'https://picsum.photos/100'}" class="tp-icon">
        <div class="tp-title">${market.title}</div>
    `;
    
    renderMarketOutcomes(market);
    renderTradingChoices(market);
    drawRealChart(market, state.marketPositions);
    renderMarketHistory();
    
    document.getElementById('marketTabContent').innerHTML = `
        <h3>Règles du marché</h3>
        <p>${market.description}</p>
    `;
    setTimeout(() => lucide.createIcons(), 50);
}

function renderMarketHistory() {
    const container = document.getElementById('marketHistoryContainer');
    if(!container) return;
    
    if(!state.marketPositions || state.marketPositions.length === 0) {
        container.innerHTML = '<div class="text-muted">Aucune transaction pour ce marché.</div>';
        return;
    }
    
    const userIds = [...new Set(state.marketPositions.map(p => p.user_id))];
    supabaseClient.from('profiles').select('id, username').in('id', userIds).then(({data: profiles}) => {
        const userMap = {};
        if(profiles) profiles.forEach(p => userMap[p.id] = p.username);
        
        const sorted = [...state.marketPositions].reverse();
        
        container.innerHTML = sorted.map(p => {
            const isBuy = p.shares > 0;
            const outcomeName = state.currentMarket.outcomes.find(o => o.id === p.outcome_id)?.name || 'Issue';
            const action = isBuy ? 'Achat' : 'Vente';
            const color = isBuy ? 'var(--accent-green)' : 'var(--accent-red)';
            const username = userMap[p.user_id] || 'Boulanger Anonyme';
            
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 12px 0; border-bottom: 1px solid var(--border-color);">
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <span style="font-weight: 600; font-size: 0.9rem;">${username}</span>
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${new Date(p.created_at).toLocaleString()}</span>
                    </div>
                    <div style="text-align: right; display:flex; flex-direction:column; gap:4px;">
                        <span style="color: ${color}; font-weight: 600; font-size: 0.9rem;">${action} ${Math.abs(p.shares).toFixed(2)} parts</span>
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${Math.abs(p.invested_amount).toFixed(2)} PLC (${outcomeName})</span>
                    </div>
                </div>
            `;
        }).join('');
    });
}

function renderMarketOutcomes(market) {
    document.getElementById('marketOutcomesList').innerHTML = (market.outcomes || []).map(o => `
        <div class="md-outcome-row">
            <div class="md-outcome-left">
                <div class="md-outcome-name">${o.name}</div>
            </div>
            <div class="md-outcome-center">${o.probability}%</div>
            <div class="md-outcome-right">
                <button class="btn-buy-yes" onclick="selectOutcomeAndScroll('${o.id}', '${o.name}')">Miser</button>
            </div>
        </div>
    `).join('');
}

function selectOutcomeAndScroll(outcomeId, outcomeName) {
    // Select the outcome in the trading panel
    const outcome = state.currentMarket.outcomes.find(o => o.id === outcomeId || o.name === outcomeName);
    if(outcome) state.selectedOutcome = outcome;
    // Highlight the corresponding choice button
    document.querySelectorAll('.choice-btn').forEach(b => {
        if(b.innerText.includes(outcomeName)) {
            b.classList.add('selected');
        } else {
            b.classList.remove('selected');
        }
    });
    updateTradePreview();
    // Scroll to trading panel
    document.getElementById('tradingPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    } else if(outcomes.length > 0) {
        document.getElementById('tradingChoices').innerHTML = `
            <select style="width:100%; padding: 12px; background:var(--bg-main); color:white; border:1px solid var(--border-color); border-radius:8px;" onchange="selectOutcome(this.value)">
                ${outcomes.map(o => `<option value="${o.name}">${o.name} - ${o.probability}¢</option>`).join('')}
            </select>
        `;
        state.selectedOutcome = outcomes[0];
    } else {
        document.getElementById('tradingChoices').innerHTML = `<div class="text-muted">Aucune issue disponible pour ce marché. (Erreur de création)</div>`;
        state.selectedOutcome = null;
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

function switchTradeMode(mode, btnElement) {
    state.tradeMode = mode;
    document.querySelectorAll('.trade-tab').forEach(b => b.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
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
    
    if (!state.selectedOutcome) {
        document.getElementById('previewShares').innerText = '0.00';
        document.getElementById('previewProfit').innerText = '0.00 PLC';
        return;
    }
    
    const prob = state.selectedOutcome.probability / 100;
    
    // Calculer les parts possédées
    let ownedShares = 0;
    if (state.user && state.marketPositions) {
        ownedShares = state.marketPositions
            .filter(p => p.user_id === state.user.id && p.outcome_id === state.selectedOutcome.id)
            .reduce((sum, p) => sum + p.shares, 0);
    }
    
    const btn = document.getElementById('tradeButton');
    
    if (state.tradeMode === 'buy') {
        const shares = prob > 0 ? (amount / prob).toFixed(2) : 0;
        const potential = (shares * 1).toFixed(2);
        
        document.getElementById('previewShares').innerText = shares + " parts";
        document.getElementById('previewProfit').innerText = `+${potential} PLC potentiel`;
        document.getElementById('previewProfit').className = 'text-green';
        
        if(amount > 0) {
            btn.classList.add('active-yes');
            btn.classList.remove('btn-danger');
            btn.innerText = `Acheter ${state.selectedOutcome.name}`;
            btn.disabled = false;
        } else {
            btn.classList.remove('active-yes', 'btn-danger');
            btn.innerText = 'Négocier';
            btn.disabled = true;
        }
    } else {
        // Mode Vente
        const sharesToSell = prob > 0 ? amount / prob : 0;
        
        document.getElementById('previewShares').innerText = `-${sharesToSell.toFixed(2)} parts (Possédées: ${ownedShares.toFixed(2)})`;
        document.getElementById('previewProfit').innerText = `Vous recevrez ${amount.toFixed(2)} PLC`;
        document.getElementById('previewProfit').className = 'text-blue';
        
        if(amount > 0) {
            btn.classList.add('btn-danger');
            btn.classList.remove('active-yes');
            btn.innerText = `Vendre ${state.selectedOutcome.name}`;
            if (sharesToSell > ownedShares + 0.01) { // tolérance float
                btn.innerText = "Parts insuffisantes";
                btn.disabled = true;
            } else {
                btn.disabled = false;
            }
        } else {
            btn.classList.remove('active-yes', 'btn-danger');
            btn.innerText = 'Négocier';
            btn.disabled = true;
        }
    }
}

async function executeTrade() {
    if(!state.isLoggedIn) return showToast("Vous devez être connecté", "error");
    if(!state.selectedOutcome) return showToast("Erreur : Ce marché n'a aucune issue disponible.", "error");
    if(state.tradeAmount <= 0) return;
    
    const isBuy = state.tradeMode === 'buy';
    const prob = state.selectedOutcome.probability / 100;
    const sharesDelta = state.tradeAmount / prob;
    const plcDelta = state.tradeAmount;
    
    // Vérifications
    if (isBuy) {
        if(state.user.balance < plcDelta) return showToast('Fonds insuffisants !', 'error');
    } else {
        const ownedShares = state.marketPositions
            .filter(p => p.user_id === state.user.id && p.outcome_id === state.selectedOutcome.id)
            .reduce((sum, p) => sum + p.shares, 0);
        if (sharesDelta > ownedShares + 0.01) return showToast('Parts insuffisantes pour cette vente !', 'error');
    }

    const btn = document.getElementById('tradeButton');
    btn.disabled = true;
    btn.innerText = "Transaction...";
    
    try {
        // 1. Insertion dans positions
        const { error: posError } = await supabaseClient.from('positions').insert({
            user_id: state.user.id,
            market_id: state.currentMarket.id,
            outcome_id: state.selectedOutcome.id,
            shares: isBuy ? sharesDelta : -sharesDelta,
            invested_amount: isBuy ? plcDelta : -plcDelta
        });
        if (posError) throw posError;
        
        // 2. Mise à jour du solde utilisateur
        const newBalance = isBuy ? (state.user.balance - plcDelta) : (state.user.balance + plcDelta);
        await supabaseClient.from('profiles').update({ balance: newBalance }).eq('id', state.user.id);
        
        // 3. Mise à jour du volume du marché
        const newVolume = (state.currentMarket.volume || 0) + (isBuy ? plcDelta : -plcDelta);
        const safeVolume = newVolume < 0 ? 0 : newVolume; // sécurité
        await supabaseClient.from('markets').update({ volume: safeVolume }).eq('id', state.currentMarket.id);
        
        // 4. Moteur AMM - Recalcul des probabilités
        const L = state.currentMarket.liquidity || 10;
        const totalW = L + safeVolume;
        
        const { data: allPos } = await supabaseClient.from('positions').select('*').eq('market_id', state.currentMarket.id);
        
        for (const out of state.currentMarket.outcomes) {
            const outInvestments = (allPos || []).filter(p => p.outcome_id === out.id).reduce((sum, p) => sum + p.invested_amount, 0);
            const w = (L / state.currentMarket.outcomes.length) + outInvestments;
            let newProb = (w / totalW) * 100;
            if (newProb < 1) newProb = 1;
            if (newProb > 99) newProb = 99;
            
            await supabaseClient.from('outcomes').update({ probability: newProb.toFixed(2) }).eq('id', out.id);
        }
        
        await fetchUserProfile(state.session.user.id);
        showToast(isBuy ? `Achat réussi !` : `Vente réussie !`, 'success');
        document.getElementById('tradeAmount').value = 0;
        
        // Rafraichir le marché complet
        await loadMarkets(); 
        openMarketDetail(state.currentMarket.id);
        
    } catch(e) {
        console.error(e);
        showToast("Erreur système: " + e.message, "error");
        btn.disabled = false;
        btn.innerText = "Négocier";
    }
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
    const { error: outError } = await supabaseClient.from('outcomes').insert([
        { market_id: marketData.id, name: 'Oui', probability: 50, current_price: 0.5 },
        { market_id: marketData.id, name: 'Non', probability: 50, current_price: 0.5 }
    ]);
    
    if (outError) {
        console.error(outError);
        showToast("Marché créé, mais impossible d'ajouter les issues (Problème RLS).", "error");
    }
    
    // Deduct liquidity
    await supabaseClient.from('profiles').update({ balance: state.user.balance - liquidity }).eq('id', state.user.id);
    
    await fetchUserProfile(state.session.user.id);
    await loadMarkets();
    
    btn.disabled = false;
    btn.innerText = "Ouvrir le Marché";
    closeModal('createMarketModal');
    if (!outError) showToast("Votre Marché est publié !", "success");
}

async function deleteMarket(id) {
    if(!confirm("Êtes-vous sûr de vouloir supprimer définitivement votre marché ?")) return;
    
    const { error } = await supabaseClient.from('markets').delete().eq('id', id);
    if(error) {
        showToast("Erreur de suppression (droits insuffisants ?) : " + error.message, "error");
    } else {
        showToast("Marché supprimé avec succès.", "success");
        navigateTo('home');
        loadMarkets();
    }
}

function reportMarket(id) {
    showToast("Ce marché a été signalé à l'équipe de modération.", "info");
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
        
        <div class="profile-danger-zone" style="margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border-color);">
            <h3 style="color: var(--text-muted); margin-bottom: 16px; font-size: 0.9rem; text-transform: uppercase;">Paramètres du compte</h3>
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                <button class="btn-wallet-action" onclick="logout()" style="background: var(--bg-card); color: var(--text-primary);"><i data-lucide="log-out"></i> Me déconnecter</button>
                <button class="btn-wallet-action btn-danger" onclick="confirmDeleteAccount()"><i data-lucide="trash-2"></i> Supprimer définitivement mon compte</button>
            </div>
        </div>
    `;
    
    // Render favorites
    const favs = JSON.parse(localStorage.getItem('pb_favorites') || '[]');
    const favMarkets = state.markets.filter(m => favs.includes(m.id));
    const favSection = document.createElement('div');
    favSection.style.cssText = 'margin-top:32px; padding-top:20px; border-top:1px solid var(--border-color);';
    favSection.innerHTML = `
        <h3 style="margin-bottom:16px; display:flex; align-items:center; gap:8px;"><i data-lucide="bookmark"></i> Mes Favoris (${favMarkets.length})</h3>
        ${ favMarkets.length === 0 
            ? '<p style="color:var(--text-muted);">Aucun favori. Marquez des prédictions avec ◎ depuis la page d\'accueil !</p>'
            : favMarkets.map(m => `
                <div onclick="openMarketDetail('${m.id}')" style="display:flex; align-items:center; gap:12px; padding:12px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; margin-bottom:8px; cursor:pointer;">
                    <img src="${m.icon_url || 'https://picsum.photos/40'}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
                    <div style="flex:1;">
                        <div style="font-weight:600;">${m.title}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${formatVol(m.volume||0)} Vol.</div>
                    </div>
                    <span style="color:var(--accent-blue); font-weight:700;">${(m.outcomes && m.outcomes[0]) ? Math.round(m.outcomes[0].probability) + '%' : '--'}</span>
                </div>
            `).join('')
        }
    `;
    content.appendChild(favSection);
    
    setTimeout(() => lucide.createIcons(), 50);
}

function confirmDeleteAccount() {
    if (confirm("⚠️ Êtes-vous sûr de vouloir supprimer définitivement votre compte PolyBaguette ?\n\nCette action est IRRÉVERSIBLE. Tous vos PLC, vos marchés créés et vos positions seront supprimés de la base de données.")) {
        executeDeleteAccount();
    }
}

async function executeDeleteAccount() {
    // Call the Supabase RPC to delete auth.user (which cascades)
    const { error } = await supabaseClient.rpc('delete_user_account');
    
    if (error) {
        showToast("Erreur lors de la suppression: " + error.message, "error");
    } else {
        await supabaseClient.auth.signOut();
        state.isLoggedIn = false;
        state.user = null;
        updateAuthUI();
        showToast("Votre compte a bien été supprimé.", "success");
        navigateTo('home');
    }
}

// --- UTILS & MOCKS ---

async function loadRecentTransactions() {
    const list = document.getElementById('transactionsList');
    const topList = document.getElementById('topMarketsList');
    if(!list && !topList) return;
    
    // Real sidebar: top markets by volume
    if(topList && state.markets && state.markets.length > 0) {
        const top = [...state.markets].sort((a,b) => (b.volume||0) - (a.volume||0)).slice(0, 5);
        topList.innerHTML = top.map((m, i) => {
            const out = m.outcomes && m.outcomes[0];
            const prob = out ? Math.round(out.probability) : 50;
            return `
                <div onclick="openMarketDetail('${m.id}')" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-color);cursor:pointer;">
                    <span style="color:var(--text-muted);font-weight:700;min-width:18px;">${i+1}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:0.9rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.title}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${formatVol(m.volume||0)} Vol.</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:1rem;font-weight:700;color:var(--accent-green);">${prob}%</div>
                    </div>
                </div>
            `;
        }).join('');
    } else if(topList) {
        topList.innerHTML = '<div class="text-muted" style="padding:12px 0;">Aucun marché disponible</div>';
    }
    
    // Recent global positions as activity feed
    if(list && supabaseClient) {
        try {
            const { data: recentPos } = await supabaseClient
                .from('positions')
                .select('*, profiles(username), outcomes(name), markets(title)')
                .order('created_at', { ascending: false })
                .limit(8);
            
            if(recentPos && recentPos.length > 0) {
                list.innerHTML = recentPos.map(p => {
                    const isBuy = p.shares > 0;
                    const color = isBuy ? 'var(--accent-green)' : 'var(--accent-red)';
                    const action = isBuy ? 'a acheté' : 'a vendu';
                    const username = p.profiles?.username || 'Anonyme';
                    const outcome = p.outcomes?.name || 'Issue';
                    const market = p.markets?.title || 'Marché';
                    return `
                        <div style="padding:10px 0;border-bottom:1px solid var(--border-color);font-size:0.85rem;">
                            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                                <span style="font-weight:600;">${username}</span>
                                <span style="color:${color};font-weight:700;">${isBuy ? '+' : '-'}${Math.abs(p.invested_amount).toFixed(1)} PLC</span>
                            </div>
                            <div style="color:var(--text-muted);">${action} <b style="color:var(--text-primary);">${outcome}</b> sur ${market}</div>
                        </div>
                    `;
                }).join('');
            } else {
                list.innerHTML = '<div class="text-muted" style="padding:12px 0;">Aucune activité récente</div>';
            }
        } catch(e) {
            list.innerHTML = '<div class="text-muted" style="padding:12px 0;">Aucune activité récente</div>';
        }
    } else if(list) {
        list.innerHTML = '<div class="text-muted" style="padding:12px 0;">Aucune activité récente</div>';
    }
}

function initTicker() {
    const tickerContent = document.getElementById('tickerContent');
    if (tickerContent) {
        tickerContent.innerHTML = `<span class="ticker-item">Bienvenue sur PolyBaguette, la version française de Polymarket !</span>`;
    }
}

function drawRealChart(market, positions) {
    const canvas = document.getElementById('marketChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0, canvas.width, canvas.height);
    
    const out1 = market.outcomes && market.outcomes[0];
    if(!out1) return;
    
    let w1 = (market.liquidity || 10) / market.outcomes.length;
    let wTotal = (market.liquidity || 10);
    
    let points = [{ x: new Date(market.created_at).getTime(), y: 0.5 }];
    
    positions.forEach(pos => {
        if(pos.outcome_id === out1.id) {
            w1 += pos.invested_amount;
        }
        wTotal += pos.invested_amount;
        points.push({ x: new Date(pos.created_at).getTime(), y: w1 / wTotal });
    });
    
    points.push({ x: Date.now(), y: w1 / wTotal });
    
    const minTime = points[0].x;
    const maxTime = points[points.length-1].x;
    const timeSpan = maxTime - minTime || 1;
    
    ctx.beginPath();
    ctx.moveTo(0, canvas.height * (1 - points[0].y));
    
    points.forEach(p => {
        const x = ((p.x - minTime) / timeSpan) * canvas.width;
        const y = canvas.height * (1 - p.y);
        ctx.lineTo(x, y);
    });
    
    ctx.strokeStyle = '#2B6FED';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
    
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    const grad = ctx.createLinearGradient(0,0,0,canvas.height);
    grad.addColorStop(0, 'rgba(43, 111, 237, 0.3)');
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
