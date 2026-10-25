/* Celular do jogador — Bingo dos Veloso, Natal 2026. */
let db = null;
let salaId = null;
let sala = null;
let jogadorId = null;
let jogador = null;
let cartelaAtual = 0;
let fotoBase64 = null;
let touchStartX = 0;
let touchStartY = 0;
let vibrando = false;
let escutando = false;
let cartelasRenderizadas = '';
let fimAnunciado = false;
let ganhosVistos = new Set();
let gritando = false;
let loadingTimer = null;

document.addEventListener('DOMContentLoaded', iniciarJogador);

function iniciarJogador() {
  const params = new URLSearchParams(location.search);
  salaId = params.get('sala');
  if (!salaId) {
    mostrarErro('Sala não encontrada', 'Abra o link ou o QR Code que o operador mostrar.');
    return;
  }
  try {
    db = iniciarFirebase();
  } catch (erro) {
    definirBanner(textoBannerFirebase(erro), false);
    atualizarStatusConexao(false);
    mostrarErro('Sem conexão', mensagemErroFirebase(erro));
    return;
  }
  vigiarFirebase(db, atualizarStatusConexao);
  document.getElementById('formCadastro').addEventListener('submit', (e) => {
    e.preventDefault();
    entrarNoBingo();
  });
  document.getElementById('cartelasContainer').addEventListener('click', (e) => {
    const celula = e.target.closest('[data-num]');
    if (!celula || celula.dataset.num === '0') return;
    marcarNumero(Number(celula.dataset.cartela), Number(celula.dataset.num));
  });
  document.getElementById('paginationDots').addEventListener('click', (e) => {
    const ponto = e.target.closest('[data-indice]');
    if (ponto) irParaCartela(Number(ponto.dataset.indice));
  });
  setupSwipe();
  window.addEventListener('unhandledrejection', () => hideLoading());
  const salvo = localStorage.getItem('bingo_jogador_' + salaId);
  if (salvo) {
    jogadorId = salvo;
    verificarJogadorExistente();
  } else {
    carregarSala();
  }
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

function mostrarTela(id) {
  ['telaCadastro', 'telaAguardo', 'telaJogo', 'telaErro'].forEach((tela) => {
    document.getElementById(tela).classList.toggle('active', tela === id);
  });
  document.body.classList.toggle('jogando', id === 'telaJogo');
}

function mostrarErro(titulo, texto) {
  document.getElementById('erroTitulo').textContent = titulo;
  document.getElementById('erroTexto').textContent = texto;
  mostrarTela('telaErro');
}

async function carregarSala() {
  showLoading();
  try {
    const snap = await comTempo(db.ref('salas/' + salaId).once('value'));
    sala = snap.val();
    if (!sala || !sala.ativa) {
      mostrarErro('Sala não encontrada', 'Esta sala não existe ou foi encerrada.');
      return;
    }
    document.getElementById('salaNome').textContent = sala.nome || 'Sala';
    document.getElementById('qtdCartelas').textContent = String(sala.cartelasPorJogador || 1);
    mostrarTela('telaCadastro');
  } catch (erro) {
    definirBanner(textoBannerFirebase(erro), true);
    mostrarErro('Sem conexão', mensagemErroFirebase(erro));
  } finally {
    hideLoading();
  }
}

async function verificarJogadorExistente() {
  showLoading();
  try {
    const jSnap = await comTempo(db.ref('jogadores/' + jogadorId).once('value'));
    jogador = jSnap.val();
    if (!jogador || jogador.salaId !== salaId) {
      localStorage.removeItem('bingo_jogador_' + salaId);
      jogadorId = null;
      jogador = null;
      await carregarSala();
      return;
    }
    normalizarJogador();
    const sSnap = await comTempo(db.ref('salas/' + salaId).once('value'));
    sala = sSnap.val();
    if (!sala || !sala.ativa) {
      mostrarErro('Sala encerrada', 'O operador encerrou esta sala.');
      return;
    }
    document.getElementById('salaNome').textContent = sala.nome || 'Sala';
    if (sala.jogando && !sala.superVencedor) iniciarJogo();
    else mostrarAguardo();
    escutarMudancas();
  } catch (erro) {
    localStorage.removeItem('bingo_jogador_' + salaId);
    showToast(mensagemErroFirebase(erro));
    carregarSala();
  } finally {
    hideLoading();
  }
}

function normalizarJogador() {
  if (!jogador) return;
  jogador.cartelas = comoLista(jogador.cartelas).map((cartela) => {
    cartela.numeros = comoLista(cartela.numeros).map((linha) => comoLista(linha));
    cartela.marcados = comoLista(cartela.marcados);
    if (!cartela.marcados.includes(0)) cartela.marcados.unshift(0);
    return cartela;
  });
}

async function handleFoto(e) {
  const arquivo = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!arquivo) return;
  try {
    fotoBase64 = await arquivoParaJpeg(arquivo, 200, 0.7);
    document.getElementById('fotoPreview').innerHTML = '<img alt="Sua foto" src="' + esc(fotoBase64) + '">';
  } catch (erro) {
    fotoBase64 = null;
    showToast(mensagemFoto(erro));
  }
}

