// app.js

// State
let state = {
    isLoggedIn: false,
    user: null,
    currentMarket: null,
    tradeMode: 'buy', // 'buy' | 'sell'
    orderType: 'market', // 'market' | 'limit'
    tradeAmount: 0
};

// Formatting utilities
const formatEuro = (pc) => (pc * 0.92).toFixed(2);
const formatPC = (val) => Number(val).toFixed(2);
const formatVol = (vol) => {
    if (vol >= 1000000) return '$' + (vol / 1000000).toFixed(1) + 'M';
    if (vol >= 1000) return '$' + (vol / 1000).toFixed(1) + 'k';
    return '$' + vol;
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTicker();
    renderMarkets(MOCK_MARKETS);
    renderNews();
    renderTopics();
    
    // Check if user is logged in (mock)
    const savedUser = localStorage.getItem('polyUser');
    if (savedUser) {
        state.isLoggedIn = true;
        state.user = JSON.parse(savedUser);
        updateAuthUI();
    }
    
    // Initialize Lucide icons
    lucide.createIcons();
});

// Ticker
function initTicker() {
    const tickerContent = document.getElementById('tickerContent');
    tickerContent.innerHTML = MOCK_TICKER.map(t => `<span class="ticker-item">${t}</span>`).join('');
    // Duplicate for seamless loop
    tickerContent.innerHTML += tickerContent.innerHTML;
}

// Navigation
function navigateTo(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    if(pageId === 'home') {
        document.getElementById('homePage').classList.add('active');
        document.getElementById('navHome').classList.add('active');
        renderMarkets(MOCK_MARKETS);
    } else if (pageId === 'portfolio') {
        if(!state.isLoggedIn) {
            showToast('Vous devez être connecté pour voir votre Fournil', 'error');
            return;
        }
        document.getElementById('portfolioPage').classList.add('active');
        document.getElementById('navPortfolio').classList.add('active');
        renderPortfolio();
    } else if (pageId === 'leaderboard') {
        document.getElementById('leaderboardPage').classList.add('active');
        document.getElementById('navLeaderboard').classList.add('active');
        renderLeaderboard();
    } else if (pageId === 'profile') {
        if(!state.isLoggedIn) return;
        document.getElementById('profilePage').classList.add('active');
        renderProfile();
    }
    
    setTimeout(() => lucide.createIcons(), 50);
}

// Modals
function openModal(id) {
    document.getElementById(id).classList.add('active');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// Authentication
function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    
    state.user = {
        username,
        balance: 100, // 100 PLC offerts !
        positions: [],
        trades: 0,
        joined: new Date().toISOString()
    };
    state.isLoggedIn = true;
    localStorage.setItem('polyUser', JSON.stringify(state.user));
    
    closeModal('registerModal');
    updateAuthUI();
    showToast(`Bienvenue ${username} ! 100 PLC offerts`, 'success');
}

function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    
    // Mock login
    state.user = JSON.parse(localStorage.getItem('polyUser')) || {
        username,
        balance: 100,
        positions: [],
        trades: 0,
        joined: new Date().toISOString()
    };
    state.isLoggedIn = true;
    
    closeModal('loginModal');
    updateAuthUI();
    showToast(`Bon retour à la boulangerie, ${username} !`, 'success');
}

function logout() {
    state.isLoggedIn = false;
    state.user = null;
    updateAuthUI();
    document.getElementById('walletDropdown').classList.remove('show');
    navigateTo('home');
}

