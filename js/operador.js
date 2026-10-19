/* Telão do operador — Bingo dos Veloso, Natal 2026. */
let db = null;
let salaAtual = null;
let salaAtualData = null;
let numerosSorteados = [];
let premioBase64 = null;
let animacaoGiroInterval = null;
let ganhadores = [];
let ultimoNumero = null;
let ultimaLetra = null;
let salasCache = {};
let jogadoresCache = {};
let salasAssinatura = '';
let faseRenderizada = '';
let gradeAssinatura = '';
let vitoriaMostrada = false;
let sorteioTravado = false;
let agendadoPara = '';
let destravando = false;
let verificacaoAtual = null;
let loadingTimer = null;
const ouvintesJogo = [];

document.addEventListener('DOMContentLoaded', iniciarOperador);

function iniciarOperador() {
  try {
    db = iniciarFirebase();
  } catch (erro) {
    definirBanner(textoBannerFirebase(erro), true);
    atualizarStatusConexao(false);
    return;
  }
  vigiarFirebase(db, atualizarStatusConexao);
  carregarSalas();
  criarBolasGlobo();
  ligarEventos();
}

function ligarEventos() {
  document.getElementById('formSala').addEventListener('submit', (e) => {
    e.preventDefault();
    criarSala();
  });
  document.getElementById('premioUpload').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.getElementById('premioInput').click();
    }
  });
  document.getElementById('salasLista').addEventListener('click', aoClicarSala);
  document.getElementById('alertasTopoLista').addEventListener('click', aoClicarAlerta);
  document.getElementById('jogadoresLista').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-acao="salvar-cartelas"]');
    if (!btn) return;
    atualizarCartelas(btn.dataset.jogador, btn.dataset.sala);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal.active').forEach((m) => m.classList.remove('active'));
    }
  });
  window.addEventListener('unhandledrejection', () => hideLoading());
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('active');
  setTimeout(() => t.classList.remove('active'), 3200);
}

function showLoading() {
  document.getElementById('loading').classList.add('active');
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(hideLoading, 15000);
}

function hideLoading() {
  clearTimeout(loadingTimer);
  document.getElementById('loading').classList.remove('active');
}

function fecharModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function ouvir(ref, evento, cb, err) {
  ref.on(evento, cb, err);
  ouvintesJogo.push([ref, evento, cb]);
}

function silenciarJogo() {
  ouvintesJogo.forEach(([ref, evento, cb]) => ref.off(evento, cb));
  ouvintesJogo.length = 0;
}

async function handlePremio(e) {
  const arquivo = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!arquivo) return;
  try {
    premioBase64 = await arquivoParaJpeg(arquivo, 300, 0.8);
    document.getElementById('premioPreview').innerHTML = '<img class="premio-preview" alt="Foto do prêmio" src="' + esc(premioBase64) + '"><p style="color:var(--yellow)">✅ Adicionada!</p>';
  } catch (erro) {
    premioBase64 = null;
    showToast(mensagemFoto(erro));
  }
}

async function criarSala() {
  const nome = document.getElementById('nomeSala').value.trim();
  const cartelas = parseInt(document.getElementById('qtdCartelas').value, 10);
  if (!nome) { showToast('Digite o nome da sala!'); return; }
  if (!db) { showToast(mensagemErroFirebase(new Error('SDK'))); return; }
  showLoading();
  const id = novoId();
  try {
    await comTempo(db.ref('salas/' + id).set({
      nome: nome,
      cartelasPorJogador: cartelas,
      premio: premioBase64,
      ativa: true,
      jogando: false,
      girando: false,
      numeroAtual: null,
      letraAtual: null,
      numeroPendente: null,
      sorteioInicio: null,
      faseAnimacao: 'idle',
      numerosSorteados: [],
      ganhadores: [],
      superVencedor: null,
      criadaEm: Date.now()
    }));
    document.getElementById('nomeSala').value = '';
    document.getElementById('premioPreview').innerHTML = '<div class="premio-icon">🎁</div><p>Clique para adicionar</p>';
    premioBase64 = null;
    showToast('Sala criada!');
  } catch (erro) {
    definirBanner(textoBannerFirebase(erro), true);
    showToast(mensagemErroFirebase(erro));
  } finally {
    hideLoading();
  }
}

function carregarSalas() {
  db.ref('salas').on('value', (snap) => {
    salasCache = snap.val() || {};
    renderizarSalas();
  }, (erro) => {
    definirBanner(textoBannerFirebase(erro), true);
    atualizarStatusConexao(false);
  });
  db.ref('jogadores').on('value', (snap) => {
    jogadoresCache = snap.val() || {};
    atualizarContagens();
  });
}