async function entrarNoBingo() {
  const nome = document.getElementById('inputNome').value.trim();
  const sobrenome = document.getElementById('inputSobrenome').value.trim();
  if (!nome || !sobrenome) { showToast('Preencha nome e sobrenome!'); return; }
  if (!sala) { showToast('A sala ainda não carregou.'); return; }
  showLoading();
  try {
    const cartelas = [];
    const qtd = sala.cartelasPorJogador || 1;
    for (let i = 0; i < qtd; i++) cartelas.push(gerarCartela(i));
    jogadorId = novoId();
    jogador = {
      salaId: salaId,
      nome: nome,
      sobrenome: sobrenome,
      foto: fotoBase64 || null,
      cartelas: cartelas,
      gritouBingo: false,
      cartelaVencedora: null,
      ultimoResultado: null,
      entradaEm: Date.now()
    };
    await comTempo(db.ref('jogadores/' + jogadorId).set(jogador));
    localStorage.setItem('bingo_jogador_' + salaId, jogadorId);
    if (sala.jogando && !sala.superVencedor) iniciarJogo();
    else mostrarAguardo();
    escutarMudancas();
    showToast('Bem-vindo, ' + nome + '!');
  } catch (erro) {
    definirBanner(textoBannerFirebase(erro), true);
    showToast(mensagemErroFirebase(erro));
  } finally {
    hideLoading();
  }
}

let contagemLigada = false;
function mostrarAguardo() {
  mostrarTela('telaAguardo');
  document.getElementById('aguardoCartelas').textContent = String(jogador.cartelas.length);
  if (contagemLigada) return;
  contagemLigada = true;
  db.ref('jogadores').on('value', (snap) => {
    const todos = snap.val() || {};
    const total = Object.values(todos).filter((j) => j && j.salaId === salaId).length;
    const el = document.getElementById('aguardoJogadores');
    if (el) el.textContent = String(total);
  });
}

function iniciarJogo() {
  mostrarTela('telaJogo');
  document.getElementById('nomeJogador').textContent = jogador.nome + ' ' + jogador.sobrenome;
  document.getElementById('cartelaTotalNum').textContent = String(jogador.cartelas.length);
  document.getElementById('swipeHint').style.display = jogador.cartelas.length <= 1 ? 'none' : '';
  cartelasRenderizadas = '';
  renderizarCartelas();
  atualizarNavegacao();
  atualizarBotaoBingo();
}

function renderizarCartelas() {
  const assinatura = JSON.stringify(jogador.cartelas) + '|' + cartelaAtual;
  const cont = document.getElementById('cartelasContainer');
  if (assinatura === cartelasRenderizadas && cont.children.length) {
    atualizarNavegacao();
    return;
  }
  cartelasRenderizadas = assinatura;
  cont.innerHTML = '';
  jogador.cartelas.forEach((cartela, idx) => {
    const bloco = document.createElement('div');
    bloco.className = 'cartela';
    bloco.id = 'cartela-' + idx;
    const card = document.createElement('div');
    card.className = 'cartela-card';
    const cabecalho = document.createElement('div');
    cabecalho.className = 'bingo-header';
    ['B', 'I', 'N', 'G', 'O'].forEach((letra) => {
      const el = document.createElement('div');
      el.className = 'bingo-letra';
      el.textContent = letra;
      cabecalho.appendChild(el);
    });
    const grid = document.createElement('div');
    grid.className = 'cartela-grid';
    const marcados = new Set(comoLista(cartela.marcados));
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const n = cartela.numeros[r][c];
        const celula = document.createElement('button');
        celula.type = 'button';
        celula.className = 'numero';
        celula.id = 'num-' + idx + '-' + n;
        if (n === 0) {
          celula.classList.add('coringa');
          celula.textContent = 'V';
          celula.disabled = true;
          celula.setAttribute('aria-label', 'Coringa');
        } else {
          celula.dataset.cartela = String(idx);
          celula.dataset.num = String(n);
          celula.textContent = String(n);
          celula.setAttribute('aria-label', getLetra(n) + ' ' + n);
          celula.setAttribute('aria-pressed', marcados.has(n) ? 'true' : 'false');
          if (marcados.has(n)) celula.classList.add('marcado');
        }
        grid.appendChild(celula);
      }
    }
    const total = comoLista(cartela.marcados).filter((n) => n !== 0).length;
    const contador = document.createElement('div');
    contador.className = 'marcados-counter';
    contador.id = 'counter-' + idx;
    for (let i = 0; i < 24; i++) {
      const ponto = document.createElement('div');
      ponto.className = 'marcado-dot' + (i < total ? ' ativo' : '');
      contador.appendChild(ponto);
    }
    const texto = document.createElement('div');
    texto.className = 'marcados-text';
    texto.textContent = total + '/24 marcados';
    contador.appendChild(texto);
    card.append(cabecalho, grid, contador);
    bloco.appendChild(card);
    cont.appendChild(bloco);
  });
  const pontos = document.getElementById('paginationDots');
  pontos.innerHTML = '';
  if (jogador.cartelas.length > 1) {
    jogador.cartelas.forEach((_, idx) => {
      const ponto = document.createElement('button');
      ponto.type = 'button';
      ponto.className = 'pagination-dot' + (idx === cartelaAtual ? ' active' : '');
      ponto.dataset.indice = String(idx);
      ponto.setAttribute('aria-label', 'Cartela ' + (idx + 1));
      pontos.appendChild(ponto);
    });
  }
  atualizarNavegacao();
}

