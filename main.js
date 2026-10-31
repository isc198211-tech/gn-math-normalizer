const { Plugin, Notice, MarkdownView } = require('obsidian');
const { EditorView } = require('@codemirror/view');

const {
  limparLatex,
  protegerCodigo,
  pareceFormula,
  expressaoLaTeXCompleta
} = (() => {
'use strict';

const MOEDA_TOKEN = 'ZXQMOEDA_CIFRAOQXZ';
const CODIGO_TOKEN = 'ZXQCODIGO_OBSIDIAN_';

function decodificarHTML(texto) {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return m; } })
    .replace(/&#([0-9]+);/g, (m, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return m; } })
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");
}

function protegerCodigo(texto) {
  const blocos = [];
  const salvar = (conteudo) => {
    const marcador = `${CODIGO_TOKEN}${blocos.length}QXZ`;
    blocos.push({ marcador, conteudo });
    return marcador;
  };

  // Fenced code: aceita ``` e ~~~, inclusive linhas prefixadas por blockquote.
  const linhas = texto.split(/(?<=\n)/);
  const saida = [];
  let bloco = [];
  let cercaAtual = null;
  let tamanhoAtual = 0;

  const analisarCerca = (linha) => {
    const semEol = linha.replace(/\r?\n$/, '');
    const m = semEol.match(/^( {0,3}(?:> ?)*)( {0,3})(`{3,}|~{3,})(.*)$/);
    if (!m) return null;
    return { char: m[3][0], tamanho: m[3].length, info: m[4].trim() };
  };

  for (const linha of linhas) {
    const cerca = analisarCerca(linha);
    if (!cercaAtual) {
      if (cerca) {
        cercaAtual = cerca.char;
        tamanhoAtual = cerca.tamanho;
        bloco = [linha];
      } else saida.push(linha);
    } else {
      bloco.push(linha);
      if (cerca && cerca.char === cercaAtual && cerca.tamanho >= tamanhoAtual && !cerca.info) {
        saida.push(salvar(bloco.join('')));
        bloco = [];
        cercaAtual = null;
        tamanhoAtual = 0;
      }
    }
  }
  if (cercaAtual) saida.push(salvar(bloco.join(''))); // fence sem fechamento: protege até o fim.

  texto = saida.join('');

  // Código inline: delimitadores com a mesma quantidade de crases.
  texto = texto.replace(/(`+)(?!`)([\s\S]*?)\1(?!`)/g, (m) => salvar(m));

  return {
    texto,
    restaurar(conteudo) {
      for (const item of [...blocos].reverse()) {
        conteudo = conteudo.split(item.marcador).join(item.conteudo);
      }
      return conteudo;
    }
  };
}

function pareceFormula(expressao) {
  const e = expressao.trim();
  if (!e) return false;
  if (/\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|times|cdot|div|log|ln|lim|pi|alpha|beta|theta|overline|mathbf|text|left|right)\b/.test(e)) return true;
  if (/[=+*/^_]/.test(e)) return true;
  if (/\d\s*[-+]\s*\d/.test(e)) return true;
  return /^[A-Za-z](?:_[A-Za-z0-9{}]+)?$/.test(e);
}
    
    function expressaoLaTeXCompleta(expressao) {
  const texto = expressao.trim();

  if (!texto || !pareceFormula(texto)) return false;

  // Verifica o balanceamento das chaves.
  let profundidade = 0;

  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === '\\') {
      i++;
      continue;
    }

    if (texto[i] === '{') profundidade++;

    if (texto[i] === '}') {
      profundidade--;
      if (profundidade < 0) return false;
    }
  }

  if (profundidade !== 0) return false;

  // Localiza e valida argumentos obrigatórios.
  function consumirGrupo(posicao) {
    while (/\s/.test(texto[posicao] ?? '')) posicao++;

    if (texto[posicao] !== '{') return -1;

    let nivel = 0;

    for (let i = posicao; i < texto.length; i++) {
      if (texto[i] === '\\') {
        i++;
        continue;
      }

      if (texto[i] === '{') nivel++;
      if (texto[i] === '}') nivel--;

      if (nivel === 0) return i + 1;
    }

    return -1;
  }

  const doisArgumentos = ['frac', 'dfrac', 'tfrac'];
  const umArgumento = [
    'sqrt', 'text', 'mathbf', 'mathrm',
    'mathit', 'overline', 'underline',
    'operatorname'
  ];

  const regex = /\\([a-zA-Z]+)\b/g;
  let resultado;

  while ((resultado = regex.exec(texto)) !== null) {
    const comando = resultado[1];
    let posicao = regex.lastIndex;

    if (doisArgumentos.includes(comando)) {
      posicao = consumirGrupo(posicao);
      if (posicao < 0) return false;

      posicao = consumirGrupo(posicao);
      if (posicao < 0) return false;
    }

    if (umArgumento.includes(comando)) {
      if (comando === 'sqrt') {
        while (/\s/.test(texto[posicao] ?? '')) posicao++;

        if (texto[posicao] === '[') {
          const fechamento = texto.indexOf(']', posicao + 1);
          if (fechamento < 0) return false;
          posicao = fechamento + 1;
        }
      }

      if (consumirGrupo(posicao) < 0) return false;
    }
  }

  if (/\\$/.test(texto)) return false;

  return true;
}
    