function renderizarSalas() {
  const lista = document.getElementById('salasLista');
  const ativas = Object.entries(salasCache).filter(([, sala]) => sala && sala.ativa);
  ativas.sort((a, b) => (b[1].criadaEm || 0) - (a[1].criadaEm || 0));
  const assinatura = ativas.map(([id, sala]) => [id, sala.nome, sala.jogando ? 1 : 0, sala.cartelasPorJogador, sala.premio ? 1 : 0].join(':')).join('|');
  if (assinatura !== salasAssinatura) {
    salasAssinatura = assinatura;
    if (!ativas.length) {
      lista.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎱</div><p>Nenhuma sala ativa</p></div>';
    } else {
      lista.innerHTML = ativas.map(([id, sala]) => {
        const premio = sala.premio ? '<img class="sala-premio" alt="Foto do prêmio" src="' + esc(srcSeguro(sala.premio)) + '">' : '';
        const acao = sala.jogando
          ? '<button type="button" class="btn-sala btn-iniciar" data-acao="continuar">▶️ CONTINUAR</button>'
          : '<button type="button" class="btn-sala btn-iniciar" data-acao="iniciar">🎮 INICIAR</button>';
        return '<article class="sala-card" data-sala="' + esc(id) + '"><div class="sala-header"><h3 class="sala-nome">🎰 ' + esc(sala.nome) + '</h3>' + premio + '</div><div class="sala-info"><div class="sala-info-item"><span aria-hidden="true">📋</span><span>' + esc(sala.cartelasPorJogador) + ' cartela(s)</span></div><div class="sala-info-item"><span aria-hidden="true">👥</span><span class="contagem-jogadores">0</span></div></div><div class="qr-container" data-qr="' + esc(id) + '"></div><p class="url-sala"></p><div class="sala-link"><button type="button" class="btn-sala btn-copiar" data-acao="copiar">🔗 COPIAR LINK</button></div><div class="sala-buttons">' + acao + '<button type="button" class="btn-sala btn-jogadores" data-acao="jogadores">👥 JOGADORES</button><button type="button" class="btn-sala btn-encerrar" data-acao="encerrar">🗑️ ENCERRAR</button></div></article>';
      }).join('');
      ativas.forEach(([id]) => {
        const alvo = lista.querySelector('[data-qr="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
        const url = urlJogador(id);
        if (alvo && window.QRCode) {
          try {
            alvo.innerHTML = '';
            new QRCode(alvo, { text: url, width: 180, height: 180, colorDark: '#1a1a2e', colorLight: '#ffffff' });
          } catch (e) {
            alvo.textContent = 'Não foi possível gerar o QR Code. Use o botão de copiar o link.';
          }
        }
        const card = alvo && alvo.closest('[data-sala]');
        if (card) {
          card.dataset.url = url;
          const texto = card.querySelector('.url-sala');
          if (texto) texto.textContent = url;
        }
      });
    }
  }
  atualizarContagens();
}

function atualizarContagens() {
  document.querySelectorAll('[data-sala]').forEach((card) => {
    const id = card.dataset.sala;
    const total = Object.values(jogadoresCache).filter((j) => j && j.salaId === id).length;
    const el = card.querySelector('.contagem-jogadores');
    if (el) el.textContent = String(total);
  });
}

function aoClicarSala(e) {
  const btn = e.target.closest('[data-acao]');
  if (!btn) return;
  const card = btn.closest('[data-sala]');
  if (!card) return;
  const id = card.dataset.sala;
  const acao = btn.dataset.acao;
  if (acao === 'iniciar') mostrarRegras(id);
  else if (acao === 'continuar') entrarJogo(id);
  else if (acao === 'jogadores') verJogadores(id);
  else if (acao === 'encerrar') encerrarSala(id);
  else if (acao === 'copiar') copiarLink(card.dataset.url);
}

async function copiarLink(url) {
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link da sala copiado!');
  } catch (e) {
    showToast(url);
  }
}

async function verJogadores(salaId) {
  const sala = salasCache[salaId] || (await db.ref('salas/' + salaId).once('value')).val() || {};
  const arr = Object.entries(jogadoresCache).filter(([, j]) => j && j.salaId === salaId);
  const lista = document.getElementById('jogadoresLista');
  lista.innerHTML = '';
  if (!arr.length) {
    lista.innerHTML = '<div class="empty-state"><p>Nenhum jogador nesta sala</p></div>';
  } else {
    arr.forEach(([id, j]) => {
      const qtd = (j.cartelas && j.cartelas.length) || sala.cartelasPorJogador || 1;
      const item = document.createElement('div');
      item.className = 'jogador-item';
      item.innerHTML = '<div class="jogador-info"><img class="jogador-foto" alt="" src="' + esc(srcSeguro(j.foto)) + '"><div><div class="jogador-nome"></div><div class="jogador-cartelas-info"></div></div></div><div class="jogador-cartelas-edit"><label class="sr-only" for="cart-' + esc(id) + '">Cartelas</label><input type="number" class="cartelas-input" id="cart-' + esc(id) + '" min="1" max="10" inputmode="numeric"><button type="button" class="btn-salvar-cartelas" data-acao="salvar-cartelas">💾 Salvar</button></div>';
      item.querySelector('.jogador-nome').textContent = (j.nome || '') + ' ' + (j.sobrenome || '');
      item.querySelector('.jogador-cartelas-info').textContent = qtd + ' cartela(s)';
      item.querySelector('input').value = qtd;
      const botao = item.querySelector('button');
      botao.dataset.jogador = id;
      botao.dataset.sala = salaId;
      lista.appendChild(item);
    });
  }
  const totalCartelas = arr.reduce((soma, [, j]) => soma + ((j.cartelas && j.cartelas.length) || sala.cartelasPorJogador || 0), 0);
  document.getElementById('totalJogadores').textContent = arr.length + ' jogadores, ' + totalCartelas + ' cartelas';
  document.getElementById('modalJogadores').classList.add('active');
}

async function atualizarCartelas(jogadorId, salaId) {
  const campo = document.getElementById('cart-' + jogadorId);
  const qtd = campo ? parseInt(campo.value, 10) : NaN;
  if (!qtd || qtd < 1 || qtd > 10) { showToast('Use de 1 a 10 cartelas.'); return; }
  showLoading();
  try {
    const snap = await comTempo(db.ref('jogadores/' + jogadorId).once('value'));
    const jogador = snap.val();
    if (!jogador) { showToast('Jogador não encontrado.'); return; }
    let cartelas = comoLista(jogador.cartelas);
    if (qtd > cartelas.length) {
      for (let i = cartelas.length; i < qtd; i++) cartelas.push(gerarCartela(i));
    } else {
      cartelas = cartelas.slice(0, qtd);
    }
    await comTempo(db.ref('jogadores/' + jogadorId + '/cartelas').set(cartelas));
    showToast('Cartelas atualizadas!');
    verJogadores(salaId);
  } catch (erro) {
    showToast(mensagemErroFirebase(erro));
  } finally {
    hideLoading();
  }
}