async function marcarNumero(cartIdx, num) {
  const cartela = jogador.cartelas[cartIdx];
  if (!cartela || num === 0) return;
  const marcados = comoLista(cartela.marcados);
  const pos = marcados.indexOf(num);
  if (pos >= 0) marcados.splice(pos, 1);
  else marcados.push(num);
  cartela.marcados = marcados;
  const el = document.getElementById('num-' + cartIdx + '-' + num);
  if (el) {
    el.classList.toggle('marcado', marcados.includes(num));
    el.setAttribute('aria-pressed', marcados.includes(num) ? 'true' : 'false');
  }
  atualizarContador(cartIdx);
  atualizarBotaoBingo();
  cartelasRenderizadas = JSON.stringify(jogador.cartelas) + '|' + cartelaAtual;
  playSound('ploc');
  if (navigator.vibrate) navigator.vibrate(30);
  try {
    await comTempo(db.ref('jogadores/' + jogadorId + '/cartelas/' + cartIdx + '/marcados').set(marcados));
    if (marcados.includes(num)) {
      db.ref('salas/' + salaId + '/reacoes').push({
        nome: jogador.nome,
        foto: jogador.foto || null,
        numero: num,
        timestamp: Date.now()
      });
    }
  } catch (erro) {
    showToast('Não consegui salvar a marcação. Tente de novo.');
  }
}

function atualizarContador(cartIdx) {
  const cartela = jogador.cartelas[cartIdx];
  const total = comoLista(cartela.marcados).filter((n) => n !== 0).length;
  const counter = document.getElementById('counter-' + cartIdx);
  if (!counter) return;
  counter.querySelectorAll('.marcado-dot').forEach((ponto, i) => ponto.classList.toggle('ativo', i < total));
  const texto = counter.querySelector('.marcados-text');
  if (texto) texto.textContent = total + '/24 marcados';
}

function atualizarBotaoBingo() {
  const btn = document.getElementById('btnBingo');
  const pode = jogador.cartelas.some((cartela) => temSequenciaMarcada(cartela.numeros, cartela.marcados));
  btn.classList.toggle('ativo', pode);
  btn.setAttribute('aria-disabled', pode ? 'false' : 'true');
}

async function gritarBingo() {
  const btn = document.getElementById('btnBingo');
  if (!btn.classList.contains('ativo')) { showToast('Complete uma sequência na cartela!'); return; }
  if (gritando) return;
  let cartelaVencedora = -1;
  for (let i = 0; i < jogador.cartelas.length; i++) {
    if (temSequenciaMarcada(jogador.cartelas[i].numeros, jogador.cartelas[i].marcados)) { cartelaVencedora = i; break; }
  }
  if (cartelaVencedora < 0) { showToast('Nenhuma sequência ainda.'); return; }
  gritando = true;
  playSound('bingo');
  if (navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 120]);
  try {
    await comTempo(db.ref('salas/' + salaId + '/alertasBingo').push({
      jogadorId: jogadorId,
      jogadorNome: jogador.nome + ' ' + jogador.sobrenome,
      foto: jogador.foto || null,
      cartelaIndex: cartelaVencedora,
      timestamp: Date.now()
    }));
    await db.ref('jogadores/' + jogadorId).update({ gritouBingo: true, cartelaVencedora: cartelaVencedora, ultimoResultado: null });
    jogador.gritouBingo = true;
    document.getElementById('telaVerificacao').classList.add('active');
  } catch (erro) {
    showToast(mensagemErroFirebase(erro));
  } finally {
    gritando = false;
  }
}