function normalizarQuebras(texto) {
  return texto.replace(/\r\n?/g, '\n').replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\\[ \t]*\n/g, '\n');
}

function corrigirMarkdownEscapado(texto) {
  texto = texto.replace(/\\\*\\\*/g, '**');
  texto = texto.replace(/^([ \t]*)\\\*\s+/gm, '$1- ');
  texto = texto.replace(/^[ \t]*\\---[ \t]*$/gm, '---');
  texto = texto.replace(/^([ \t]*)\\(#{1,6})[ \t]+/gm, '$1$2 ');
  texto = texto.replace(/^([ \t]*)\\>{1,2}[ \t]?/gm, '$1> ');
  return texto;
}

function corrigirIndicesMatematicos(texto) {
  texto = texto.replace(/\b([MJ])\s*\\?\*?\\?\{\\?text\{([^{}]+)\}\}/g, '$1_{\\text{$2}}');
  texto = texto.replace(/\b([MJ])(Simples|Compostos?)\b/g, '$1_{\\text{$2}}');
  return texto;
}

function protegerMoeda(texto) {
  return texto.replace(/\bR\\?\$/gi, MOEDA_TOKEN);
}

function normalizarDelimitadoresEscapados(texto) {
  return texto.replace(/\\+\$/g, '$');
}

function converterDelimitadoresLatex(texto) {
  // Recupera a corrupção histórica \left$...\right$.
  texto = texto.replace(/\\left\\?\$([\s\S]*?)\\right\\?\$/g, (_m, c) => `\\left[${c.trim()}\\right]`);
  texto = texto.replace(/\\+\[([\s\S]*?)\\+\]/g, (_m, c) => `\n$$\n${c.trim()}\n$$\n`);
  texto = texto.replace(/\\+\(([\s\S]*?)\\+\)/g, (_m, c) => `$${c.trim()}$`);
  return texto;
}

function corrigirDelimitadoresDuplicadosEmBlocos(texto) {
  // Trata tanto display multilinha quanto o caso $$ $x=1$ $$ na mesma linha.
  texto = texto.replace(/\$\$([^\n]*?)\$\$/g, (m, corpo) => {
    const limpo = corpo.replace(/(^|[ \t])\$(?!\$)([^$\n]+?)\$(?!\$)(?=[ \t]|$)/g, '$1$2');
    return `$$${limpo}$$`;
  });

  const linhas = texto.split('\n');
  const saida = [];
  let dentro = false;
  for (let linha of linhas) {
    const semPrefixo = linha.replace(/^[ \t]*(?:>[ \t]?)*/, '').trim();
    if (!dentro && semPrefixo === '$$') { dentro = true; saida.push(linha); continue; }
    if (dentro && semPrefixo === '$$') { dentro = false; saida.push(linha); continue; }
    if (dentro) {
      linha = linha.replace(/^([ \t]*(?:>[ \t]?)*)\$([^$\n]+?)\$(?=[ \t]*$)/, '$1$2');
    }
    saida.push(linha);
  }
  return saida.join('\n');
}

function corrigirConteudoFormula(conteudo) {
  let f = conteudo.replace(/\\_(?=\{)/g, '_');
  f = corrigirIndicesMatematicos(f);
  f = f.replace(/(?<!\\)%/g, '\\%');
  f = f.replace(/R\s*\\{2,}\$/g, 'R\\$');
  return f;
}

function escaparPercentualEmMatematica(texto) {
  // Atua somente dentro de delimitadores matemáticos reconhecidos.
  return texto.replace(/(\$\$[\s\S]*?\$\$|(?<!\$)\$(?!\$)[^$\n]+?(?<!\\)\$(?!\$))/g, (formula) => {
    return formula.replace(/(?<=\d)([ \t]*)%(?![A-Za-z])/g, '$1\\%');
  });
}

function converterColchetesMatematicos(texto) {
  return texto.replace(/(?<!\\left)\[([^\[\]\n]+?)\](?!\s*\()/g, (m, conteudo) => {
    const expressao = conteudo.trim();
    return pareceFormula(expressao) ? `$${expressao}$` : m;
  });
}

function envolverEquacoesComLeftRight(texto) {
  const linhas = texto.split('\n');
  const resultado = [];
  let dentroBloco = false;
  const permitidos = /^[A-Za-zÀ-ÿ0-9_{}\\\[\]().,=+\-*/^%<>| \t×≈≤≥]+$/;
  const inicioFormula = /^(?:\d|\\(?:frac|sqrt|left|sum|int)\b|[A-Za-z][A-Za-z0-9_]*\s*(?:=|≈|≤|≥|<|>|\\(?:times|cdot|div)\b))/;

  for (const linha of linhas) {
    const semPrefixo = linha.replace(/^[ \t]*(?:>[ \t]?)*/, '').trim();
    if (semPrefixo === '$$') { dentroBloco = !dentroBloco; resultado.push(linha); continue; }
    if (dentroBloco) { resultado.push(linha); continue; }

    const mPrefixo = linha.match(/^([ \t]*(?:(?:>[ \t]?)*)(?:(?:[-*+]\s+|\d+[.)]\s+))?)/);
    const prefixo = mPrefixo ? mPrefixo[1] : '';
    const corpo = linha.slice(prefixo.length).trim();
    const jaDelimitada = corpo.includes('$') || corpo.includes('\\(') || corpo.includes('\\[');
    const temLeftRight = /\\left\s*[\[({]/.test(corpo) && /\\right\s*[\])}]/.test(corpo);
    const terminaEmRight = /\\right\s*[\])}]\s*[.,;]?$/.test(corpo);
    const temComando = /\\(?:frac|times|cdot|sqrt|div|sum|int)\b/.test(corpo);
    if (!jaDelimitada && temLeftRight && terminaEmRight && temComando && inicioFormula.test(corpo) && permitidos.test(corpo)) {
      resultado.push(prefixo + '$' + corrigirConteudoFormula(corpo) + '$');
    } else resultado.push(linha);
  }
  return resultado.join('\n');
}