let salaParaIniciar = null;
function mostrarRegras(id) {
  salaParaIniciar = id;
  document.getElementById('regrasModal').classList.add('active');
  document.querySelector('#regrasModal .modal-close').focus();
}

async function confirmarInicioJogo() {
  document.getElementById('regrasModal').classList.remove('active');
  if (salaParaIniciar) await iniciarJogo(salaParaIniciar);
}

async function iniciarJogo(salaId) {
  showLoading();
  try {
    await comTempo(db.ref('salas/' + salaId).update({
      jogando: true,
      girando: false,
      numeroAtual: null,
      letraAtual: null,
      numeroPendente: null,
      sorteioInicio: null,
      faseAnimacao: 'idle',
      numerosSorteados: [],
      ganhadores: [],
      superVencedor: null,
      alertasBingo: null,
      reacoes: null
    }));
    agendadoPara = '';
    entrarJogo(salaId);
  } catch (erro) {
    showToast(mensagemErroFirebase(erro));
  } finally {
    hideLoading();
  }
}

function entrarJogo(salaId) {
  silenciarJogo();
  salaAtual = salaId;
  faseRenderizada = '';
  gradeAssinatura = '';
  vitoriaMostrada = false;
  document.getElementById('telaInicial').style.display = 'none';
  document.getElementById('telaJogo').classList.add('active');
  ouvir(db.ref('salas/' + salaId), 'value', aoAtualizarSala);
  const refReacoes = db.ref('salas/' + salaId + '/reacoes');
  const inicioReacoes = Date.now();
  ouvir(refReacoes, 'child_added', (snap) => {
    const reacao = snap.val();
    if (!reacao || (reacao.timestamp || 0) < inicioReacoes) return;
    mostrarReacao(reacao);
    setTimeout(() => refReacoes.child(snap.key).remove(), 4000);
  });
  ouvir(db.ref('salas/' + salaId + '/alertasBingo'), 'value', (snap) => {
    renderizarAlertasTopo(Object.entries(snap.val() || {}));
  });
}

function aoAtualizarSala(snap) {
  const sala = snap.val();
  if (!sala) return;
  salaAtualData = sala;
  document.getElementById('jogoTitulo').textContent = '🎰 ' + (sala.nome || 'Bingo') + ' 🎰';
  numerosSorteados = comoLista(sala.numerosSorteados);
  ganhadores = comoLista(sala.ganhadores);
  if (sala.premio) {
    document.getElementById('premioDestaque').style.display = 'flex';
    document.getElementById('premioImgJogo').src = srcSeguro(sala.premio);
    document.getElementById('premioImgJogo').alt = 'Foto do prêmio';
  } else {
    document.getElementById('premioDestaque').style.display = 'none';
  }
  renderizarGrade();
  renderizarGanhadores();
  document.getElementById('contadorSorteados').textContent = String(numerosSorteados.length);
  atualizarEstadoSorteio(sala);
  atualizarBotaoUltimo();
  cuidarSorteio(sala);
  if (sala.superVencedor) {
    if (!vitoriaMostrada) {
      vitoriaMostrada = true;
      mostrarSuperVencedor(sala.superVencedor, sala.premio);
    }
  } else {
    vitoriaMostrada = false;
  }
}

function cuidarSorteio(sala) {
  if (!salaAtual) return;
  if (sala.numeroPendente && sala.sorteioInicio && (sala.faseAnimacao === 'letra' || sala.faseAnimacao === 'numero')) {
    agendarFases(salaAtual, sala.sorteioInicio, sala.numeroPendente, sala.letraAtual || getLetra(sala.numeroPendente));
    return;
  }
  if ((sala.faseAnimacao === 'letra' || sala.faseAnimacao === 'numero') && !sala.numeroPendente && !destravando) {
    destravando = true;
    destravarLegado().finally(() => { destravando = false; });
  }
}

function agendarFases(salaId, inicio, num, letra) {
  const chave = salaId + ':' + inicio;
  if (agendadoPara === chave) return;
  agendadoPara = chave;
  const ref = db.ref('salas/' + salaId);
  const irNumero = async () => {
    const sala = (await ref.once('value')).val();
    if (!sala || sala.sorteioInicio !== inicio || sala.faseAnimacao !== 'letra') return;
    const lista = comoLista(sala.numerosSorteados);
    if (!lista.includes(num)) lista.push(num);
    await ref.update({
      numerosSorteados: lista,
      faseAnimacao: 'numero',
      numeroAtual: num,
      letraAtual: letra,
      girando: false
    });
  };
  const irIdle = async () => {
    const sala = (await ref.once('value')).val();
    if (!sala || sala.sorteioInicio !== inicio) return;
    if (sala.faseAnimacao !== 'numero' && sala.faseAnimacao !== 'letra') return;
    const lista = comoLista(sala.numerosSorteados);
    if (sala.numeroPendente && !lista.includes(sala.numeroPendente)) lista.push(sala.numeroPendente);
    await ref.update({
      numerosSorteados: lista,
      faseAnimacao: 'idle',
      numeroAtual: null,
      letraAtual: null,
      numeroPendente: null,
      girando: false
    });
  };
  const falha = (erro) => showToast(mensagemErroFirebase(erro));
  const decorrido = Date.now() - inicio;
  const restaLetra = TEMPO_MOSTRAR_LETRA - decorrido;
  const restaTotal = TEMPO_MOSTRAR_LETRA + TEMPO_MOSTRAR_NUMERO - decorrido;
  if (restaTotal <= 0) {
    irNumero().then(irIdle).catch(falha);
  } else if (restaLetra <= 0) {
    irNumero().then(() => setTimeout(() => irIdle().catch(falha), restaTotal)).catch(falha);
  } else {
    setTimeout(() => {
      irNumero().then(() => setTimeout(() => irIdle().catch(falha), TEMPO_MOSTRAR_NUMERO)).catch(falha);
    }, restaLetra);
  }
}

