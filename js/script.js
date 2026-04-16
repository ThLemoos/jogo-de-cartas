const COLORS = ['red', 'green', 'blue', 'yellow'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Skip', 'Reverse', '+2'];
const COLOR_CSS = { red: '#e74c3c', green: '#27ae60', blue: '#2980b9', yellow: '#f39c12' };
const COLOR_PT = { red: 'Vermelho', green: 'Verde', blue: 'Azul', yellow: 'Amarelo' };
const ICONS = { Skip: '⊘', Reverse: '⇄', '+2': '+2', Wild: '★', 'Wild+4': '★+4' };

let deck, discard, playerHand, cpuHand;
let currentColor, currentValue;
let isPlayerTurn, pendingWild, unoCalled, animLock;

function buildDeck() {
    const d = [];
    for (const color of COLORS) {
        for (const value of VALUES) {
            d.push({ color, value });
            if (value !== '0') d.push({ color, value });
        }
    }
    for (let i = 0; i < 4; i++) d.push({ color: 'black', value: 'Wild' });
    for (let i = 0; i < 4; i++) d.push({ color: 'black', value: 'Wild+4' });
    return d;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function drawCards(n = 1) {
    const result = [];
    for (let i = 0; i < n; i++) {
        if (deck.length === 0) {
            const top = discard[discard.length - 1];
            deck = shuffle(discard.splice(0, discard.length - 1));
            discard.push(top);
        }
        if (deck.length > 0) result.push(deck.pop());
    }
    return result;
}

function initGame() {
    animLock = false;
    unoCalled = false;
    pendingWild = false;

    deck = shuffle(buildDeck());
    discard = [];
    playerHand = drawCards(7);
    cpuHand = drawCards(7);

    let first;
    do { first = drawCards(1)[0]; } while (first.color === 'black');
    discard.push(first);
    currentColor = first.color;
    currentValue = first.value;
    isPlayerTurn = true;

    renderAll(true);

    if (first.value === '+2') {
        playerHand.push(...drawCards(2));
        isPlayerTurn = false;
        renderAll();
        setTimeout(cpuTurn, 900);
    } else if (first.value === 'Skip' || first.value === 'Reverse') {
        isPlayerTurn = false;
        renderAll();
        setTimeout(cpuTurn, 900);
    }
}

function canPlay(card) {
    return card.value === 'Wild'
        || card.value === 'Wild+4'
        || card.color === currentColor
        || card.value === currentValue;
}

function renderAll(deal = false) {
    renderCpu(deal);
    renderPlayer(deal);
    renderDiscard(false);
    renderMeta();
}

function renderCpu(deal = false) {
    const ch = document.getElementById('cpu-hand');
    ch.innerHTML = '';
    cpuHand.forEach((_, i) => {
        const el = document.createElement('div');
        el.className = 'card-back';
        if (deal) {
            el.classList.add('anim-deal');
            el.style.animationDelay = (i * 0.045) + 's';
        }
        ch.appendChild(el);
    });
    document.getElementById('cpu-count').textContent = cpuHand.length;
}

function renderPlayer(deal = false) {
    const ph = document.getElementById('player-hand');
    ph.innerHTML = '';

    playerHand.forEach((card, i) => {
        const el = makeCardEl(card);
        if (deal) {
            el.classList.add('anim-deal');
            el.style.animationDelay = (i * 0.045) + 's';
        }
        if (canPlay(card) && isPlayerTurn && !animLock) {
            el.classList.add('playable');
            el.addEventListener('click', () => playCard(i));
        } else {
            el.classList.add('unplayable');
        }
        ph.appendChild(el);
    });

    document.getElementById('player-count').textContent = playerHand.length;

    const unoBtn = document.getElementById('uno-btn');
    unoBtn.style.display = (isPlayerTurn && playerHand.length === 2) ? 'block' : 'none';
}

function renderDiscard(animate = false, fromCpu = false) {
    const zone = document.getElementById('discard-zone');
    if (discard.length === 0) { zone.innerHTML = ''; return; }

    const top = discard[discard.length - 1];
    zone.innerHTML = '';
    const el = makeCardEl(top);
    el.style.cursor = 'default';

    const rot = (Math.random() * 22 - 11).toFixed(1);

    if (animate) {
        el.classList.add(fromCpu ? 'anim-cpu-fly' : 'anim-pop');
    } else {
        el.style.transform = `rotate(${rot}deg)`;
    }

    zone.appendChild(el);
}

function renderMeta() {
    const pill = document.getElementById('active-color-pill');
    if (currentColor === 'black') {
        pill.textContent = '—';
        pill.style.background = '#555';
    } else {
        pill.textContent = COLOR_PT[currentColor];
        pill.style.background = COLOR_CSS[currentColor];
    }

    const drawPile = document.getElementById('draw-pile');
    drawPile.className = (!isPlayerTurn || animLock) ? 'disabled' : '';

    document.getElementById('player-dot').style.background = isPlayerTurn ? '#e94560' : 'rgba(255,255,255,0.2)';
    document.getElementById('cpu-dot').style.background = !isPlayerTurn ? '#f39c12' : 'rgba(255,255,255,0.2)';
}

function makeCardEl(card) {
    const el = document.createElement('div');
    el.className = 'card';

    const bg = card.color === 'black' ? '#2c3e50' : COLOR_CSS[card.color];
    const txt = isNaN(card.value) ? (ICONS[card.value] || card.value) : card.value;

    el.style.background = bg;
    el.innerHTML = `
        <span class="corner tl">${txt}</span>
        <div class="oval"></div>
        <span class="val">${txt}</span>
        <span class="corner br">${txt}</span>
    `;
    return el;
}

function animateCardsToHand(cards, targetId, stagger = 160) {
    return new Promise(resolve => {
        const drawPileEl = document.querySelector('#draw-pile .pile-inner');
        const targetArea = document.getElementById(targetId);

        const fromRect = drawPileEl.getBoundingClientRect();
        const toRect = targetArea.getBoundingClientRect();

        const dx = fromRect.left - toRect.left;
        const dy = fromRect.top - toRect.top;

        let done = 0;

        cards.forEach((card, i) => {
            const isCpu = (targetId === 'cpu-hand');
            const el = isCpu ? (() => {
                const d = document.createElement('div');
                d.className = 'card-back';
                return d;
            })() : makeCardEl(card);

            el.classList.add('anim-draw');
            el.style.setProperty('--dx', dx + 'px');
            el.style.setProperty('--dy', dy + 'px');
            el.style.setProperty('--dr', (Math.random() * 24 - 12).toFixed(1) + 'deg');
            el.style.animationDuration = '0.48s';
            el.style.animationDelay = (i * stagger / 1000) + 's';
            el.style.position = 'absolute';
            el.style.left = '0';
            el.style.top = '0';
            el.style.zIndex = '100';
            el.style.pointerEvents = 'none';

            targetArea.appendChild(el);

            const totalDelay = i * stagger + 480;
            setTimeout(() => {
                el.remove();
                done++;
                if (done === cards.length) resolve();
            }, totalDelay);
        });

        if (cards.length === 0) resolve();
    });
}

function playCard(idx) {
    if (!isPlayerTurn || animLock) return;
    const card = playerHand[idx];
    if (!canPlay(card)) return;

    animLock = true;

    const ph = document.getElementById('player-hand');
    const zone = document.getElementById('discard-zone');
    const cards = ph.querySelectorAll('.card');

    let fx = 0, fy = 0;
    if (cards[idx]) {
        const fromRect = cards[idx].getBoundingClientRect();
        const toRect = zone.getBoundingClientRect();
        fx = fromRect.left - toRect.left;
        fy = fromRect.top - toRect.top;
    }

    playerHand.splice(idx, 1);
    discard.push(card);
    currentValue = card.value;
    if (card.color !== 'black') currentColor = card.color;

    renderPlayer();

    const flyEl = makeCardEl(card);
    flyEl.classList.add('anim-fly');
    flyEl.style.setProperty('--fx', fx + 'px');
    flyEl.style.setProperty('--fy', fy + 'px');
    flyEl.style.setProperty('--fr', (Math.random() * 20 - 10).toFixed(1) + 'deg');
    flyEl.style.position = 'absolute';
    flyEl.style.left = '0';
    flyEl.style.top = '0';
    flyEl.style.zIndex = '50';
    zone.innerHTML = '';
    zone.appendChild(flyEl);

    setTimeout(() => {
        animLock = false;
        renderDiscard(false);

        if (card.color === 'black') {
            pendingWild = card.value === 'Wild+4' ? 'wild4' : 'wild';
            document.getElementById('overlay').style.display = 'flex';
            renderMeta();
            return;
        }

        if (playerHand.length === 0) { endGame('player'); return; }
        applyEffect(card, 'player');
    }, 470);
}

function playerDraw() {
    if (!isPlayerTurn || animLock) return;

    animLock = true;
    const drawn = drawCards(1);

    setStatus('Você comprou uma carta.');

    animateCardsToHand(drawn, 'player-hand', 0).then(() => {
        playerHand.push(...drawn);
        isPlayerTurn = false;
        animLock = false;
        renderPlayer();
        renderMeta();
        cpuTurn();
    });
}

function pickColor(col) {
    document.getElementById('overlay').style.display = 'none';
    currentColor = col;

    if (pendingWild === 'wild4') {
        const drawn = drawCards(4);
        animLock = true;
        setStatus(`CPU comprou 4 cartas! Cor: ${COLOR_PT[col]}`);

        animateCardsToHand(drawn, 'cpu-hand', 160).then(() => {
            cpuHand.push(...drawn);
            renderCpu();
            animLock = false;
            if (playerHand.length === 0) { endGame('player'); return; }
            isPlayerTurn = false;
            renderPlayer();
            renderMeta();
            setTimeout(cpuTurn, 600);
        });
    } else {
        setStatus(`Cor escolhida: ${COLOR_PT[col]}`);
        pendingWild = false;
        if (playerHand.length === 0) { endGame('player'); return; }
        isPlayerTurn = false;
        renderPlayer();
        renderMeta();
        setTimeout(cpuTurn, 900);
    }

    pendingWild = false;
}

function cpuTurn() {
    if (isPlayerTurn || animLock) return;
    animLock = true;

    setTimeout(() => {
        const playable = cpuHand.filter(c => canPlay(c));

        if (playable.length > 0) {
            let choice = playable.find(c => c.color !== 'black') || playable[0];
            const idx = cpuHand.indexOf(choice);
            cpuHand.splice(idx, 1);
            discard.push(choice);
            currentValue = choice.value;

            if (choice.color === 'black') {
                const cnt = {};
                cpuHand.forEach(c => {
                    if (c.color !== 'black') cnt[c.color] = (cnt[c.color] || 0) + 1;
                });
                currentColor = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]
                    || COLORS[Math.floor(Math.random() * 4)];

                if (choice.value === 'Wild+4') {
                    const drawn = drawCards(4);
                    setStatus(`CPU jogou Wild+4! Você comprou 4. Cor: ${COLOR_PT[currentColor]}`);

                    renderCpu();
                    renderDiscard(true, true);

                    animateCardsToHand(drawn, 'player-hand', 160).then(() => {
                        playerHand.push(...drawn);
                        renderPlayer();
                        animLock = false;
                        if (cpuHand.length === 0) { endGame('cpu'); return; }
                        isPlayerTurn = true;
                        renderMeta();
                    });
                    return;
                } else {
                    setStatus(`CPU jogou coringa! Cor: ${COLOR_PT[currentColor]}`);
                }
            } else {
                currentColor = choice.color;
                if (cpuHand.length === 1) setStatus('CPU tem 1 carta — UNO!');
                else setStatus(`CPU jogou ${choice.value}`);
            }

            renderCpu();
            renderDiscard(true, true);

            setTimeout(() => {
                animLock = false;
                if (cpuHand.length === 0) { endGame('cpu'); return; }
                if (choice.color !== 'black') applyEffect(choice, 'cpu');
                else {
                    isPlayerTurn = true;
                    renderPlayer();
                    renderMeta();
                }
            }, 500);

        } else {
            const drawn = drawCards(1);
            setStatus('CPU comprou uma carta.');

            animateCardsToHand(drawn, 'cpu-hand', 0).then(() => {
                if (drawn.length > 0) cpuHand.push(...drawn);
                renderCpu();
                animLock = false;
                isPlayerTurn = true;
                renderPlayer();
                renderMeta();
            });
        }
    }, 450);
}

function applyEffect(card, by) {
    if (card.value === 'Skip') {
        if (by === 'player') {
            setStatus('CPU teve a vez pulada!');
            isPlayerTurn = false;
            renderMeta();
            setTimeout(cpuTurn, 900);
        } else {
            setStatus('Sua vez foi pulada!');
            isPlayerTurn = false;
            renderMeta();
            setTimeout(cpuTurn, 900);
        }
        return;
    }

    if (card.value === 'Reverse') {
        if (by === 'player') {
            setStatus('Inverteu! Você joga de novo.');
            isPlayerTurn = true;
            renderPlayer();
            renderMeta();
        } else {
            setStatus('CPU inverteu! Você joga de novo.');
            isPlayerTurn = true;
            renderPlayer();
            renderMeta();
        }
        return;
    }

    if (card.value === '+2') {
        if (by === 'player') {
            const drawn = drawCards(2);
            setStatus('CPU comprou 2 cartas!');
            animLock = true;

            animateCardsToHand(drawn, 'cpu-hand', 160).then(() => {
                cpuHand.push(...drawn);
                renderCpu();
                animLock = false;
                isPlayerTurn = false;
                renderMeta();
                setTimeout(cpuTurn, 600);
            });
        } else {
            const drawn = drawCards(2);
            setStatus('Você comprou 2 cartas!');
            animLock = true;

            animateCardsToHand(drawn, 'player-hand', 160).then(() => {
                playerHand.push(...drawn);
                renderPlayer();
                animLock = false;
                isPlayerTurn = true;
                renderMeta();
            });
        }
        return;
    }

    if (by === 'player') {
        isPlayerTurn = false;
        setStatus('CPU está pensando...');
        renderMeta();
        setTimeout(cpuTurn, 750);
    } else {
        isPlayerTurn = true;
        setStatus('Sua vez! Escolha uma carta.');
        renderPlayer();
        renderMeta();
    }
}

function callUno() {
    if (playerHand.length === 2) {
        unoCalled = true;
        setStatus('UNO!');
    }
}

function checkUno(by) {
    if (by === 'player' && playerHand.length === 1 && !unoCalled) {
        playerHand.push(...drawCards(1));
        setStatus('Esqueceu de gritar UNO! +1 carta de penalidade.');
        renderPlayer();
    }
    unoCalled = false;
}

function endGame(winner) {
    animLock = false;
    isPlayerTurn = false;
    renderMeta();
    if (winner === 'player') {
        setStatus('🎉 Você ganhou! Parabéns!');
    } else {
        setStatus('CPU ganhou! Clique em ↺ para tentar de novo.');
    }
    document.querySelectorAll('#player-hand .card.playable').forEach(c => {
        c.classList.remove('playable');
        c.classList.add('unplayable');
    });
}

function setStatus(msg) {
    document.getElementById('status').textContent = msg;
}

window.addEventListener('DOMContentLoaded', initGame);