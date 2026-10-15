// ===== MODO ONLINE (2 jogadores) + LOBBY =====
// Conexão direta entre os dois navegadores via PeerJS (WebRTC).
// O ANFITRIÃO (quem cria a sala) guarda o baralho e as duas mãos e valida as jogadas.
// O CONVIDADO só manda ações ("joguei a carta 3", "comprei") e recebe de volta a sua visão do jogo.
// As regras são as mesmas do modo CPU.

const ROOM_PREFIX = 'jdc-sandy-';
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I pra não confundir

let peer = null;
let conn = null;
let isHost = false;
let myName = 'Jogador';
let oppName = 'Adversário';
let G = null;               // estado do jogo (só existe no anfitrião)
let pendingWildIdx = null;  // índice do coringa esperando escolha de cor
let joinTimer = null;

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- LOBBY

function loadName() {
    try { return localStorage.getItem('jdc-name') || ''; } catch (e) { return ''; }
}

function saveName() {
    const raw = ($('player-name').value || '').trim().slice(0, 16);
    myName = raw || 'Jogador';
    try { localStorage.setItem('jdc-name', raw); } catch (e) { /* ignora */ }
}

function cleanName(n) {
    return (typeof n === 'string' ? n : '').trim().slice(0, 16) || 'Adversário';
}

function lobbyView(name) {
    if (name === 'menu') closeOnline();
    ['menu', 'host', 'join'].forEach(v => {
        $('lobby-' + v).style.display = (v === name) ? 'flex' : 'none';
    });
    $('host-msg').textContent = '';
    $('host-msg').classList.remove('error');
    $('join-msg').textContent = '';
    $('join-msg').classList.remove('error');
}

function lobbyMsg(id, text, isError) {
    const el = $(id);
    el.textContent = text;
    el.classList.toggle('error', !!isError);
}

let lobbyFirstShow = true;

function showLobby() {
    closeOnline();
    MODE = 'lobby';
    pendingWildIdx = null;
    ['overlay', 'end-overlay', 'zoom-overlay'].forEach(id => { $(id).style.display = 'none'; });
    $('lobby').style.display = 'flex';
    $('player-name').value = loadName();
    lobbyView('menu');

    // link de convite: ...index.html?sala=K7P2M
    if (lobbyFirstShow) {
        lobbyFirstShow = false;
        const sala = new URLSearchParams(location.search).get('sala');
        if (sala) {
            lobbyView('join');
            $('join-code').value = sala.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
            if ($('join-code').value.length >= 4) joinRoom();
        }
    }
}

function hideLobby() {
    $('lobby').style.display = 'none';
}

function backToMenu() {
    if (MODE === 'online' && !confirm('Sair da partida online?')) return;
    showLobby();
}

function startCpuGame() {
    saveName();
    closeOnline();
    MODE = 'cpu';
    hideLobby();
    $('cpu-name').textContent = 'CPU';
    initGame();
}

function peerJsOk(msgId) {
    if (typeof Peer === 'undefined') {
        lobbyMsg(msgId, 'Não foi possível carregar o modo online. Verifique a internet e recarregue a página.', true);
        return false;
    }
    return true;
}

function randomCode() {
    let c = '';
    for (let i = 0; i < 5; i++) c += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    return c;
}

// ---------------------------------------------------------------- CONEXÃO

function closeOnline() {
    clearTimeout(joinTimer);
    const c = conn, p = peer;
    conn = null;
    peer = null;
    G = null;
    isHost = false;
    try { if (c) c.close(); } catch (e) { /* ignora */ }
    try { if (p) p.destroy(); } catch (e) { /* ignora */ }
}

function hostRoom() {
    saveName();
    lobbyView('host');
    $('room-code').textContent = '·····';
    if (!peerJsOk('host-msg')) return;
    lobbyMsg('host-msg', 'Criando sala...');
    isHost = true;
    createRoom(0);
}