async function destravarLegado() {
  if (!salaAtual) return;
  const ref = db.ref('salas/' + salaAtual);
  const sala = (await ref.once('value')).val();
  if (!sala) return;
  if (sala.faseAnimacao !== 'letra' && sala.faseAnimacao !== 'numero') return;
  if (sala.numeroPendente && sala.sorteioInicio) return;
  const lista = comoLista(sala.numerosSorteados);
  if (sala.numeroAtual && !lista.includes(sala.numeroAtual)) lista.push(sala.numeroAtual);
  await ref.update({
    numerosSorteados: lista,
    faseAnimacao: 'idle',
    girando: false,
    numeroAtual: null,
    letraAtual: null,
    numeroPendente: null
  });
}

function renderizarGanhadores() {
  const secao = document.getElementById('ganhadoresSection');
  const lista = document.getElementById('ganhadoresLista');
  if (!ganhadores.length) { secao.style.display = 'none'; lista.innerHTML = ''; return; }
  secao.style.display = 'block';
  lista.innerHTML = ganhadores.map((g) => '<div class="ganhador-badge"><img class="ganhador-foto" alt="" src="' + esc(srcSeguro(g.foto)) + '"><div class="ganhador-info"><div class="ganhador-nome">' + esc(g.nome) + '</div><div class="ganhador-tipo">' + esc(g.tipo) + '</div></div></div>').join('');
}

function atualizarEstadoSorteio(sala) {
  const btn = document.getElementById('btnSortear');
  const cage = document.getElementById('globoCage');
  const fase = sala.girando ? 'girando' : (sala.faseAnimacao || 'idle');
  const chave = fase + '|' + (sala.letraAtual || '') + '|' + (sala.numeroAtual || '');
  if (chave === faseRenderizada) return;
  faseRenderizada = chave;
  if (sala.girando) {
    btn.textContent = '✋ PARAR!';
    btn.classList.add('girando');
    btn.disabled = false;
    cage.classList.add('girando');
    animarBolasGlobo();
    esconderAnimacao();
  } else if (sala.faseAnimacao === 'letra' && sala.letraAtual) {
    btn.disabled = true;
    btn.textContent = '⏳ AGUARDE...';
    btn.classList.remove('girando');
    cage.classList.remove('girando');
    pararAnimacaoBolas();
    mostrarLetra(sala.letraAtual);
  } else if (sala.faseAnimacao === 'numero' && sala.numeroAtual) {
    btn.disabled = true;
    btn.textContent = '⏳ AGUARDE...';
    btn.classList.remove('girando');
    mostrarNumero(sala.numeroAtual, sala.letraAtual || getLetra(sala.numeroAtual));
  } else {
    btn.textContent = '🎲 GIRAR GLOBO';
    btn.classList.remove('girando');
    btn.disabled = false;
    cage.classList.remove('girando');
    pararAnimacaoBolas();
    esconderAnimacao();
  }
}

function atualizarBotaoUltimo() {
  const btn = document.getElementById('btnUltimo');
  btn.disabled = !numerosSorteados.length;
  if (numerosSorteados.length) {
    ultimoNumero = numerosSorteados[numerosSorteados.length - 1];
    ultimaLetra = getLetra(ultimoNumero);
  }
}

function mostrarLetra(letra) {
  const overlay = document.getElementById('animacaoOverlay');
  const faseLetra = document.getElementById('faseLetra');
  const faseNumero = document.getElementById('faseNumero');
  const letraEl = document.getElementById('letraGigante');
  document.getElementById('particulas').innerHTML = '';
  faseNumero.classList.remove('active');
  letraEl.textContent = letra;
  letraEl.className = 'letra-gigante ' + letra.toLowerCase();
  document.getElementById('interrogacoes').innerHTML = '<span class="interrogacao">?</span><span class="interrogacao">?</span><span class="interrogacao">?</span>';
  overlay.classList.add('active');
  faseLetra.classList.add('active');
  tocarSomSuspense();
}

function mostrarNumero(numero, letra) {
  const overlay = document.getElementById('animacaoOverlay');
  const bola = document.getElementById('bolaNumeroGrande');
  document.getElementById('faseLetra').classList.remove('active');
  bola.className = 'bola-numero-grande ' + String(letra).toLowerCase();
  document.getElementById('bolaLetra').textContent = letra;
  document.getElementById('bolaNumero').textContent = numero;
  overlay.classList.add('active');
  document.getElementById('faseNumero').classList.add('active');
  criarExplosaoParticulas(letra);
  criarOndasExpansao(letra);
  tocarSomNumero();
}

function esconderAnimacao() {
  document.getElementById('animacaoOverlay').classList.remove('active');
  document.getElementById('faseLetra').classList.remove('active');
  document.getElementById('faseNumero').classList.remove('active');
}

