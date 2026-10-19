/* Utilidades compartilhadas do telão e do celular. */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCPYcph6zvKD-pIrDSwlL378hJKQoz-r2I',
  authDomain: 'bingo-16f47.firebaseapp.com',
  databaseURL: 'https://bingo-16f47-default-rtdb.firebaseio.com',
  projectId: 'bingo-16f47',
  storageBucket: 'bingo-16f47.firebasestorage.app',
  messagingSenderId: '549011622250',
  appId: '1:549011622250:web:d86e8112d2d108f239fd13'
};

let TEMPO_MOSTRAR_LETRA = 3500;
let TEMPO_MOSTRAR_NUMERO = 5000;
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('rapido')) {
  TEMPO_MOSTRAR_LETRA = 1200;
  TEMPO_MOSTRAR_NUMERO = 1600;
}
const LINK_FIREBASE = 'https://console.firebase.google.com/project/bingo-16f47/database';

function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function avatarPadrao() {
  return 'data:image/svg+xml,' + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect fill='#4ecdc4' width='100' height='100'/><text x='50' y='62' text-anchor='middle' font-size='42'>👤</text></svg>"
  );
}

function srcSeguro(url) {
  if (typeof url !== 'string' || url.length < 8 || url.length > 600000) return avatarPadrao();
  if (url.startsWith('data:image/jpeg') || url.startsWith('data:image/png') || url.startsWith('data:image/webp') || url.startsWith('data:image/gif') || url.startsWith('https://')) {
    return url;
  }
  return avatarPadrao();
}

function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function iniciarFirebase() {
  if (!window.firebase) throw new Error('SDK');
  if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  const db = firebase.database();
  if (new URLSearchParams(location.search).has('emulador')) {
    db.useEmulator('127.0.0.1', 9000);
  }
  return db;
}

function comTempo(promessa, ms) {
  const limite = ms || 12000;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), limite);
    Promise.resolve(promessa).then(
      (valor) => { clearTimeout(timer); resolve(valor); },
      (erro) => { clearTimeout(timer); reject(erro); }
    );
  });
}

function mensagemErroFirebase(erro) {
  const msg = String((erro && (erro.message || erro.code)) || erro || '');
  if (msg === 'SDK') return 'Não foi possível carregar o Firebase. Confira a internet e recarregue a página.';
  if (msg === 'TIMEOUT' || /timeout/i.test(msg)) return 'O Firebase não respondeu. O Realtime Database pode estar desativado.';
  if (/deactivat|desativad/i.test(msg)) return 'O Realtime Database deste projeto está desativado.';
  if (/permission|denied/i.test(msg)) return 'O Firebase recusou a leitura ou a gravação. Confira as regras do banco.';
  if (/network|offline|failed to get|unavailable/i.test(msg)) return 'Sem conexão com a internet.';
  return 'Não foi possível falar com o Firebase.';
}

function textoBannerFirebase(erro) {
  const base = mensagemErroFirebase(erro);
  if (/desativado|não respondeu|regras do banco/i.test(base)) {
    return base + ' Ramon: no Firebase Console do projeto bingo-16f47, abra Realtime Database e toque em Reativar. Os dados da família continuam lá.';
  }
  return base;
}

let firebaseBloqueado = false;

function definirBanner(texto, mostrarLink) {
  const banner = document.getElementById('bannerSistema');
  const paragrafo = document.getElementById('bannerSistemaTexto');
  const link = document.getElementById('bannerSistemaLink');
  if (!banner || !paragrafo) return;
  if (!texto) {
    if (firebaseBloqueado) return;
    banner.hidden = true;
    return;
  }
  paragrafo.textContent = texto;
  banner.hidden = false;
  if (link) link.hidden = !mostrarLink;
}

function vigiarFirebase(db, aoMudarConexao) {
  let respondeu = false;
  const marcar = () => { respondeu = true; };
  db.ref('.info/connected').on('value', (snap) => {
    const ligado = snap.val() === true;
    if (ligado) {
      marcar();
      definirBanner('', false);
    }
    if (aoMudarConexao) aoMudarConexao(ligado && !firebaseBloqueado);
  });
  if (!new URLSearchParams(location.search).has('emulador')) {
    fetch(FIREBASE_CONFIG.databaseURL + '/.json?shallow=true')
      .then((res) => res.json())
      .then((body) => {
        if (body && body.error) {
          firebaseBloqueado = true;
          marcar();
          definirBanner(textoBannerFirebase(new Error(body.error)), true);
          if (aoMudarConexao) aoMudarConexao(false);
        }
      })
      .catch(() => {});
  }
  comTempo(db.ref('salas').limitToFirst(1).once('value'), 8000).then(marcar).catch((erro) => {
    marcar();
    firebaseBloqueado = true;
    definirBanner(textoBannerFirebase(erro), true);
    if (aoMudarConexao) aoMudarConexao(false);
  });
  setTimeout(() => {
    const banner = document.getElementById('bannerSistema');
    if (!respondeu && (!banner || banner.hidden)) {
      definirBanner(textoBannerFirebase(new Error('TIMEOUT')), true);
      if (aoMudarConexao) aoMudarConexao(false);
    }
  }, 9000);
}

function desenharCapa(origem, tamanho, qualidade) {
  const canvas = document.createElement('canvas');
  canvas.width = tamanho;
  canvas.height = tamanho;
  const ctx = canvas.getContext('2d');
  const min = Math.min(origem.width, origem.height);
  ctx.drawImage(origem, (origem.width - min) / 2, (origem.height - min) / 2, min, min, 0, 0, tamanho, tamanho);
  return canvas.toDataURL('image/jpeg', qualidade);
}

function lerArquivo(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(leitor.error || new Error('ARQUIVO'));
    leitor.readAsDataURL(arquivo);
  });
}

function carregarImagem(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGEM'));
    img.src = src;
  });
}

async function arquivoParaJpeg(arquivo, tamanho, qualidade) {
  if (!arquivo) return null;
  if (!arquivo.type || arquivo.type.indexOf('image/') !== 0) throw new Error('TIPO');
  if (arquivo.size > 8 * 1024 * 1024) throw new Error('ARQUIVO_GRANDE');
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
      const url = desenharCapa(bitmap, tamanho, qualidade);
      if (bitmap.close) bitmap.close();
      return url;
    } catch (e) { /* navegadores antigos caem no leitor abaixo */ }
  }
  const data = await lerArquivo(arquivo);
  const img = await carregarImagem(data);
  return desenharCapa(img, tamanho, qualidade);
}

function mensagemFoto(erro) {
  const msg = String((erro && erro.message) || erro || '');
  if (msg === 'ARQUIVO_GRANDE') return 'Essa foto é grande demais. Escolha uma de até 8 MB.';
  if (msg === 'TIPO') return 'Escolha um arquivo de imagem.';
  return 'Não consegui ler essa foto. Tente outra.';
}

function criarAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!criarAudio.ctx || criarAudio.ctx.state === 'closed') criarAudio.ctx = new AudioCtx();
  if (criarAudio.ctx.state === 'suspended') criarAudio.ctx.resume();
  return criarAudio.ctx;
}

function urlJogador(salaId) {
  const url = new URL('jogador.html', location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('sala', salaId);
  if (new URLSearchParams(location.search).has('emulador')) url.searchParams.set('emulador', '1');
  return url.href;
}

function atualizarStatusConexao(ligado) {
  const el = document.getElementById('statusConexao');
  if (!el) return;
  el.textContent = ligado ? 'Conectado' : 'Sem conexão';
  el.classList.toggle('ok', ligado);
  el.classList.toggle('ruim', !ligado);
}