function createRoom(attempt) {
    const code = randomCode();
    const p = new Peer(ROOM_PREFIX + code);
    peer = p;

    p.on('open', () => {
        if (peer !== p) return;
        $('room-code').textContent = code;
        lobbyMsg('host-msg', 'Aguardando seu amigo entrar...');
    });

    p.on('connection', c => {
        if (peer !== p) return;
        if (conn && conn.open) {            // sala já tem 2 jogadores
            c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); });
            return;
        }
        conn = c;
        wireConn(c);
    });

    p.on('disconnected', () => {
        if (peer !== p) return;
        try { p.reconnect(); } catch (e) { /* ignora */ }
    });

    p.on('error', err => {
        if (peer !== p) return;
        if (err.type === 'unavailable-id' && attempt < 5) {
            peer = null;
            try { p.destroy(); } catch (e) { /* ignora */ }
            createRoom(attempt + 1);
            return;
        }
        if (MODE !== 'online') lobbyMsg('host-msg', 'Erro ao criar a sala (' + err.type + '). Tente de novo.', true);
    });
}

function copyInvite() {
    const code = $('room-code').textContent;
    if (!/^[A-Z0-9]{4,8}$/.test(code)) return;
    const url = location.origin + location.pathname + '?sala=' + code;
    const done = () => lobbyMsg('host-msg', 'Link copiado! Mande para seu amigo.');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, () => prompt('Copie o link:', url));
    } else {
        prompt('Copie o link:', url);
    }
}

function joinRoom() {
    saveName();
    const code = $('join-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) { lobbyMsg('join-msg', 'Digite o código da sala.', true); return; }
    if (!peerJsOk('join-msg')) return;

    closeOnline();
    isHost = false;
    lobbyMsg('join-msg', 'Conectando...');

    const p = new Peer();
    peer = p;

    p.on('open', () => {
        if (peer !== p) return;
        const c = p.connect(ROOM_PREFIX + code, { reliable: true });
        conn = c;
        wireConn(c);
        joinTimer = setTimeout(() => {
            if (conn === c && !c.open) {
                closeOnline();
                lobbyMsg('join-msg', 'Não consegui conectar. Confira o código e tente de novo.', true);
            }
        }, 15000);
    });

    p.on('error', err => {
        if (peer !== p) return;
        if (err.type === 'peer-unavailable') {
            closeOnline();
            lobbyMsg('join-msg', 'Sala não encontrada. Confira o código.', true);
        } else if (MODE !== 'online') {
            closeOnline();
            lobbyMsg('join-msg', 'Erro de conexão (' + err.type + '). Tente de novo.', true);
        }
    });
}

function wireConn(c) {
    c.on('open', () => {
        if (conn !== c) return;
        clearTimeout(joinTimer);
        if (!isHost) c.send({ t: 'hello', name: myName });
    });
    c.on('data', m => { if (conn === c) onData(m); });
    c.on('close', () => { if (conn === c) onConnClosed(); });
    c.on('error', () => { if (conn === c) onConnClosed(); });
}

function onConnClosed() {
    const wasPlaying = (MODE === 'online');
    if (isHost && !wasPlaying) {
        // amigo saiu antes de começar: continua esperando
        conn = null;
        lobbyMsg('host-msg', 'Seu amigo saiu. Aguardando alguém entrar...');
        return;
    }
    if (wasPlaying) alert('Seu adversário saiu da partida.');
    showLobby();
}

function onData(m) {
    if (!m || typeof m !== 'object') return;

    if (isHost) {
        switch (m.t) {
            case 'hello':
                oppName = cleanName(m.name);
                conn.send({ t: 'welcome', name: myName });
                startOnlineGame();
                break;
            case 'play': handleAction(1, { t: 'play', idx: m.idx, color: m.color }); break;
            case 'draw': handleAction(1, { t: 'draw' }); break;
            case 'uno': handleAction(1, { t: 'uno' }); break;
            case 'again': startOnlineGame(); break;
        }
    } else {
        switch (m.t) {
            case 'welcome': oppName = cleanName(m.name); break;
            case 'state': applyView(m.view); break;
            case 'full':
                closeOnline();
                lobbyMsg('join-msg', 'Essa sala já está cheia.', true);
                break;
        }
    }
}

// ---------------------------------------------------------------- REGRAS (só roda no anfitrião)

function gDraw(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
        if (G.deck.length === 0) {
            const top = G.discard[G.discard.length - 1];
            G.deck = shuffle(G.discard.splice(0, G.discard.length - 1));
            G.discard.push(top);
        }
        if (G.deck.length > 0) out.push(G.deck.pop());
    }
    return out;
}