function removerBarrasSoltas(texto) {
  return texto.replace(/^[ \t]*\\[ \t]*$/gm, '');
}

function ehLinhaDivisoriaOuTitulo(linha) {
  const limpa = linha.replace(/^[ \t]*(?:>[ \t]?)*/, '').trim();
  return /^#{1,6}(?:\s|$)/.test(limpa) || /^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(limpa);
}

function normalizarCallouts(texto) {
  const linhas = texto.split('\n');
  const resultado = [];
  let dentro = false;
  for (const linha of linhas) {
    const inicio = /^[ \t]*(?:>[ \t]?)?\[![^\]]+\]/.test(linha);
    if (dentro && ehLinhaDivisoriaOuTitulo(linha)) dentro = false;
    if (inicio) {
      const conteudo = linha.replace(/^[ \t]*(?:>[ \t]?)?/, '').trimEnd();
      resultado.push(conteudo ? `> ${conteudo}` : '>');
      dentro = true;
    } else if (dentro) {
      const conteudo = linha.replace(/^[ \t]*>[ \t]?/, '');
      resultado.push(conteudo.trim() ? `> ${conteudo}` : '>');
    } else resultado.push(linha);
  }
  return resultado.join('\n');
}

function converterFormulasIsoladas(texto) {
  const linhas = texto.split('\n');
  const resultado = [];
  let dentroBloco = false;
  for (const linha of linhas) {
    const conteudo = linha.trim();
    const semPrefixo = conteudo.replace(/^(?:>\s?)*/, '').trim();
    if (semPrefixo === '$$') {
      dentroBloco = !dentroBloco;
      resultado.push(linha);
      continue;
    }
    if (dentroBloco || !conteudo || conteudo.includes('$') || conteudo.includes('\\(') || conteudo.includes('\\[') || /^(?:#{1,6}\s|[-*+]\s|>\s|---+$)/.test(conteudo) || conteudo.startsWith('$$')) {
      resultado.push(linha);
      continue;
    }
    
    const temOperador = /(?:=|<|>|\\implies|\\Longrightarrow|\\Rightarrow)/.test(conteudo);

    const temEstrutura = /\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|times|cdot|div)\b/.test(conteudo);

    const temIndice = /[MJ]_\{\\text\{/.test(conteudo);

    // Reconhece expressões matemáticas que começam com comandos estruturais.
    //const comandoNoInicio = /^\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int)\b/.test(conteudo);

    const formulaReconhecida =
        temOperador && (temEstrutura || temIndice);

    resultado.push(formulaReconhecida
      ? `$$\n${corrigirConteudoFormula(conteudo)}\n$$`
      : linha);
  }
  return resultado.join('\n');
}

function limparLatex(texto) {
  if (typeof texto !== 'string' || !texto) return texto;

  // Protege código antes de decodificar HTML, normalizar Unicode ou aplicar regex.
  const codigo = protegerCodigo(texto);
  let s = codigo.texto;
  s = decodificarHTML(s).normalize('NFKC');
  s = normalizarQuebras(s);
  s = protegerMoeda(s);
  s = corrigirMarkdownEscapado(s);
  s = corrigirIndicesMatematicos(s);
  s = normalizarDelimitadoresEscapados(s);
  s = converterDelimitadoresLatex(s);
  s = corrigirDelimitadoresDuplicadosEmBlocos(s);
  s = escaparPercentualEmMatematica(s);
  s = converterColchetesMatematicos(s);
  s = envolverEquacoesComLeftRight(s);
  s = removerBarrasSoltas(s);
  s = converterFormulasIsoladas(s);
  s = normalizarCallouts(s);
  s = s.replace(MOEDA_TOKEN, 'R\\$');
  s = codigo.restaurar(s);
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
return {
  limparLatex,
  protegerCodigo,
  pareceFormula,
  expressaoLaTeXCompleta
};
  })();

const detectarEnterLaTeX = (plugin) =>
  EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;

    for (const transacao of update.transactions) {
      if (!transacao.docChanged) continue;

      transacao.changes.iterChanges(
        (fromA, toA, fromB, toB, textoInserido) => {
          if (!textoInserido.toString().includes('\n')) return;

          const linhaAnterior =
            transacao.startState.doc.lineAt(fromA).number - 1;

          const timer = setTimeout(() => {
            plugin.timersPendentes.delete(timer);

            plugin.normalizarLinhaConfirmada(
              plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor,
              linhaAnterior
            );
          }, 50);

          plugin.timersPendentes.add(timer);
        }
      );
    }
  });

