/* Regras puras do Bingo dos Veloso. Sem DOM, para o telão e o celular usarem a mesma cartela. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function comoLista(valor) {
    if (!valor) return [];
    if (Array.isArray(valor)) return valor.slice();
    return Object.keys(valor)
      .sort((a, b) => Number(a) - Number(b))
      .map((chave) => valor[chave]);
  }

  function getLetra(numero) {
    const n = Number(numero);
    if (n <= 15) return 'B';
    if (n <= 30) return 'I';
    if (n <= 45) return 'N';
    if (n <= 60) return 'G';
    return 'O';
  }

  function gerarCartela(idx) {
    const gerar = (min, max, qtd) => {
      const nums = [];
      while (nums.length < qtd) {
        const n = Math.floor(Math.random() * (max - min + 1)) + min;
        if (!nums.includes(n)) nums.push(n);
      }
      return nums;
    };
    const B = gerar(1, 15, 5);
    const I = gerar(16, 30, 5);
    const N = gerar(31, 45, 4);
    const G = gerar(46, 60, 5);
    const O = gerar(61, 75, 5);
    const numeros = [];
    for (let linha = 0; linha < 5; linha++) {
      numeros.push([
        B[linha],
        I[linha],
        linha === 2 ? 0 : N[linha < 2 ? linha : linha - 1],
        G[linha],
        O[linha]
      ]);
    }
    return { id: idx + 1, numeros: numeros, marcados: [0], totalMarcados: 1 };
  }

  function grade(nums) {
    return comoLista(nums).map((linha) => comoLista(linha).map((n) => Number(n)));
  }

  function conjunto(lista) {
    return new Set(comoLista(lista).map((n) => Number(n)));
  }

  function temSequenciaMarcada(nums, marcados) {
    const tabela = grade(nums);
    const marc = conjunto(marcados);
    const preenchido = (n) => n === 0 || marc.has(n);
    for (let i = 0; i < 5; i++) {
      if (tabela[i] && tabela[i].every(preenchido)) return true;
    }
    for (let c = 0; c < 5; c++) {
      if (tabela.every((linha) => preenchido(linha[c]))) return true;
    }
    if ([0, 1, 2, 3, 4].every((i) => tabela[i] && preenchido(tabela[i][i]))) return true;
    if ([0, 1, 2, 3, 4].every((i) => tabela[i] && preenchido(tabela[i][4 - i]))) return true;
    return false;
  }

  /* Sequência só vale se cada número (fora o coringa) foi marcado E já saiu no globo.
     Regra da casa: se saiu algum número da cartela e a pessoa não marcou, o bingo é recusado. */
  function analisarCartela(nums, marcados, sorteados) {
    const tabela = grade(nums);
    const marc = conjunto(marcados);
    const sorte = conjunto(sorteados);
    const conta = (n) => n === 0 || (marc.has(n) && sorte.has(n));
    const linhas = [];
    const colunas = [];
    const diagonais = [];
    for (let i = 0; i < 5; i++) {
      if (tabela[i] && tabela[i].every(conta)) linhas.push(i);
    }
    for (let c = 0; c < 5; c++) {
      if (tabela.every((linha) => conta(linha[c]))) colunas.push(c);
    }
    if ([0, 1, 2, 3, 4].every((i) => tabela[i] && conta(tabela[i][i]))) diagonais.push('d1');
    if ([0, 1, 2, 3, 4].every((i) => tabela[i] && conta(tabela[i][4 - i]))) diagonais.push('d2');
    const todos = tabela.flat().filter((n) => n !== 0);
    const cartelaCheia = todos.length > 0 && todos.every((n) => marc.has(n) && sorte.has(n));
    const perdidos = todos.filter((n) => sorte.has(n) && !marc.has(n));
    const cruzada = diagonais.length === 2;
    let tipoVitoria = null;
    if (cartelaCheia) tipoVitoria = '🏆 CARTELA CHEIA';
    else if (cruzada) tipoVitoria = '✖️ Cruzada';
    else if (diagonais.length) tipoVitoria = '↗️ Diagonal';
    else if (linhas.length) tipoVitoria = '➖ Linha';
    else if (colunas.length) tipoVitoria = '| Coluna';
    const temSequencia = Boolean(linhas.length || colunas.length || diagonais.length || cartelaCheia);
    return {
      linhas: linhas,
      colunas: colunas,
      diagonais: diagonais,
      cruzada: cruzada,
      cartelaCheia: cartelaCheia,
      tipoVitoria: tipoVitoria,
      perdidos: perdidos,
      temSequencia: temSequencia,
      valido: perdidos.length === 0 && temSequencia
    };
  }

  return {
    comoLista: comoLista,
    getLetra: getLetra,
    gerarCartela: gerarCartela,
    temSequenciaMarcada: temSequenciaMarcada,
    analisarCartela: analisarCartela
  };
});