function updateAuthUI() {
    if (state.isLoggedIn) {
        document.getElementById('authButtons').style.display = 'none';
        document.getElementById('walletDisplay').style.display = 'block';
        document.getElementById('userAvatar').style.display = 'flex';
        document.getElementById('userAvatarLetter').innerText = state.user.username.charAt(0).toUpperCase();
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
    const usdEquivalent = formatEuro(bal); // using formatEuro utility
    
    // Header
    const wb = document.getElementById('walletBalance');
    if(wb) wb.innerText = formatPC(bal);
    
    // Dropdown
    const wdb = document.getElementById('walletDropdownBalance');
    if(wdb) wdb.innerText = formatPC(bal) + ' PLC';
    
    const wde = document.getElementById('walletDropdownEuro');
    if(wde) wde.innerText = `$ ${usdEquivalent} USD`;
    
    const wib = document.getElementById('walletItemBalance');
    if(wib) wib.innerText = formatPC(bal);
    
    const wie = document.getElementById('walletItemEur');
    if(wie) wie.innerText = `$ ${usdEquivalent}`;
}

function toggleWalletDropdown() {
    document.getElementById('walletDropdown').classList.toggle('show');
}

function handleSendMoney(e) {
    e.preventDefault();
    if(!state.isLoggedIn) return;
    
    const email = document.getElementById('sendEmail').value;
    const amount = parseFloat(document.getElementById('sendAmount').value);
    
    if(state.user.balance < amount) {
        showToast("Fonds insuffisants !", "error");
        return;
    }
    
    state.user.balance -= amount;
    localStorage.setItem('polyUser', JSON.stringify(state.user));
    updateWalletBalances();
    closeModal('sendModal');
    showToast(`Vous avez envoyé ${amount} PLC à ${email}`, "success");
    document.getElementById('sendEmail').value = '';
    document.getElementById('sendAmount').value = '';
}

// Markets Rendering
function renderMarkets(markets) {
    const featured = markets.find(m => m.isFeatured);
    if(featured) {
        const fmElement = document.getElementById('featuredMarket');
        if (fmElement) {
            fmElement.innerHTML = `
                <div class="fm-header">
                    <img src="${featured.icon}" class="fm-icon">
                    <div>
                        <div class="fm-title">${featured.title}</div>
                        <div class="fm-stats">
                            <span>${formatVol(featured.volume)} Vol.</span>
                            <span>Se termine le ${new Date(featured.endDate).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
                <div class="fm-outcomes">
                    ${featured.outcomes.map(o => `
                        <div class="fm-outcome">
                            <span class="fm-outcome-name">${o.name}</span>
                            <div class="fm-outcome-bar-container">
                                <div class="fm-outcome-bar" style="width: ${o.prob}%"></div>
                            </div>
                            <span class="fm-outcome-prob">${o.prob}%</span>
                        </div>
                    `).join('')}
                </div>
            `;
            fmElement.onclick = () => openMarketDetail(featured.id);
        }
    }
    
    const grid = document.getElementById('marketsGrid');
    if (grid) {
        grid.innerHTML = markets.filter(m => !m.isFeatured).map(m => `
            <div class="market-card" onclick="openMarketDetail('${m.id}')">
                <div class="mc-header">
                    <img src="${m.icon}" class="mc-icon">
                    <div class="mc-title">${m.title}</div>
                </div>
                <div class="mc-outcomes">
                    ${m.outcomes.slice(0, 2).map(o => `
                        <div class="mc-outcome-row">
                            <span class="mc-outcome-label">${o.name}</span>
                            <div>
                                <span class="mc-prob mr-2 ${o.name==='Oui' || o.name==='Up' ? 'text-green' : 'text-red'}">${o.prob}%</span>
                                <div class="mc-btns">
                                    <button class="mc-btn mc-btn-yes" onclick="event.stopPropagation(); fastTrade('${m.id}','${o.name}','buy')">Acheter</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="mc-footer">
                    <span>${formatVol(m.volume)} Vol.</span>
                    <span>${new Date(m.endDate).toLocaleDateString()}</span>
                </div>
            </div>
        `).join('');
    }
}

function openMarketDetail(id) {
    const market = MOCK_MARKETS.find(m => m.id === id);
    if(!market) return;
    
    state.currentMarket = market;
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('marketPage').classList.add('active');
    
    document.getElementById('marketBreadcrumb').innerHTML = `Pétrins > ${market.category} > ${market.title}`;
    
    document.getElementById('marketDetailHeader').innerHTML = `
        <img src="${market.icon}" class="md-icon">
        <div>
            <div class="md-title">${market.title}</div>
            <div class="md-stats">
                <span><i data-lucide="award" class="icon-sm"></i> ${formatVol(market.volume)} Vol.</span>
                <span><i data-lucide="calendar" class="icon-sm"></i> ${new Date(market.endDate).toLocaleDateString()}</span>
            </div>
        </div>
    `;
    
    document.getElementById('tradingPanelHeader').innerHTML = `
        <img src="${market.icon}" class="tp-icon">
        <div class="tp-title">${market.title}</div>
    `;
    
    renderMarketOutcomes(market);
    renderTradingChoices(market);
    drawMockChart();
    
    // default tabs
    document.getElementById('marketTabContent').innerHTML = `
        <h3>Règles du marché</h3>
        <p>${market.description}</p>
    `;
    setTimeout(() => lucide.createIcons(), 50);
}

function renderMarketOutcomes(market) {
    document.getElementById('marketOutcomesList').innerHTML = market.outcomes.map(o => `
        <div class="md-outcome-row">
            <div class="md-outcome-left">
                <div class="md-outcome-name">${o.name}</div>
                <div class="md-outcome-vol">${o.volume ? formatVol(o.volume) + ' Vol.' : ''}</div>
            </div>
            <div class="md-outcome-center">${o.prob}%</div>
            <div class="md-outcome-right">
                <button class="btn-buy-yes" onclick="setupTrade('${o.name}')">Oui ${o.yesPrice ? o.yesPrice+'¢' : ''}</button>
                <button class="btn-buy-no" onclick="setupTrade('${o.name}')">Non ${o.noPrice ? o.noPrice+'¢' : ''}</button>
            </div>
        </div>
    `).join('');
}

function renderTradingChoices(market) {
    const isBinary = market.outcomes.length === 2 && (market.outcomes[0].name === 'Oui' || market.outcomes[0].name === 'Up');
    
    if(isBinary) {
        document.getElementById('tradingChoices').innerHTML = `
            <button class="choice-btn choice-btn-yes selected" onclick="selectOutcome('${market.outcomes[0].name}', this)">
                ${market.outcomes[0].name} <span>${market.outcomes[0].prob}¢</span>
            </button>
            <button class="choice-btn choice-btn-no" onclick="selectOutcome('${market.outcomes[1].name}', this)">
                ${market.outcomes[1].name} <span>${market.outcomes[1].prob}¢</span>
            </button>
        `;
        state.selectedOutcome = market.outcomes[0];
    } else {
        document.getElementById('tradingChoices').innerHTML = `
            <select style="width:100%; padding: 12px; background:var(--bg-main); color:white; border:1px solid var(--border-color); border-radius:8px;" onchange="selectOutcome(this.value)">
                ${market.outcomes.map(o => `<option value="${o.name}">${o.name} - ${o.prob}¢</option>`).join('')}
            </select>
        `;
        state.selectedOutcome = market.outcomes[0];
    }
    updateTradePreview();
}

// Trading Logic
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
    
    const prob = state.selectedOutcome.prob / 100;
    const shares = prob > 0 ? (amount / prob).toFixed(2) : 0;
    const potential = (shares * 1).toFixed(2); // 1 PLC per winning share
    
    document.getElementById('previewShares').innerText = shares;
    document.getElementById('previewProfit').innerText = `+${potential} PLC`;
    
    const btn = document.getElementById('tradeButton');
    if(amount > 0) {
        btn.classList.add('active-yes');
        btn.innerText = `Enfourner ${state.selectedOutcome.name}`;
    } else {
        btn.classList.remove('active-yes', 'active-no');
        btn.innerText = 'Négocier';
    }
}

function executeTrade() {
    if(!state.isLoggedIn) {
        openModal('loginModal');
        return;
    }
    
    if(state.tradeAmount <= 0) return;
    
    if(state.user.balance < state.tradeAmount) {
        showToast('Fonds insuffisants ! Pain Brûlé en vue...', 'error');
        return;
    }
    
    // Execute mock trade
    state.user.balance -= state.tradeAmount;
    state.user.trades++;
    
    const prob = state.selectedOutcome.prob / 100;
    const shares = state.tradeAmount / prob;
    
    state.user.positions.push({
        marketId: state.currentMarket.id,
        marketTitle: state.currentMarket.title,
        outcome: state.selectedOutcome.name,
        shares: shares,
        invested: state.tradeAmount,
        date: new Date().toISOString()
    });
    
    localStorage.setItem('polyUser', JSON.stringify(state.user));
    updateAuthUI();
    
    showToast(`Vous avez enfourné ${state.tradeAmount} PLC sur ${state.selectedOutcome.name}`, 'success');
    document.getElementById('tradeAmount').value = 0;
    updateTradePreview();
}

function fastTrade(marketId, outcome, type) {
    openMarketDetail(marketId);
}

// Chart Mock
function drawMockChart() {
    const canvas = document.getElementById('marketChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0, canvas.width, canvas.height);
    
    // Draw simple line chart
    ctx.beginPath();
    ctx.moveTo(0, canvas.height/2);
    for(let i=0; i<canvas.width; i+=10) {
        ctx.lineTo(i, canvas.height/2 + (Math.random()-0.5)*50);
    }
    ctx.strokeStyle = '#2B6FED';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // fill gradient
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    const grad = ctx.createLinearGradient(0,0,0,canvas.height);
    grad.addColorStop(0, 'rgba(43, 111, 237, 0.2)');
    grad.addColorStop(1, 'rgba(43, 111, 237, 0)');
    ctx.fillStyle = grad;
    ctx.fill();
}

// Leaderboard
function renderLeaderboard() {
    const podium = document.getElementById('leaderboardPodium');
    const table = document.getElementById('leaderboardTable');
    
    table.innerHTML = `
        <div class="lb-row lb-header">
            <div class="lb-rank">#</div>
            <div class="lb-user">Boulanger</div>
            <div class="lb-score">Fournil (PLC)</div>
            <div class="lb-trend">Tendance</div>
        </div>
        ${MOCK_LEADERBOARD.map((u, i) => `
            <div class="lb-row">
                <div class="lb-rank">${i+1}</div>
                <div class="lb-user">
                    <div class="lb-avatar">${u.name[0]}</div>
                    ${u.name}
                </div>
                <div class="lb-score">${u.score.toLocaleString()} PLC</div>
                <div class="lb-trend text-green">${u.trend}</div>
            </div>
        `).join('')}
    `;
    
    document.getElementById('hofGrid').innerHTML = `
        <div class="hof-card">
            <div class="hof-title">Record Absolu</div>
            <div class="hof-value">250 000 PLC</div>
            <div class="hof-user">Marc</div>
        </div>
        <div class="hof-card">
            <div class="hof-title">Plus long streak</div>
            <div class="hof-value">24 Victoires</div>
            <div class="hof-user">BaguettePro</div>
        </div>
        <div class="hof-card">
            <div class="hof-title">Plus gros comeback</div>
            <div class="hof-value">0 → 14k PLC</div>
            <div class="hof-user">Julie</div>
        </div>
    `;
}

// Portfolio
function renderPortfolio() {
    if(!state.user) return;
    
    const invested = state.user.positions.reduce((sum, p) => sum + p.invested, 0);
    const total = state.user.balance + invested;
    
    document.getElementById('portBalance').innerText = formatPC(state.user.balance) + ' PLC';
    document.getElementById('portPositions').innerText = formatPC(invested) + ' PLC';
    document.getElementById('portTotal').innerText = formatPC(total) + ' PLC';
    document.getElementById('portTrades').innerText = state.user.trades;
    
    const content = document.getElementById('portfolioContent');
    if(state.user.positions.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <i data-lucide="cookie" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 16px;"></i>
                <p>Votre fournil est vide ! Allez enfourner sur un pétrin.</p>
                <button class="btn-primary" onclick="navigateTo('home')">Explorer les pétrins</button>
            </div>
        `;
        setTimeout(() => lucide.createIcons(), 50);
        return;
    }
    
    content.innerHTML = state.user.positions.map(p => `
        <div class="position-card">
            <div class="pos-market">
                <div>
                    <div class="pos-title">${p.marketTitle}</div>
                    <span class="pos-outcome ${p.outcome==='Oui'||p.outcome==='Up'?'yes':'no'}">${p.outcome}</span>
                </div>
            </div>
            <div class="pos-stats">
                <div class="pos-stat-col">
                    <span class="pos-stat-label">Parts</span>
                    <span class="pos-stat-val">${p.shares.toFixed(2)}</span>
                </div>
                <div class="pos-stat-col">
                    <span class="pos-stat-label">Investi</span>
                    <span class="pos-stat-val">${p.invested.toFixed(2)} PLC</span>
                </div>
                <div class="pos-stat-col">
                    <span class="pos-stat-label">Valeur (est.)</span>
                    <span class="pos-stat-val text-green">${(p.invested * 1.05).toFixed(2)} PLC</span>
                </div>
                <button class="btn-secondary" onclick="showToast('Défournement réussi', 'success')">Défourner</button>
            </div>
        </div>
    `).join('');
    setTimeout(() => lucide.createIcons(), 50);
}

// Profile
function renderProfile() {
    if(!state.user) return;
    const content = document.getElementById('profileContent');
    
    content.innerHTML = `
        <div class="profile-header">
            <div class="profile-avatar-large">${state.user.username[0].toUpperCase()}</div>
            <div class="profile-info">
                <h1>${state.user.username}</h1>
                <div class="profile-date">Dans la boulangerie depuis ${new Date(state.user.joined).toLocaleDateString()}</div>
            </div>
        </div>
        <div class="profile-stats-grid">
            <div class="portfolio-card">
                <span class="portfolio-label">Fournil Actuel</span>
                <span class="portfolio-value">${formatPC(state.user.balance)} PLC</span>
            </div>
            <div class="portfolio-card">
                <span class="portfolio-label">Trades Totaux</span>
                <span class="portfolio-value">${state.user.trades}</span>
            </div>
            <div class="portfolio-card">
                <span class="portfolio-label">Ratio Victoire</span>
                <span class="portfolio-value text-green">0%</span>
            </div>
            <div class="portfolio-card">
                <span class="portfolio-label">Marchés Créés</span>
                <span class="portfolio-value">0</span>
            </div>
        </div>
        <div class="badges-section">
            <h2>🏆 Badges & Achievements</h2>
            <div class="badges-grid">
                ${BADGES.map(b => `
                    <div class="badge-card ${state.user.trades > 0 && b.id === 'croissant' ? 'unlocked' : ''}">
                        <i data-lucide="${b.icon}" class="badge-icon"></i>
                        <div class="badge-name">${b.name}</div>
                        <div class="text-muted" style="font-size:0.75rem; margin-top:4px;">${b.desc}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        <div style="margin-top: 32px; text-align:center;">
            <button class="btn-secondary btn-danger" onclick="resetAccount()"><i data-lucide="rotate-ccw"></i> Nouveau Départ (Remise à 100 PLC)</button>
        </div>
    `;
    setTimeout(() => lucide.createIcons(), 50);
}

function resetAccount() {
    if(confirm("Êtes-vous sûr ? Vous perdrez tout votre historique et vos badges, et retomberez à 100 PLC. C'est irréversible !")) {
        state.user.balance = 100;
        state.user.positions = [];
        state.user.trades = 0;
        localStorage.setItem('polyUser', JSON.stringify(state.user));
        showToast("Nouveau départ effectué. 100 PLC rechargés.", "success");
        renderProfile();
        updateWalletBalances();
    }
}

// Create Market
function handleCreateMarket(e) {
    e.preventDefault();
    if(!state.isLoggedIn) return;
    
    const liq = parseFloat(document.getElementById('cmLiquidity').value);
    if(state.user.balance < liq) {
        showToast("Fonds insuffisants pour apporter la liquidité.", "error");
        return;
    }
    
    state.user.balance -= liq;
    localStorage.setItem('polyUser', JSON.stringify(state.user));
    updateWalletBalances();
    closeModal('createMarketModal');
    showToast("Votre Pétrin a été mis au four ! Il sera validé sous peu.", "success");
}

// Sidebars
function renderNews() {
    const list = document.getElementById('newsList');
    if (list) {
        list.innerHTML = MOCK_MARKETS[0].news.map((n,i) => `
            <div class="news-item">
                <div class="news-num">${i+1}</div>
                <div class="news-title">${n.text}</div>
                <div class="news-prob">
                    ${n.prob}%
                    <span class="news-trend text-green"><i data-lucide="arrow-up-right" class="icon-sm"></i></span>
                </div>
            </div>
        `).join('');
    }
}
function renderTopics() {
    const list = document.getElementById('topicsList');
    if (list) {
        list.innerHTML = ['Evo', 'SpaceX', 'Rocha', 'Spurs', 'NBA'].map((t,i) => `
            <div class="topic-item">
                <div class="topic-name">
                    <span class="news-num">${i+1}</span>
                    ${t}
                </div>
                <span class="text-muted">$${Math.floor(Math.random()*10)}M ></span>
            </div>
        `).join('');
    }
}

// UI Helpers
function showToast(msg, type='info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <div style="width:8px; height:8px; border-radius:50%; background: ${type==='error'?'var(--accent-red)':'var(--accent-green)'}"></div>
        <div>${msg}</div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Expose minimal jQuery-like helper for simplicity if needed
HTMLElement.prototype.contains = function(text) {
    return this.innerText.includes(text);
};

// Initial setup call
navigateTo('home');