class GNMathNormalizer extends Plugin {
  async onload() {
    this.ultimaColagem = null;
    this.timersNormalizacao = new WeakMap();
    this.timersPendentes = new Set();
    this.normalizacaoEmAndamento = new WeakSet();

    this.registerEditorExtension(detectarEnterLaTeX(this));

    // A normalização automática é deliberadamente conservadora:
    // só examina a linha editada e só atua quando há um padrão LaTeX reconhecível.
    this.registerEvent(this.app.workspace.on('editor-change', (editor) => {
      if (!editor || this.normalizacaoEmAndamento.has(editor)) return;

      const anterior = this.timersNormalizacao.get(editor);
      if (anterior) {
        clearTimeout(anterior);
        this.timersPendentes.delete(anterior);
      }

      const timer = setTimeout(() => {
        this.timersPendentes.delete(timer);
        this.timersNormalizacao.delete(editor);
        this.normalizarLinhaAtual(editor);
      }, 700);

      this.timersNormalizacao.set(editor, timer);
      this.timersPendentes.add(timer);
    }));

// Normaliza automaticamente a nota inteira sempre que ela for aberta.
const agendarNormalizacao = (file) => {
  if (!file) return;

  const timer = setTimeout(() => {
    this.timersPendentes.delete(timer);

    const arquivoAtivo = this.app.workspace.getActiveFile();
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (!view || !arquivoAtivo || arquivoAtivo.path !== file.path) return;

    this.normalizarNotaAberta(view.editor);
  }, 500);

  this.timersPendentes.add(timer);
};

// Executa ao abrir ou trocar de nota.
this.registerEvent(
  this.app.workspace.on('file-open', (file) => {
    agendarNormalizacao(file);
  })
);

// Também verifica a nota que já estava aberta durante a inicialização.
this.app.workspace.onLayoutReady(() => {
  agendarNormalizacao(this.app.workspace.getActiveFile());
});

    // Mantém o fluxo original de colagem e sua normalização integral.
    this.registerEvent(this.app.workspace.on('editor-paste', (evt, editor) => {
      try {
        const clipboard = evt.clipboardData;
        if (!clipboard || !editor) return;
        const original = clipboard.getData('text/plain');
        if (typeof original !== 'string' || !original.trim()) return;
        const inicio = editor.posToOffset(editor.getCursor('from'));
        const filePath = this.app.workspace.getActiveFile()?.path ?? null;
        const resultado = limparLatex(original);
        if (resultado !== original) {
          evt.preventDefault();
          editor.replaceSelection(resultado);
          new Notice('Conteúdo colado e normalizado automaticamente.');
        }
        this.ultimaColagem = {
          from: inicio,
          to: inicio + resultado.length,
          filePath
        };
      } catch (erro) {
        console.error('[GN Math Normalizer] Falha na normalização da colagem:', erro);
      }
    }));

    this.addRibbonIcon(
      'wand-sparkles',
      'GN Math Normalizer: normalizar texto selecionado',
      async () => this.normalizarSelecao()
    );

    this.addCommand({ id: 'normalizar-ultima-colagem', name: 'Normalizar último conteúdo colado', callback: () => this.normalizarUltimaColagem() });
    this.addCommand({ id: 'normalizar-texto-selecionado', name: 'Normalizar texto selecionado na nota', callback: () => this.normalizarSelecao() });
    this.addCommand({ id: 'normalizar-clipboard-inserir', name: 'Normalizar clipboard e inserir no cursor', callback: () => this.normalizarEInserir() });
    this.addCommand({ id: 'normalizar-clipboard-copiar', name: 'Normalizar clipboard e copiar resultado', callback: () => this.normalizarECopiar() });
  }