function criarExplosaoParticulas(letra) {
  const container = document.getElementById('particulas');
  container.innerHTML = '';
  const cores = { B: '#ef4444', I: '#f59e0b', N: '#22c55e', G: '#3b82f6', O: '#a855f7' };
  const cor = cores[letra] || '#ffd700';
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particula';
    const size = 8 + Math.random() * 15;
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.background = cor;
    p.style.boxShadow = '0 0 ' + (size / 2) + 'px ' + cor;
    const angle = (Math.PI * 2 / 30) * i;
    const dist = 150 + Math.random() * 250;
    p.style.setProperty('--tx', (Math.cos(angle) * dist) + 'px');
    p.style.setProperty('--ty', (Math.sin(angle) * dist) + 'px');
    p.style.animation = 'particleExplode ' + (0.8 + Math.random() * 0.5) + 's ease-out forwards';
    container.appendChild(p);
  }
  for (let i = 0; i < 10; i++) {
    const estrela = document.createElement('div');
    estrela.className = 'estrela';
    estrela.textContent = ['⭐', '✨', '🌟'][Math.floor(Math.random() * 3)];
    estrela.style.left = (30 + Math.random() * 40) + '%';
    estrela.style.top = (30 + Math.random() * 40) + '%';
    estrela.style.animationDuration = (1 + Math.random()) + 's';
    estrela.style.animationDelay = (Math.random() * 0.3) + 's';
    container.appendChild(estrela);
  }
}

function criarOndasExpansao(letra) {
  const container = document.getElementById('particulas');
  const cores = { B: '#ef4444', I: '#f59e0b', N: '#22c55e', G: '#3b82f6', O: '#a855f7' };
  const cor = cores[letra] || '#ffd700';
  for (let i = 0; i < 3; i++) {
    const onda = document.createElement('div');
    onda.className = 'onda';
    onda.style.borderColor = cor;
    onda.style.animationDelay = (i * 0.3) + 's';
    container.appendChild(onda);
  }
}

function tocarSomSuspense() {
  try {
    const ctx = criarAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(300, ctx.currentTime + 3);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 2.5);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 3.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 3.5);
  } catch (e) {}
}

function tocarSomNumero() {
  try {
    const ctx = criarAudio();
    if (!ctx) return;
    [523, 659, 784, 1047, 1319, 1568].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.value = freq;
      const quando = ctx.currentTime + i * 0.08;
      gain.gain.setValueAtTime(0.2, quando);
      gain.gain.exponentialRampToValueAtTime(0.01, quando + 0.2);
      osc.start(quando);
      osc.stop(quando + 0.2);
    });
  } catch (e) {}
}

function tocarSomVitoria() {
  try {
    const ctx = criarAudio();
    if (!ctx) return;
    [[523, 659, 784], [587, 740, 880], [659, 830, 988], [784, 988, 1175], [523, 659, 784, 1047]].forEach((acorde, i) => {
      acorde.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        const quando = ctx.currentTime + i * 0.2;
        gain.gain.setValueAtTime(0.15, quando);
        gain.gain.exponentialRampToValueAtTime(0.01, quando + 0.4);
        osc.start(quando);
        osc.stop(quando + 0.4);
      });
    });
  } catch (e) {}
}

function criarBolasGlobo() {
  const interior = document.getElementById('globoInterior');
  const cores = { B: 'bola-b', I: 'bola-i', N: 'bola-n', G: 'bola-g', O: 'bola-o' };
  interior.innerHTML = '';
  for (let i = 0; i < 18; i++) {
    const bola = document.createElement('div');
    bola.className = 'bola-bingo';
    const letra = ['B', 'I', 'N', 'G', 'O'][Math.floor(Math.random() * 5)];
    bola.classList.add(cores[letra]);
    bola.style.top = (10 + Math.random() * 70) + '%';
    bola.style.left = (10 + Math.random() * 70) + '%';
    const num = letra === 'B' ? Math.floor(Math.random() * 15) + 1 : letra === 'I' ? Math.floor(Math.random() * 15) + 16 : letra === 'N' ? Math.floor(Math.random() * 15) + 31 : letra === 'G' ? Math.floor(Math.random() * 15) + 46 : Math.floor(Math.random() * 15) + 61;
    bola.textContent = num;
    interior.appendChild(bola);
  }
}

function animarBolasGlobo() {
  if (animacaoGiroInterval) return;
  const bolas = document.querySelectorAll('.bola-bingo');
  animacaoGiroInterval = setInterval(() => {
    bolas.forEach((bola) => {
      bola.style.transition = 'all .08s ease-out';
      bola.style.top = (5 + Math.random() * 80) + '%';
      bola.style.left = (5 + Math.random() * 80) + '%';
    });
  }, 80);
}

function pararAnimacaoBolas() {
  if (animacaoGiroInterval) {
    clearInterval(animacaoGiroInterval);
    animacaoGiroInterval = null;
  }
}

async function iniciarSorteio() {
  if (sorteioTravado || !salaAtual || !salaAtualData) return;
  criarAudio();
  if (salaAtualData.girando) {
    sorteioTravado = true;
    try { await pararESortear(); } finally { sorteioTravado = false; }
  } else if (!salaAtualData.faseAnimacao || salaAtualData.faseAnimacao === 'idle') {
    sorteioTravado = true;
    try {
      await comTempo(db.ref('salas/' + salaAtual).update({ girando: true, faseAnimacao: 'girando' }));
    } catch (erro) {
      showToast(mensagemErroFirebase(erro));
    } finally {
      sorteioTravado = false;
    }
  }
}

