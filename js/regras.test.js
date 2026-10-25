const test = require('node:test');
const assert = require('node:assert/strict');
const { comoLista, getLetra, gerarCartela, temSequenciaMarcada, analisarCartela } = require('./regras.js');

test('letra do bingo segue as faixas clássicas', () => {
  assert.equal(getLetra(1), 'B');
  assert.equal(getLetra(15), 'B');
  assert.equal(getLetra(16), 'I');
  assert.equal(getLetra(30), 'I');
  assert.equal(getLetra(31), 'N');
  assert.equal(getLetra(45), 'N');
  assert.equal(getLetra(46), 'G');
  assert.equal(getLetra(60), 'G');
  assert.equal(getLetra(61), 'O');
  assert.equal(getLetra(75), 'O');
});

test('cartela tem coringa no centro e colunas dentro da faixa', () => {
  const cartela = gerarCartela(0);
  assert.equal(cartela.numeros[2][2], 0);
  assert.equal(cartela.marcados[0], 0);
  const faixas = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];
  const vistos = new Set();
  cartela.numeros.forEach((linha) => {
    linha.forEach((n, coluna) => {
      if (n === 0) return;
      assert.equal(vistos.has(n), false);
      vistos.add(n);
      assert.ok(n >= faixas[coluna][0] && n <= faixas[coluna][1]);
    });
  });
  assert.equal(vistos.size, 24);
});

test('lista vinda do Firebase como objeto volta a ser array', () => {
  assert.deepEqual(comoLista({ 1: 20, 0: 10 }), [10, 20]);
  assert.deepEqual(comoLista(null), []);
});

test('linha marcada com número que ainda não saiu não é bingo', () => {
  const numeros = [
    [1, 16, 31, 46, 61],
    [2, 17, 32, 47, 62],
    [3, 18, 0, 48, 63],
    [4, 19, 33, 49, 64],
    [5, 20, 34, 50, 65]
  ];
  const marcados = [0, 1, 16, 31, 46, 61];
  assert.equal(temSequenciaMarcada(numeros, marcados), true);
  const analise = analisarCartela(numeros, marcados, [2, 3]);
  assert.equal(analise.valido, false);
  assert.equal(analise.temSequencia, false);
});

test('linha completa com números sorteados é válida', () => {
  const numeros = [
    [1, 16, 31, 46, 61],
    [2, 17, 32, 47, 62],
    [3, 18, 0, 48, 63],
    [4, 19, 33, 49, 64],
    [5, 20, 34, 50, 65]
  ];
  const marcados = [0, 1, 16, 31, 46, 61];
  const analise = analisarCartela(numeros, marcados, [1, 16, 31, 46, 61]);
  assert.equal(analise.valido, true);
  assert.equal(analise.tipoVitoria, '➖ Linha');
  assert.deepEqual(analise.linhas, [0]);
});

test('esqueceu um número que já saiu e a cartela é recusada', () => {
  const numeros = [
    [1, 16, 31, 46, 61],
    [2, 17, 32, 47, 62],
    [3, 18, 0, 48, 63],
    [4, 19, 33, 49, 64],
    [5, 20, 34, 50, 65]
  ];
  const marcados = [0, 1, 16, 31, 46, 61];
  const analise = analisarCartela(numeros, marcados, [1, 16, 31, 46, 61, 65]);
  assert.equal(analise.valido, false);
  assert.deepEqual(analise.perdidos, [65]);
});

test('cartela cheia só fecha quando os 24 números saíram e foram marcados', () => {
  const cartela = gerarCartela(2);
  const todos = cartela.numeros.flat().filter((n) => n !== 0);
  const quase = analisarCartela(cartela.numeros, [0].concat(todos.slice(0, 23)), todos);
  assert.equal(quase.cartelaCheia, false);
  const cheia = analisarCartela(cartela.numeros, [0].concat(todos), todos);
  assert.equal(cheia.cartelaCheia, true);
  assert.equal(cheia.tipoVitoria, '🏆 CARTELA CHEIA');
  assert.equal(cheia.valido, true);
});

test('cruzada exige as duas diagonais sorteadas', () => {
  const numeros = [
    [1, 16, 31, 46, 61],
    [2, 17, 32, 47, 62],
    [3, 18, 0, 48, 63],
    [4, 19, 33, 49, 64],
    [5, 20, 34, 50, 65]
  ];
  const cruz = [1, 17, 49, 65, 5, 19, 47, 61];
  const analise = analisarCartela(numeros, [0].concat(cruz), cruz);
  assert.equal(analise.cruzada, true);
  assert.equal(analise.tipoVitoria, '✖️ Cruzada');
});