  onunload() {
    for (const timer of this.timersPendentes ?? []) clearTimeout(timer);
    this.timersPendentes?.clear();
  }

normalizarNotaAberta(editor) {
  if (!editor || this.normalizacaoEmAndamento.has(editor)) return;

  try {
    const original = editor.getValue();

    if (!original || !original.trim()) return;

    // Aplica o normalizador completo à nota inteira.
    // A própria limparLatex() protege blocos e trechos de código.
    const texto = limparLatex(original);

    // Evita modificar o documento quando não há correções.
    if (texto === original) return;

    // Guarda a posição atual do cursor/seleção.
    const anchorOffset = editor.posToOffset(editor.getCursor('from'));
    const headOffset = editor.posToOffset(editor.getCursor('to'));

    // Identifica as partes inalteradas para preservar a posição do cursor.
    let prefixoComum = 0;

    while (
      prefixoComum < original.length &&
      prefixoComum < texto.length &&
      original[prefixoComum] === texto[prefixoComum]
    ) {
      prefixoComum++;
    }

    let sufixoComum = 0;

    while (
      sufixoComum < original.length - prefixoComum &&
      sufixoComum < texto.length - prefixoComum &&
      original[original.length - 1 - sufixoComum] ===
      texto[texto.length - 1 - sufixoComum]
    ) {
      sufixoComum++;
    }

    const mapearOffset = (offset) => {
      if (offset <= prefixoComum) return offset;

      if (offset >= original.length - sufixoComum) {
        return texto.length - (original.length - offset);
      }

      return prefixoComum + Math.min(
        offset - prefixoComum,
        texto.length - prefixoComum - sufixoComum
      );
    };

    const novoAnchor = Math.max(
      0,
      Math.min(texto.length, mapearOffset(anchorOffset))
    );

    const novoHead = Math.max(
      0,
      Math.min(texto.length, mapearOffset(headOffset))
    );

    // Evita que a alteração acione novamente a normalização automática.
    this.normalizacaoEmAndamento.add(editor);

    // Substitui o documento inteiro em uma única operação.
    editor.replaceRange(
      texto,
      { line: 0, ch: 0 },
      editor.offsetToPos(original.length)
    );

    // Restaura a posição do cursor ou da seleção.
    editor.setSelection(
      editor.offsetToPos(novoAnchor),
      editor.offsetToPos(novoHead)
    );

    // Libera a trava após a transação de edição.
    setTimeout(() => {
      this.normalizacaoEmAndamento.delete(editor);
    }, 0);

    console.log(
      '[GN Math Normalizer] Nota aberta e normalizada:',
      this.app.workspace.getActiveFile()?.path
    );

  } catch (erro) {
    this.normalizacaoEmAndamento.delete(editor);

    console.error(
      '[GN Math Normalizer] Falha na normalização ao abrir nota:',
      erro
    );
  }
}