async function pararESortear() {
  const salaId = salaAtual;
  const fresco = await comTempo(db.ref('salas/' + salaId + '/numerosSorteados').once('value'));
  const ja = comoLista(fresco.val());
  const disponiveis = [];
  for (let i = 1; i <= 75; i++) if (!ja.includes(i)) disponiveis.push(i);
  if (!disponiveis.length) {
    showToast('Todos os números já saíram!');
    await db.ref('salas/' + salaId).update({ girando: false, faseAnimacao: 'idle' });
    return;
  }
  const num = disponiveis[Math.floor(Math.random() * disponiveis.length)];
  const letra = getLetra(num);
  ultimoNumero = num;
  ultimaLetra = letra;
  const inicio = Date.now();
  await comTempo(db.ref('salas/' + salaId).update({
    girando: false,
    letraAtual: letra,
    numeroAtual: null,
    numeroPendente: num,
    faseAnimacao: 'letra',
    sorteioInicio: inicio
  }));
  agendarFases(salaId, inicio, num, letra);
}

function mostrarUltimoNumero() {
  if (!ultimoNumero || !ultimaLetra) { showToast('Nenhum número sorteado ainda.'); return; }
  faseRenderizada = 'replay';
  mostrarNumero(ultimoNumero, ultimaLetra);
  setTimeout(() => {
    if (salaAtualData && (salaAtualData.faseAnimacao === 'idle' || !salaAtualData.faseAnimacao) && !salaAtualData.girando) {
      esconderAnimacao();
      faseRenderizada = 'idle||';
    }
  }, 4000);
}

function renderizarAlertasTopo(alertas) {
  const secao = document.getElementById('alertasTopo');
  const lista = document.getElementById('alertasTopoLista');
  lista.innerHTML = '';
  if (!alertas.length) { secao.classList.remove('active'); return; }
  secao.classList.add('active');
  alertas.forEach(([id, alerta]) => {
    const item = document.createElement('div');
    item.className = 'alerta-topo-item';
    const foto = document.createElement('img');
    foto.className = 'alerta-topo-foto';
    foto.alt = '';
    foto.src = srcSeguro(alerta.foto);
    const info = document.createElement('div');
    info.className = 'alerta-topo-info';
    const nome = document.createElement('div');
    nome.className = 'alerta-topo-nome';
    nome.textContent = alerta.jogadorNome || 'Jogador';
    const cartela = document.createElement('div');
    cartela.className = 'alerta-topo-cartela';
    cartela.textContent = 'Cartela ' + ((alerta.cartelaIndex || 0) + 1);
    info.append(nome, cartela);
    const botoes = document.createElement('div');
    botoes.className = 'alerta-topo-buttons';
    const verificar = document.createElement('button');
    verificar.type = 'button';
    verificar.className = 'alerta-topo-btn verificar';
    verificar.dataset.acao = 'verificar';
    verificar.dataset.jogador = alerta.jogadorId || '';
    verificar.dataset.cartela = String(alerta.cartelaIndex || 0);
    verificar.dataset.alerta = id;
    verificar.textContent = '✅ Verificar';
    const ignorar = document.createElement('button');
    ignorar.type = 'button';
    ignorar.className = 'alerta-topo-btn ignorar';
    ignorar.dataset.acao = 'ignorar';
    ignorar.dataset.alerta = id;
    ignorar.dataset.jogador = alerta.jogadorId || '';
    ignorar.setAttribute('aria-label', 'Ignorar bingo');
    ignorar.textContent = '❌ Ignorar';
    botoes.append(verificar, ignorar);
    item.append(foto, info, botoes);
    lista.appendChild(item);
  });
}

function aoClicarAlerta(e) {
  const btn = e.target.closest('[data-acao]');
  if (!btn) return;
  if (btn.dataset.acao === 'verificar') verificarBingo(btn.dataset.jogador, Number(btn.dataset.cartela), btn.dataset.alerta);
  if (btn.dataset.acao === 'ignorar') ignorarBingo(btn.dataset.alerta, btn.dataset.jogador);
}

async function verificarBingo(jogadorId, cartelaIndex, alertaId) {
  showLoading();
  try {
    const snap = await comTempo(db.ref('jogadores/' + jogadorId).once('value'));
    const jogador = snap.val();
    const cartelas = jogador && comoLista(jogador.cartelas);
    if (!cartelas || !cartelas[cartelaIndex]) { showToast('Cartela não encontrada.'); return; }
    const cartela = cartelas[cartelaIndex];
    cartela.marcados = comoLista(cartela.marcados);
    cartela.numeros = comoLista(cartela.numeros).map((linha) => comoLista(linha));
    const analise = analisarCartela(cartela.numeros, cartela.marcados, numerosSorteados);
    verificacaoAtual = { jogador: jogador, jogadorId: jogadorId, cartela: cartela, analise: analise, alertaId: alertaId };
    renderizarVerificacao();
  } catch (erro) {
    showToast(mensagemErroFirebase(erro));
  } finally {
    hideLoading();
  }
}