function escutarMudancas() {
  if (escutando) return;
  escutando = true;
  const inicioReacoes = Date.now();
  db.ref('salas/' + salaId).on('value', (snap) => {
    const s = snap.val();
    if (!s) {
      mostrarErro('Sala não encontrada', 'Esta sala não existe ou foi encerrada.');
      return;
    }
    sala = s;
    if (!s.ativa) {
      mostrarErro('Sala encerrada', 'O operador encerrou esta sala.');
      return;
    }
    tratarGanhadores(s.ganhadores);
    if (s.superVencedor) {
      document.getElementById('telaVerificacao').classList.remove('active');
      document.getElementById('telaResultado').classList.remove('active');
      if (!fimAnunciado) {
        fimAnunciado = true;
        document.getElementById('fimJogoOverlay').classList.add('active');
        document.getElementById('fimJogoVencedor').textContent = (s.superVencedor.nome || 'Alguém') + ' venceu com CARTELA CHEIA!';
        criarConfetes();
        playSound('vitoria');
      }
    } else if (fimAnunciado || document.getElementById('fimJogoOverlay').classList.contains('active')) {
      fimAnunciado = false;
      document.getElementById('fimJogoOverlay').classList.remove('active');
      document.querySelectorAll('.confetti').forEach((c) => c.remove());
    }
    const jogoAtivo = document.getElementById('telaJogo').classList.contains('active');
    if (s.jogando && !s.superVencedor && !jogoAtivo && jogador) iniciarJogo();
    atualizarAvisoGlobo(s);
  });
  db.ref('jogadores/' + jogadorId).on('value', (snap) => {
    const dados = snap.val();
    if (!dados) return;
    const antigoBingo = jogador && jogador.gritouBingo;
    jogador = dados;
    normalizarJogador();
    if (document.getElementById('telaJogo').classList.contains('active')) {
      renderizarCartelas();
      atualizarBotaoBingo();
    }
    if (antigoBingo && !jogador.gritouBingo) {
      document.getElementById('telaVerificacao').classList.remove('active');
      if (jogador.ultimoResultado === 'recusado') showToast('Bingo não confirmado. Continue jogando!');
    }
  });
  db.ref('salas/' + salaId + '/reacoes').on('child_added', (snap) => {
    const reacao = snap.val();
    if (!reacao || (reacao.timestamp || 0) < inicioReacoes) return;
    if (reacao.nome !== jogador.nome) mostrarBalaoReacao(reacao);
  });
}

function tratarGanhadores(lista) {
  const arr = comoLista(lista);
  const entrada = (jogador && jogador.entradaEm) || 0;
  arr.forEach((g) => {
    if (!g) return;
    const chave = (g.jogadorId || g.nome || '') + '|' + (g.timestamp || g.tipo || '');
    if (ganhosVistos.has(chave)) return;
    ganhosVistos.add(chave);
    const meu = g.jogadorId ? g.jogadorId === jogadorId : g.nome === (jogador.nome + ' ' + jogador.sobrenome);
    const cheia = String(g.tipo || '').indexOf('CARTELA CHEIA') >= 0;
    if (meu && !cheia && g.timestamp && g.timestamp >= entrada - 5000) {
      document.getElementById('telaVerificacao').classList.remove('active');
      document.getElementById('resultadoIcon').textContent = '🎉';
      document.getElementById('resultadoTitulo').textContent = 'VOCÊ GANHOU!';
      document.getElementById('resultadoTitulo').className = 'resultado-titulo venceu';
      document.getElementById('resultadoMsg').textContent = (g.tipo || 'Bingo') + ' — continue jogando para a cartela cheia!';
      document.getElementById('telaResultado').classList.add('active');
      criarConfetes();
      playSound('vitoria');
    }
  });
  renderizarGanhadores(arr);
}