    linhaDentroBlocoCodigo(editor, linhaAlvo) {
    let cercaAtual = null;
    let tamanhoAtual = 0;

    for (let i = 0; i <= linhaAlvo; i++) {
      const linha = editor.getLine(i);

      const m = linha.match(
        /^( {0,3}(?:> ?)*)( {0,3})(`{3,}|~{3,})(.*)$/
      );

      if (!cercaAtual) {
        // Identifica a abertura de um bloco de código.
        if (m) {
          cercaAtual = m[3][0];
          tamanhoAtual = m[3].length;
        }
      } else {
        // Identifica o fechamento do bloco de código.
        if (
          m &&
          m[3][0] === cercaAtual &&
          m[3].length >= tamanhoAtual &&
          !m[4].trim()
        ) {
          cercaAtual = null;
          tamanhoAtual = 0;
        }
      }

      if (i === linhaAlvo) {
        return cercaAtual !== null;
      }
    }

    return false;
  }
  
  normalizarLinhaConfirmada(editor, linhaAlvo) {
  if (!editor || this.normalizacaoEmAndamento.has(editor)) return;

  try {
    if (linhaAlvo < 0 || linhaAlvo >= editor.lineCount()) return;

    const linhaOriginal = editor.getLine(linhaAlvo);

    if (!linhaOriginal || !linhaOriginal.trim()) return;

    if (this.linhaDentroBlocoCodigo(editor, linhaAlvo)) return;

    // Não interfere em listas, citações ou callouts.
    if (/^\s*(?:>|[-*+]\s|\d+[.)]\s)/.test(linhaOriginal)) return;
    if (/^\s*\[![^\]]+\]/.test(linhaOriginal)) return;

    const corpo = linhaOriginal.trim();

    // Não altera fórmulas que já possuem delimitadores.
    if (
      corpo.includes('$') ||
      corpo.includes('\\(') ||
      corpo.includes('\\[')
    ) return;

    if (!expressaoLaTeXCompleta(corpo)) return;

    const resultado = limparLatex(`\\[${corpo}\\]`);

    if (!resultado) return;

    const indentacao = linhaOriginal.match(/^\s*/)[0];

    const novaLinha = resultado
      .split('\n')
      .map(linha => indentacao + linha)
      .join('\n');

    if (novaLinha === linhaOriginal) return;

    this.normalizacaoEmAndamento.add(editor);

    editor.replaceRange(
      novaLinha,
      { line: linhaAlvo, ch: 0 },
      { line: linhaAlvo, ch: linhaOriginal.length }
    );

    setTimeout(() => {
      this.normalizacaoEmAndamento.delete(editor);
    }, 0);

    new Notice('Expressão matemática confirmada e normalizada.');

  } catch (erro) {
    this.normalizacaoEmAndamento.delete(editor);

    console.error(
      '[GN Math Normalizer] Falha na confirmação matemática:',
      erro
    );
  }
}

  normalizarLinhaAtual(editor) {
    if (!editor || this.normalizacaoEmAndamento.has(editor)) return;

    try {
      // Não interfere enquanto o usuário mantém uma seleção ativa.
      if (editor.getSelection()) return;
      const cursor = editor.getCursor();
      const linhaOriginal = editor.getLine(cursor.line);
      if (!linhaOriginal || !linhaOriginal.trim()) return;

      // Nunca processa uma linha de abertura/fechamento de bloco de código.
            // Nunca processa linhas de abertura/fechamento ou conteúdo
      // localizado dentro de blocos de código.
      if (/^\s*(?:>\s*)?(?:`{3,}|~{3,})/.test(linhaOriginal)) return;

      if (this.linhaDentroBlocoCodigo(editor, cursor.line)) return;

      // Preserva prefixos de citação/lista e normaliza somente o conteúdo textual.
      const prefixoMatch = linhaOriginal.match(/^(\s*(?:(?:>\s*)*)(?:(?:[-*+]\s+|\d+[.)]\s+))?)/);
      const prefixo = prefixoMatch?.[1] ?? '';
      const corpo = linhaOriginal.slice(prefixo.length);
      if (!corpo.trim() || /^\[![^\]]+\]/.test(corpo.trim())) return;