function renderizarVerificacao() {
  const atual = verificacaoAtual;
  const jogador = atual.jogador;
  const cartela = atual.cartela;
  const analise = atual.analise;
  const marc = new Set(cartela.marcados);
  document.getElementById('verificacaoNome').textContent = (jogador.nome || '') + ' ' + (jogador.sobrenome || '') + ' — cartela ' + (cartela.id || '');
  const gradeEl = document.getElementById('verificacaoCartela');
  gradeEl.innerHTML = '<div class="verificacao-header">B</div><div class="verificacao-header">I</div><div class="verificacao-header">N</div><div class="verificacao-header">G</div><div class="verificacao-header">O</div>';
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const n = cartela.numeros[r][c];
      const celula = document.createElement('div');
      let cls = 'verificacao-cell';
      if (n === 0) cls += ' coringa';
      else if (marc.has(n)) cls += ' marcado-correto';
      else if (numerosSorteados.includes(n)) cls += ' nao-marcou';
      if (analise.linhas.includes(r) || analise.colunas.includes(c) || (analise.diagonais.includes('d1') && r === c) || (analise.diagonais.includes('d2') && r + c === 4)) cls += ' sequencia';
      celula.className = cls;
      celula.textContent = n === 0 ? '⭐' : String(n);
      gradeEl.appendChild(celula);
    }
  }
  const res = document.getElementById('resultadoVerificacao');
  if (analise.valido) {
    res.className = 'resultado-verificacao valido';
    res.innerHTML = '<h3 class="resultado-titulo" style="color:var(--green)">✅ BINGO VÁLIDO!</h3><p style="font-size:1.3rem">' + esc(analise.tipoVitoria) + '</p>' + (analise.cartelaCheia ? '<p style="color:var(--yellow);font-size:1.1rem;margin-top:10px">🏆 SUPER PRÊMIO — FIM DO JOGO!</p>' : '');
  } else {
    res.className = 'resultado-verificacao invalido';
    const perdidos = analise.perdidos.length
      ? '<p>Deixou de marcar ' + analise.perdidos.length + ' número(s) que já saíram:</p><div class="numeros-perdidos-lista">' + analise.perdidos.map((n) => '<span class="numero-perdido">' + getLetra(n) + ' ' + n + '</span>').join('') + '</div>'
      : '<p>Nenhuma sequência com números que já saíram no globo.</p>';
    res.innerHTML = '<h3 class="resultado-titulo" style="color:var(--red)">❌ BINGO INVÁLIDO!</h3>' + perdidos;
  }
  const botoes = document.getElementById('verificacaoButtons');
  botoes.innerHTML = '';
  if (analise.valido) {
    const confirmar = document.createElement('button');
    confirmar.type = 'button';
    confirmar.className = 'btn-vencedor';
    confirmar.textContent = analise.cartelaCheia ? '🏆 SUPER CAMPEÃO!' : '🎉 CONFIRMAR GANHADOR';
    confirmar.addEventListener('click', declararGanhador);
    const voltar = document.createElement('button');
    voltar.type = 'button';
    voltar.className = 'btn-continuar';
    voltar.textContent = '▶️ VOLTAR';
    voltar.addEventListener('click', () => fecharModal('modalVerificacao'));
    botoes.append(confirmar, voltar);
  } else {
    const continuar = document.createElement('button');
    continuar.type = 'button';
    continuar.className = 'btn-continuar';
    continuar.textContent = '▶️ CONTINUAR';
    continuar.addEventListener('click', () => {
      fecharModal('modalVerificacao');
      ignorarBingo(atual.alertaId, atual.jogadorId);
    });
    botoes.append(continuar);
  }
  document.getElementById('modalVerificacao').classList.add('active');
}

async function ignorarBingo(alertaId, jogadorId) {
  if (!salaAtual || !alertaId) return;
  try {
    await db.ref('salas/' + salaAtual + '/alertasBingo/' + alertaId).remove();
    if (jogadorId) {
      await db.ref('jogadores/' + jogadorId).update({ gritouBingo: false, cartelaVencedora: null, ultimoResultado: 'recusado' });
    }
  } catch (erro) {
    showToast(mensagemErroFirebase(erro));
  }
}

async function declararGanhador() {
  const atual = verificacaoAtual;
  if (!atual || !salaAtual) return;
  fecharModal('modalVerificacao');
  const jogador = atual.jogador;
  const nome = ((jogador.nome || '') + ' ' + (jogador.sobrenome || '')).trim();
  const novo = {
    nome: nome,
    foto: jogador.foto || '',
    tipo: atual.analise.tipoVitoria,
    timestamp: Date.now(),
    jogadorId: atual.jogadorId
  };
  try {
    const ganhadoresAtuais = comoLista((await db.ref('salas/' + salaAtual + '/ganhadores').once('value')).val());
    ganhadoresAtuais.push(novo);
    await db.ref('salas/' + salaAtual + '/ganhadores').set(ganhadoresAtuais);
    await db.ref('salas/' + salaAtual + '/alertasBingo/' + atual.alertaId).remove();
    await db.ref('jogadores/' + atual.jogadorId).update({ gritouBingo: false, ultimoResultado: 'ganhou' });
    if (atual.analise.cartelaCheia) {
      const vencedor = { nome: nome, foto: jogador.foto || '', timestamp: novo.timestamp };
      await db.ref('salas/' + salaAtual).update({ jogando: false, superVencedor: vencedor });
      vitoriaMostrada = true;
      mostrarSuperVencedor(vencedor, salaAtualData && salaAtualData.premio);
    } else {
      showToast(nome + ' ganhou! O jogo continua...');
    }
  } catch (erro) {
    showToast(mensagemErroFirebase(erro));
  }
}

function mostrarSuperVencedor(vencedor, premio) {
  document.getElementById('vencedorNome').textContent = vencedor.nome || '';
  document.getElementById('vencedorFoto').src = srcSeguro(vencedor.foto);
  document.getElementById('vencedorFoto').alt = 'Foto de ' + (vencedor.nome || 'campeão');
  if (premio) {
    document.getElementById('premioVencedor').style.display = 'flex';
    document.getElementById('premioVencedorImg').src = srcSeguro(premio);
    document.getElementById('premioVencedorImg').alt = 'Prêmio';
  } else {
    document.getElementById('premioVencedor').style.display = 'none';
  }
  document.getElementById('telaVitoria').classList.add('active');
  if (!document.querySelector('#telaVitoria .confetti')) criarConfetes();
  tocarSomVitoria();
}