function renderizarGanhadores(lista) {
  const secao = document.getElementById('ganhadoresAviso');
  const alvo = document.getElementById('ganhadoresMini');
  if (!lista.length) { secao.style.display = 'none'; alvo.innerHTML = ''; return; }
  secao.style.display = 'block';
  alvo.innerHTML = '';
  lista.forEach((g) => {
    const item = document.createElement('div');
    item.className = 'ganhador-mini';
    const img = document.createElement('img');
    img.alt = '';
    img.src = srcSeguro(g.foto);
    const nome = document.createElement('span');
    nome.textContent = String(g.nome || '').split(' ')[0];
    item.append(img, nome);
    alvo.appendChild(item);
  });
}

function atualizarAvisoGlobo(s) {
  const el = document.getElementById('globoGirandoAviso');
  if (s.girando) {
    el.innerHTML = '<span class="icone" aria-hidden="true">🎱</span> GLOBO GIRANDO...';
    el.classList.add('active');
    if (!vibrando && navigator.vibrate) { vibrando = true; vibraContinuo(); }
  } else if (s.faseAnimacao === 'letra' || s.faseAnimacao === 'numero') {
    vibrando = false;
    el.textContent = '👀 OLHE PARA O TELÃO!';
    el.classList.add('active');
  } else {
    vibrando = false;
    el.classList.remove('active');
  }
}

function vibraContinuo() {
  if (!vibrando) return;
  if (navigator.vibrate) navigator.vibrate(180);
  setTimeout(vibraContinuo, 320);
}

function mostrarBalaoReacao(reacao) {
  const balao = document.createElement('div');
  balao.className = 'balao-reacao';
  balao.style.left = (10 + Math.random() * 60) + '%';
  const img = document.createElement('img');
  img.className = 'balao-foto';
  img.alt = '';
  img.src = srcSeguro(reacao.foto);
  const nome = document.createElement('span');
  nome.className = 'balao-nome';
  nome.textContent = (reacao.nome || '') + ' ✅';
  balao.append(img, nome);
  document.body.appendChild(balao);
  setTimeout(() => balao.remove(), 2500);
}

function voltarJogo() {
  document.querySelectorAll('.confetti').forEach((c) => c.remove());
  document.getElementById('telaResultado').classList.remove('active');
}

function atualizarNavegacao() {
  const total = jogador.cartelas.length;
  document.getElementById('cartelaAtualNum').textContent = String(cartelaAtual + 1);
  document.getElementById('btnAnterior').disabled = cartelaAtual === 0;
  document.getElementById('btnProxima').disabled = cartelaAtual >= total - 1;
  document.querySelectorAll('.pagination-dot').forEach((ponto, idx) => ponto.classList.toggle('active', idx === cartelaAtual));
  document.getElementById('cartelasContainer').style.transform = 'translateX(-' + (cartelaAtual * 100) + '%)';
}

function cartelaAnterior() { if (cartelaAtual > 0) { cartelaAtual--; atualizarNavegacao(); } }
function proximaCartela() { if (jogador && cartelaAtual < jogador.cartelas.length - 1) { cartelaAtual++; atualizarNavegacao(); } }
function irParaCartela(idx) { cartelaAtual = idx; atualizarNavegacao(); }

function setupSwipe() {
  const area = document.getElementById('cartelasWrapper');
  area.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });
  area.addEventListener('touchend', (e) => {
    const dx = touchStartX - e.changedTouches[0].screenX;
    const dy = touchStartY - e.changedTouches[0].screenY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) proximaCartela();
      else cartelaAnterior();
    }
  }, { passive: true });
}

function criarConfetes() {
  const cores = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ffd700', '#ec4899', '#4ecdc4'];
  for (let i = 0; i < 50; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + '%';
    c.style.background = cores[Math.floor(Math.random() * cores.length)];
    c.style.animationDelay = Math.random() * 2 + 's';
    c.style.animationDuration = (2 + Math.random() * 2) + 's';
    document.body.appendChild(c);
  }
  setTimeout(() => document.querySelectorAll('.confetti').forEach((c) => c.remove()), 5000);
}

function playSound(tipo) {
  try {
    const ctx = criarAudio();
    if (!ctx) return;
    const nota = (freq, dur, quando, tipoOnda) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = tipoOnda || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18, quando);
      gain.gain.exponentialRampToValueAtTime(0.01, quando + dur);
      osc.start(quando);
      osc.stop(quando + dur);
    };
    if (tipo === 'ploc') nota(720, 0.09, ctx.currentTime, 'triangle');
    else if (tipo === 'bingo') [600, 800, 1000, 1200].forEach((f, i) => nota(f, 0.22, ctx.currentTime + i * 0.09, 'square'));
    else if (tipo === 'vitoria') [523, 659, 784, 880, 1047].forEach((f, i) => nota(f, 0.28, ctx.currentTime + i * 0.12, 'triangle'));
  } catch (e) {}
}