      // Evita alterar texto comum: exige sinal claro de corrupção/formatação matemática.

    const temProblemaLaTeX =
      /\\+\([^()\n]*?\\+\)/.test(corpo) ||
      /\\+\[[^\n]*?\\+\]/.test(corpo) ||
      /\\left\\?\$[\s\S]*?\\right\\?\$/.test(corpo) ||
      /\\_(?=\{)/.test(corpo) ||
      /\$\$[^\n]*?\$[^$\n]+\$[^$\n]*?\$\$/.test(corpo);

      if (!temProblemaLaTeX) return;


      const resultado = limparLatex(corpo);
      const novaLinha = prefixo + resultado;
      if (novaLinha === linhaOriginal) return;

      const inicio = { line: cursor.line, ch: 0 };
      const fim = { line: cursor.line, ch: linhaOriginal.length };
      const selecaoInicio = editor.getCursor('from');
      const selecaoFim = editor.getCursor('to');
      const inicioOffset = editor.posToOffset(inicio);
      const inicioSelecao = editor.posToOffset(selecaoInicio) - inicioOffset;
      const fimSelecao = editor.posToOffset(selecaoFim) - inicioOffset;

      // Mapeia a seleção pela região comum antes/depois da alteração.
      let prefixoComum = 0;
      while (prefixoComum < linhaOriginal.length && prefixoComum < novaLinha.length &&
             linhaOriginal[prefixoComum] === novaLinha[prefixoComum]) prefixoComum++;
      let sufixoComum = 0;
      while (sufixoComum < linhaOriginal.length - prefixoComum &&
             sufixoComum < novaLinha.length - prefixoComum &&
             linhaOriginal[linhaOriginal.length - 1 - sufixoComum] === novaLinha[novaLinha.length - 1 - sufixoComum]) sufixoComum++;

      const mapear = (pos) => {
        if (pos <= prefixoComum) return pos;
        if (pos >= linhaOriginal.length - sufixoComum) {
          return novaLinha.length - (linhaOriginal.length - pos);
        }
        const trechoNovo = novaLinha.length - prefixoComum - sufixoComum;
        return prefixoComum + Math.min(pos - prefixoComum, Math.max(0, trechoNovo));
      };

      this.normalizacaoEmAndamento.add(editor);
      editor.replaceRange(novaLinha, inicio, fim);
      const novoInicio = Math.max(0, Math.min(novaLinha.length, mapear(inicioSelecao)));
      const novoFim = Math.max(novoInicio, Math.min(novaLinha.length, mapear(fimSelecao)));
      editor.setSelection(
        editor.offsetToPos(inicioOffset + novoInicio),
        editor.offsetToPos(inicioOffset + novoFim)
      );

      // editor-change é síncrono na transação de edição; a trava é liberada no próximo ciclo.
      setTimeout(() => this.normalizacaoEmAndamento.delete(editor), 0);
    } catch (erro) {
      this.normalizacaoEmAndamento.delete(editor);
      console.error('[GN Math Normalizer] Falha na normalização automática:', erro);
    }
  }
    async normalizarUltimaColagem() {
    try {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return new Notice('Abra uma nota no editor Markdown.');
      const faixa = this.ultimaColagem;
      const arquivoAtual = this.app.workspace.getActiveFile()?.path ?? null;
      if (!faixa || !faixa.filePath || faixa.filePath !== arquivoAtual) {
        return new Notice('Nenhuma colagem recente foi identificada nesta nota. Cole o conteúdo e tente novamente.');
      }
      const editor = view.editor;
      const inicio = editor.offsetToPos(faixa.from);
      const fim = editor.offsetToPos(faixa.to);
      const original = editor.getRange(inicio, fim);
      if (!original.trim()) {
        this.ultimaColagem = null;
        return new Notice('O último conteúdo colado está vazio ou não está mais disponível.');
      }
      const resultado = limparLatex(original);
      if (resultado === original) return new Notice('Último conteúdo colado identificado; nenhuma correção necessária.');
      editor.replaceRange(resultado, inicio, fim);
      this.ultimaColagem = null;
      new Notice('Último conteúdo colado normalizado.');
    } catch (erro) {
      console.error('[GN Math Normalizer]', erro);
      new Notice(erro.message || 'Falha ao normalizar a última colagem.');
    }
  }

  async lerClipboard() {
    try { return await navigator.clipboard.readText(); }
    catch {
      throw new Error('O Obsidian não conseguiu ler a área de transferência. Verifique a permissão de clipboard do aplicativo.');
    }
  }

  async normalizarSelecao() {
    try {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return new Notice('Abra uma nota no editor Markdown.');
      const original = view.editor.getSelection();
      if (!original.trim()) return new Notice('Selecione o texto da nota que deseja normalizar.');
      const resultado = limparLatex(original);
      if (resultado === original) return new Notice('A seleção não exigiu alterações.');
      view.editor.replaceSelection(resultado);
      new Notice('Texto selecionado normalizado.');
    } catch (erro) {
      console.error('[GN Math Normalizer]', erro);
      new Notice(erro.message || 'Falha ao normalizar a seleção.');
    }
  }

  async normalizarEInserir() {
    try {
      const original = await this.lerClipboard();
      if (!original.trim()) return new Notice('A área de transferência está vazia.');
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return new Notice('Abra uma nota no editor Markdown antes de inserir.');
      view.editor.replaceSelection(limparLatex(original));
      new Notice('Conteúdo normalizado e inserido.');
    } catch (erro) {
      console.error('[GN Math Normalizer]', erro);
      new Notice(erro.message || 'Falha ao normalizar o conteúdo.');
    }
  }

  async normalizarECopiar() {
    try {
      const original = await this.lerClipboard();
      if (!original.trim()) return new Notice('A área de transferência está vazia.');
      await navigator.clipboard.writeText(limparLatex(original));
      new Notice('Conteúdo normalizado e copiado.');
    } catch (erro) {
      console.error('[GN Math Normalizer]', erro);
      new Notice(erro.message || 'Falha ao normalizar o conteúdo.');
    }
  }
}

module.exports = GNMathNormalizer;