function criarConfetes() {
  const cores = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ffd700', '#ec4899', '#4ecdc4'];
  const cont = document.getElementById('telaVitoria');
  for (let i = 0; i < 80; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + '%';
    c.style.background = cores[Math.floor(Math.random() * cores.length)];
    c.style.animationDelay = Math.random() * 2 + 's';
    c.style.animationDuration = (2 + Math.random() * 2) + 's';
    c.style.width = c.style.height = (8 + Math.random() * 10) + 'px';
    c.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    cont.appendChild(c);
  }
}

async function novoJogo() {
  if (!salaAtual) return;
  document.querySelectorAll('#telaVitoria .confetti').forEach((c) => c.remove());
  document.getElementById('telaVitoria').classList.remove('active');
  vitoriaMostrada = false;
  agendadoPara = '';
  showLoading();
  try {
    await comTempo(db.ref('salas/' + salaAtual).update({
      jogando: true,
      girando: false,
      numeroAtual: null,
      letraAtual: null,
      numeroPendente: null,
      sorteioInicio: null,
      faseAnimacao: 'idle',
      numerosSorteados: [],
      ganhadores: [],
      superVencedor: null,
      alertasBingo: null,
      reacoes: null
    }));
    const entradas = Object.entries(jogadoresCache).filter(([, j]) => j && j.salaId === salaAtual);
    for (const [id, jogador] of entradas) {
      if (jogador.cartelas) {
        const limpas = comoLista(jogador.cartelas).map((cartela) => Object.assign({}, cartela, { marcados: [0], totalMarcados: 1 }));
        await db.ref('jogadores/' + id + '/cartelas').set(limpas);
        await db.ref('jogadores/' + id).update({ gritouBingo: false, cartelaVencedora: null, ultimoResultado: null });
      }
    }
    ultimoNumero = null;
    ultimaLetra = null;
    showToast('Novo jogo! As marcações foram limpas.');
  } catch (erro) {
    showToast(mensagemErroFirebase(erro));
  } finally {
    hideLoading();
  }
}

function mostrarReacao(reacao) {
  const cont = document.getElementById('reacoesContainer');
  const div = document.createElement('div');
  div.className = 'reacao';
  const foto = document.createElement('img');
  foto.className = 'reacao-foto';
  foto.alt = '';
  foto.src = srcSeguro(reacao.foto);
  const nome = document.createElement('span');
  nome.className = 'reacao-nome';
  nome.textContent = reacao.nome || '';
  const icone = document.createElement('span');
  icone.className = 'reacao-icon';
  icone.textContent = '✅';
  div.append(foto, nome, icone);
  cont.appendChild(div);
  setTimeout(() => div.remove(), 3500);
}

function renderizarGrade() {
  const sig = numerosSorteados.join(',');
  const gradeEl = document.getElementById('gradeNumeros');
  if (sig === gradeAssinatura && gradeEl.children.length) return;
  gradeAssinatura = sig;
  let html = '<div class="letras-header"><div class="letra-col b">B</div><div class="letra-col i">I</div><div class="letra-col n">N</div><div class="letra-col g">G</div><div class="letra-col o">O</div></div><div class="numeros-colunas">';
  [[1, 15, 'b'], [16, 30, 'i'], [31, 45, 'n'], [46, 60, 'g'], [61, 75, 'o']].forEach(([min, max, letra]) => {
    html += '<div class="coluna-numeros">';
    for (let i = min; i <= max; i++) html += '<div class="numero-cell ' + (numerosSorteados.includes(i) ? 'sorteado ' + letra : '') + '">' + i + '</div>';
    html += '</div>';
  });
  gradeEl.innerHTML = html + '</div>';
}

function voltarInicio() {
  silenciarJogo();
  salaAtual = null;
  salaAtualData = null;
  document.getElementById('telaInicial').style.display = 'grid';
  document.getElementById('telaJogo').classList.remove('active');
  document.getElementById('alertasTopo').classList.remove('active');
  pararAnimacaoBolas();
  esconderAnimacao();
  salasAssinatura = '';
  renderizarSalas();
}

async function encerrarSala(salaId) {
  if (!confirm('Encerrar esta sala e apagar os jogadores dela?')) return;
  showLoading();
  try {
    const ids = Object.keys(jogadoresCache).filter((id) => jogadoresCache[id] && jogadoresCache[id].salaId === salaId);
    for (const id of ids) await db.ref('jogadores/' + id).remove();
    await comTempo(db.ref('salas/' + salaId).update({ ativa: false, jogando: false }));
    if (salaAtual === salaId) voltarInicio();
    showToast('Sala encerrada.');
  } catch (erro) {
    showToast(mensagemErroFirebase(erro));
  } finally {
    hideLoading();
  }
}

async function resetarTudo() {
  if (!confirm('Apagar todas as salas e jogadores?')) return;
  if (!confirm('Tem certeza? Essa ação não desfaz.')) return;
  showLoading();
  try {
    await comTempo(db.ref('salas').remove());
    await comTempo(db.ref('jogadores').remove());
    if (salaAtual) voltarInicio();
    showToast('Tudo apagado.');
  } catch (erro) {
    showToast(mensagemErroFirebase(erro));
  } finally {
    hideLoading();
  }
}