function gCanPlay(card) {
    return card.value === 'Wild' || card.value === 'Wild+4'
        || card.color === G.color || card.value === G.value;
}

function startOnlineGame() {
    MODE = 'online';
    G = { deck: shuffle(buildDeck()), discard: [], hands: [[], []], turn: 0, color: null, value: null, winner: null, seq: 0 };
    G.hands[0] = gDraw(7);
    G.hands[1] = gDraw(7);

    let first;
    for (; ;) {
        first = gDraw(1)[0];
        if (first.color !== 'black') break;
        G.deck.unshift(first);              // coringa não abre o jogo: volta pro fundo do baralho
    }
    G.discard.push(first);
    G.color = first.color;
    G.value = first.value;
    G.turn = 0;

    // mesmo comportamento do modo CPU: efeito da primeira carta cai no jogador 0
    if (first.value === '+2') {
        G.hands[0].push(...gDraw(2));
        G.turn = 1;
    } else if (first.value === 'Skip' || first.value === 'Reverse') {
        G.turn = 1;
    }

    broadcast({ type: 'start', first: first.value });
}

function handleAction(pid, m) {
    if (!G || G.winner !== null || G.turn !== pid) return;
    const mine = G.hands[pid];
    const opp = 1 - pid;
    let ev;

    if (m.t === 'draw') {
        mine.push(...gDraw(1));
        G.turn = opp;
        ev = { type: 'draw', by: pid };

    } else if (m.t === 'uno') {
        if (mine.length !== 2) return;
        ev = { type: 'uno', by: pid };

    } else if (m.t === 'play') {
        if (!Number.isInteger(m.idx)) return;
        const card = mine[m.idx];
        if (!card || !gCanPlay(card)) return;
        let color = null;
        if (card.color === 'black') {
            if (!COLORS.includes(m.color)) return;
            color = m.color;
        }

        mine.splice(m.idx, 1);
        G.discard.push(card);
        G.value = card.value;
        G.color = card.color === 'black' ? color : card.color;
        ev = { type: 'play', by: pid, card, color, drew: 0 };

        if (mine.length === 0) {
            G.winner = pid;
        } else if (card.value === 'Skip' || card.value === 'Reverse') {
            G.turn = pid;                              // com 2 jogadores, quem joga repete a vez
        } else if (card.value === '+2') {
            G.hands[opp].push(...gDraw(2));
            ev.drew = 2;
            G.turn = opp;
        } else if (card.value === 'Wild+4') {
            G.hands[opp].push(...gDraw(4));
            ev.drew = 4;
            G.turn = opp;
        } else {
            G.turn = opp;
        }
    } else {
        return;
    }

    broadcast(ev);
}

// ---------------------------------------------------------------- VISÃO / SINCRONIZAÇÃO

function statusText(ev, viewer) {
    const names = [myName, oppName];                   // índice 0 = anfitrião, 1 = convidado
    const who = pid => (pid === viewer ? 'Você' : names[pid]);
    const turnHint = G.turn === viewer ? 'Sua vez!' : 'Vez de ' + names[G.turn] + '.';

    if (G.winner !== null) {
        return G.winner === viewer ? '🎉 Você ganhou! Parabéns!' : '😂 ' + names[G.winner] + ' ganhou!';
    }
    switch (ev.type) {
        case 'start':
            return 'Partida começou! ' + turnHint;
        case 'draw':
            return who(ev.by) + ' comprou uma carta. ' + turnHint;
        case 'uno':
            return who(ev.by) + ' gritou UNO!';
        case 'play': {
            const v = ev.card.value;
            const victim = 1 - ev.by;
            if (v === 'Skip' || v === 'Reverse') {
                return who(ev.by) + ' jogou ' + (v === 'Skip' ? 'Pular' : 'Inverter') + ' e joga de novo!';
            }
            if (ev.card.color === 'black') {
                let t = who(ev.by) + ' jogou ' + (v === 'Wild+4' ? 'Wild+4' : 'coringa') + '! Cor: ' + COLOR_PT[ev.color] + '.';
                if (ev.drew) t += ' ' + who(victim) + ' comprou ' + ev.drew + '.';
                return t + ' ' + turnHint;
            }
            let t = who(ev.by) + ' jogou ' + v + '.';
            if (ev.drew) t += ' ' + who(victim) + ' comprou ' + ev.drew + '!';
            return t + ' ' + turnHint;
        }
    }
    return '';
}

function buildView(pid, ev) {
    return {
        hand: G.hands[pid],
        oppCount: G.hands[1 - pid].length,
        top: G.discard[G.discard.length - 1],
        color: G.color,
        value: G.value,
        turn: G.winner === null && G.turn === pid,
        winner: G.winner === null ? null : (G.winner === pid ? 'you' : 'opp'),
        status: statusText(ev, pid),
        start: ev.type === 'start',
        played: ev.type === 'play' || ev.type === 'start',
        lastBy: ev.by === undefined ? null : (ev.by === pid ? 'you' : 'opp')
    };
}

function broadcast(ev) {
    G.seq++;
    if (conn && conn.open) conn.send({ t: 'state', view: buildView(1, ev) });
    applyView(buildView(0, ev));
}

// Desenha na tela o que o servidor (anfitrião) mandou. Reaproveita as funções de render do script.js.
function applyView(v) {
    MODE = 'online';
    hideLobby();
    $('cpu-name').textContent = oppName;

    playerHand = v.hand;
    cpuHand = new Array(v.oppCount).fill(null);   // o render só usa a quantidade de cartas
    discard = [v.top];
    currentColor = v.color;
    currentValue = v.value;
    isPlayerTurn = v.turn;
    animLock = false;
    pendingWild = false;
    pendingWildIdx = null;
    $('overlay').style.display = 'none';

    renderCpu(v.start);
    renderPlayer(v.start);
    renderDiscard(v.played, v.lastBy === 'opp');
    renderMeta();
    setStatus(v.status);

    if (v.winner) {
        setTimeout(() => showEnd(v.winner === 'you' ? 'player' : 'cpu'), 700);
    } else {
        $('end-overlay').style.display = 'none';
    }
}

// ---------------------------------------------------------------- AÇÕES DO JOGADOR LOCAL

function sendAction(a) {
    if (a.t !== 'uno') {              // trava a mão até chegar a resposta
        isPlayerTurn = false;
        renderPlayer();
        renderMeta();
    }
    if (isHost) handleAction(0, a);
    else if (conn && conn.open) conn.send(a);
}

function onlinePlayCard(idx) {
    if (!isPlayerTurn) return;
    const card = playerHand[idx];
    if (!card || !canPlay(card)) return;
    if (card.color === 'black') {
        pendingWildIdx = idx;
        $('overlay').style.display = 'flex';
        return;
    }
    sendAction({ t: 'play', idx });
}

function onlinePickColor(col) {
    $('overlay').style.display = 'none';
    if (pendingWildIdx === null) return;
    const idx = pendingWildIdx;
    pendingWildIdx = null;
    sendAction({ t: 'play', idx, color: col });
}

function onlineDraw() {
    if (!isPlayerTurn) return;
    sendAction({ t: 'draw' });
}

function onlineUno() {
    sendAction({ t: 'uno' });
}

function onlineRestart() {
    if (!confirm('Reiniciar a partida?')) return;
    onlinePlayAgain();
}

function onlinePlayAgain() {
    if (isHost) startOnlineGame();
    else if (conn && conn.open) conn.send({ t: 'again' });
}
