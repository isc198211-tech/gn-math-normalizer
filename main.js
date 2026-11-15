const { Plugin, Notice, MarkdownView } = require('obsidian');
const { EditorView } = require('@codemirror/view');

const {
  limparLatex,
  protegerCodigo,
  pareceFormula,
  expressaoLaTeXCompleta,
  extrairLatexDeHTML
} = (() => {
  'use strict';

  const MOEDA_TOKEN = 'ZXQMOEDA_CIFRAOQXZ';
  const CODIGO_TOKEN = 'ZXQCODIGO_OBSIDIAN_';

  function decodificarHTML(texto) {
    return texto
      .replace(/&#x([0-9a-f]+);/gi, (m, h) => {
        try { return String.fromCodePoint(parseInt(h, 16)); } catch { return m; }
      })
      .replace(/&#([0-9]+);/g, (m, d) => {
        try { return String.fromCodePoint(parseInt(d, 10)); } catch { return m; }
      })
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'");
  }

  function extrairLatexDeHTML(html) {
    if (typeof html !== 'string' || !html.trim()) return null;
    if (!/(?:katex|application\/x-tex|mjx-container)/i.test(html)) return null;
    if (typeof DOMParser === 'undefined') return null;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Converte fórmulas em bloco (.katex-display)
      doc.querySelectorAll('.katex-display').forEach((el) => {
        const ann = el.querySelector('annotation[encoding="application/x-tex"]');
        if (ann && ann.textContent) {
          const tex = ann.textContent.trim();
          el.replaceWith(doc.createTextNode(`\n$$\n${tex}\n$$\n`));
        }
      });

      // Converte fórmulas inline (.katex)
      doc.querySelectorAll('.katex').forEach((el) => {
        const ann = el.querySelector('annotation[encoding="application/x-tex"]');
        if (ann && ann.textContent) {
          const tex = ann.textContent.trim();
          el.replaceWith(doc.createTextNode(`$${tex}$`));
        }
      });

      // Fallback para MathJax (mjx-container) com annotation ou aria-label/tex
      doc.querySelectorAll('mjx-container').forEach((el) => {
        const ann = el.querySelector('annotation[encoding="application/x-tex"]');
        if (ann && ann.textContent) {
          const tex = ann.textContent.trim();
          const isDisplay = el.getAttribute('display') === 'true';
          el.replaceWith(
            doc.createTextNode(isDisplay ? `\n$$\n${tex}\n$$\n` : `$${tex}$`)
          );
        }
      });

      // Converte estrutura HTML básica para Markdown antes de extrair texto
      doc.querySelectorAll('strong, b').forEach((el) => {
        const bruto = el.textContent;
        const aparado = bruto.trim();
        if (aparado) {
          const antes = bruto.match(/^\s*/)[0];
          const depois = bruto.match(/\s*$/)[0];
          el.replaceWith(doc.createTextNode(`${antes}**${aparado}**${depois}`));
        }
      });

      doc.querySelectorAll('em, i').forEach((el) => {
        const bruto = el.textContent;
        const aparado = bruto.trim();
        if (aparado) {
          const antes = bruto.match(/^\s*/)[0];
          const depois = bruto.match(/\s*$/)[0];
          el.replaceWith(doc.createTextNode(`${antes}*${aparado}*${depois}`));
        }
      });

      doc.querySelectorAll('code').forEach((el) => {
        if (el.parentElement && el.parentElement.tagName === 'PRE') return;
        el.replaceWith(doc.createTextNode(`\`${el.textContent}\``));
      });

      doc.querySelectorAll('pre').forEach((el) => {
        el.replaceWith(doc.createTextNode(`\n\`\`\`\n${el.textContent}\n\`\`\`\n`));
      });

      doc.querySelectorAll('li').forEach((el) => {
        const parent = el.parentElement;
        const prefixo = parent && parent.tagName === 'OL' ? '1. ' : '- ';
        el.prepend(doc.createTextNode(prefixo));
        el.append(doc.createTextNode('\n'));
      });

      doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
        const nivel = Number(el.tagName[1]);
        el.prepend(doc.createTextNode(`${'#'.repeat(nivel)} `));
        el.append(doc.createTextNode('\n\n'));
      });

      doc.querySelectorAll('p, div, blockquote, tr').forEach((el) => {
        el.append(doc.createTextNode('\n'));
      });

      doc.querySelectorAll('br').forEach((el) => {
        el.replaceWith(doc.createTextNode('\n'));
      });

      const textoExtraido = doc.body?.textContent ?? '';
      return textoExtraido.trim() ? textoExtraido : null;
    } catch {
      return null;
    }
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
        } else {
          saida.push(linha);
        }
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
    if (cercaAtual) saida.push(salvar(bloco.join('')));

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

  function protegerReferenciasWiki(texto) {
    const referencias = [];
    let marcador = 'GNWIKIPROTECTED';

    while (texto.includes(marcador)) {
      marcador += 'X';
    }

    function proteger(referencia) {
      const indice = referencias.push(referencia) - 1;
      return `${marcador}${indice}FIM`;
    }

    // 1. Protege referências Wiki do Obsidian (![[...]] e [[...]]).
    const resultado = texto.replace(
      /!?\[\[[^\]\r\n]*\]\]/g,
      (referencia) => proteger(referencia)
    );

    // 2. Protege links e imagens Markdown, respeitando delimitadores aninhados.
    let saida = '';
    let i = 0;

    function encontrarFechamento(conteudo, inicio, abertura, fechamento) {
      let profundidade = 1;

      for (let j = inicio; j < conteudo.length; j++) {
        if (conteudo[j] === '\\') {
          j++;
          continue;
        }

        if (conteudo[j] === abertura) {
          profundidade++;
        } else if (conteudo[j] === fechamento) {
          profundidade--;
          if (profundidade === 0) return j;
        }
      }

      return -1;
    }

    while (i < resultado.length) {
      const inicio = i;

      if (resultado[i] === '!') {
        i++;
      }

      if (resultado[i] === '[') {
        const fechamentoRotulo = encontrarFechamento(resultado, i + 1, '[', ']');

        if (fechamentoRotulo !== -1) {
          let aberturaDestino = fechamentoRotulo + 1;

          while (
            aberturaDestino < resultado.length &&
            /\s/.test(resultado[aberturaDestino])
          ) {
            aberturaDestino++;
          }

          if (resultado[aberturaDestino] === '(') {
            const fechamentoDestino = encontrarFechamento(
              resultado,
              aberturaDestino + 1,
              '(',
              ')'
            );

            if (fechamentoDestino !== -1) {
              saida += proteger(resultado.slice(inicio, fechamentoDestino + 1));
              i = fechamentoDestino + 1;
              continue;
            }
          }
        }
      }

      saida += resultado.slice(inicio, inicio + 1);
      i = inicio + 1;
    }

    return {
      texto: saida,
      restaurar(conteudo) {
        return referencias.reduce(
          (acc, referencia, indice) =>
            acc.split(`${marcador}${indice}FIM`).join(referencia),
          conteudo
        );
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
    return texto
      .replace(/\r\n?/g, '\n')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u2212/g, '-') // Converte sinal de menos Unicode (−) para ASCII (-)
      .replace(/\\[ \t]*\n/g, '\n');
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
    return texto
      .replace(/\\text\{R\\?\$\s*\}/gi, `\\text{${MOEDA_TOKEN} }`)
      .replace(/\bR\\?\$/gi, MOEDA_TOKEN);
  }

  function normalizarDelimitadoresEscapados(texto) {
    return texto.replace(/\\+\$/g, '$');
  }

  function converterDelimitadoresLatex(texto) {
    // Recupera a corrupção histórica \left$...\right$ (inclusive dentro de blocos $$...$$).
    texto = texto.replace(
      /\\left\\?\$([\s\S]*?)\\right\\?\$/g,
      (_m, c) => `\\left[${c.trim()}\\right]`
    );

    const blocosProtegidos = [];

    texto = texto.replace(/\$\$[\s\S]*?\$\$/g, (bloco) => {
      const marcador = `ZXQDISPLAY${blocosProtegidos.length}QXZ`;
      blocosProtegidos.push(bloco);
      return marcador;
    });

    // Converte \[...\] em blocos matemáticos.
    texto = texto.replace(
      /\\+\[([\s\S]*?)\\+\]/g,
      (_m, c) => `\n$$\n${c.trim()}\n$$\n`
    );

    // Converte \(...\) em matemática inline.
    texto = texto.replace(
      /\\+\(([\s\S]*?)\\+\)/g,
      (_m, c) => `$${c.trim()}$`
    );

    texto = texto.replace(
      /ZXQDISPLAY(\d+)QXZ/g,
      (_m, indice) => blocosProtegidos[Number(indice)]
    );

    return texto;
  }

  function corrigirEquacoesComDelimitadoresParciais(texto) {
    return texto.split('\n').map((linha) => {
      if (linha.includes('$$')) return linha;

      const delimitadores = [...linha.matchAll(/(?<!\\)\$(?!\$)/g)];
      if (delimitadores.length !== 2) return linha;

      const abertura = delimitadores[0].index;
      const fechamento = delimitadores[1].index;

      const prefixo = linha.slice(0, abertura);
      const miolo = linha.slice(abertura + 1, fechamento);
      const sufixo = linha.slice(fechamento + 1);

      if (!/^\s*[\d(]/.test(prefixo)) return linha;
      if (!/[=≈≤≥]/.test(prefixo)) return linha;

      const expressao = (prefixo + miolo + sufixo).trim();
      const caracteresPermitidos = /^[0-9A-Za-z_{}()[\].,+\-*/^=<>≤≥≈×− \t]+$/;

      if (!caracteresPermitidos.test(expressao)) return linha;
      if (!/\d/.test(expressao)) return linha;

      let formula = expressao
        .replace(/×/g, '\\times')
        .replace(/−/g, '-');

      formula = formula.replace(/([(+\-*/=])ir(?=[)\s*/+\-=])/g, '$1i_r');
      formula = formula.replace(/(\d),(\d)/g, '$1{,}$2');

      return `$${formula}$`;
    }).join('\n');
  }

  function corrigirDelimitadoresDuplicadosEmBlocos(texto) {
    texto = texto.replace(/\$\$([^\n]*?)\$\$/g, (m, corpo) => {
      const limpo = corpo.replace(
        /(^|[ \t])\$(?!\$)([^$\n]+?)\$(?!\$)(?=[ \t]|$)/g,
        '$1$2'
      );
      return `$$${limpo}$$`;
    });

    const linhas = texto.split('\n');
    const saida = [];
    let dentro = false;

    for (let linha of linhas) {
      const semPrefixo = linha.replace(/^[ \t]*(?:>[ \t]?)*/, '').trim();

      if (!dentro && semPrefixo === '$$') {
        dentro = true;
        saida.push(linha);
        continue;
      }

      if (dentro && semPrefixo === '$$') {
        dentro = false;
        saida.push(linha);
        continue;
      }

      if (dentro && semPrefixo === '$') {
        dentro = false;
        saida.push(linha.replace('$', () => '$$'));
        continue;
      }

      if (dentro) {
        linha = linha.replace(
          /(\\times|×)[ \t]*\$([^$\n]+?)\$(?=[ \t]*$)/,
          (_m, operador, expressao) => `${operador} (${expressao.trim()})`
        );

        linha = linha.replace(/\$(?!\$)([^$\n]+?)\$(?!\$)/g, '$1');
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
    return texto.replace(/(\$\$[\s\S]*?\$\$|(?<!\$)\$(?!\$)[^$\n]+?(?<!\\)\$(?!\$))/g, (formula) => {
      return formula.replace(/(?<=\d)([ \t]*)%(?![A-Za-z])/g, '$1\\%');
    });
  }

  function converterColchetesMatematicos(texto) {
    return texto.replace(/(?<!\\left)\[([^\[\]\n]+?)\](?!\s*\()/g, (m, conteudo) => {
      const expressao = conteudo.trim();
      // Ignora checkboxes Markdown ([ ], [x], [X]) e notas de rodapé ([^1])
      if (/^[xX ]$/.test(expressao) || expressao.startsWith('^')) return m;

      const temComandoOuOperador =
        /\\[a-zA-Z]+/.test(expressao) ||
        /[=+*/^_]/.test(expressao) ||
        /\d\s*[-+]\s*\d/.test(expressao);

      return temComandoOuOperador && pareceFormula(expressao) ? `$${expressao}$` : m;
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
      if (semPrefixo === '$$') {
        dentroBloco = !dentroBloco;
        resultado.push(linha);
        continue;
      }
      if (dentroBloco) {
        resultado.push(linha);
        continue;
      }

      const mPrefixo = linha.match(/^([ \t]*(?:(?:>[ \t]?)*)(?:(?:[-*+]\s+|\d+[.)]\s+))?)/);
      const prefixo = mPrefixo ? mPrefixo[1] : '';
      const corpo = linha.slice(prefixo.length).trim();
      const jaDelimitada = corpo.includes('$') || corpo.includes('\\(') || corpo.includes('\\[');
      const temLeftRight = /\\left\s*[\[({]/.test(corpo) && /\\right\s*[\])}]/.test(corpo);
      const terminaEmRight = /\\right\s*[\])}]\s*[.,;]?$/.test(corpo);
      const temComando = /\\(?:frac|times|cdot|sqrt|div|sum|int)\b/.test(corpo);

      if (!jaDelimitada && temLeftRight && terminaEmRight && temComando && inicioFormula.test(corpo) && permitidos.test(corpo)) {
        resultado.push(prefixo + '$' + corrigirConteudoFormula(corpo) + '$');
      } else {
        resultado.push(linha);
      }
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
      const ehCitacao = /^[ \t]*>/.test(linha);

      if (inicio) {
        const conteudo = linha.replace(/^[ \t]*(?:>[ \t]?)?/, '').trimEnd();
        resultado.push(conteudo ? `> ${conteudo}` : '>');
        dentro = true;
      } else if (dentro) {
        if (ehLinhaDivisoriaOuTitulo(linha) || (!ehCitacao && !linha.trim())) {
          dentro = false;
          resultado.push(linha);
        } else {
          const conteudo = linha.replace(/^[ \t]*>[ \t]?/, '');
          resultado.push(conteudo.trim() ? `> ${conteudo}` : '>');
        }
      } else {
        resultado.push(linha);
      }
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
      if (
        dentroBloco ||
        !conteudo ||
        conteudo.includes('$') ||
        conteudo.includes('\\(') ||
        conteudo.includes('\\[') ||
        /^(?:#{1,6}\s|[-*+]\s|>\s|---+$)/.test(conteudo) ||
        conteudo.startsWith('$$')
      ) {
        resultado.push(linha);
        continue;
      }

      const temEnfaseMarkdown =
        /\*\*|__/.test(conteudo) ||
        /(?:^|[\s(])[*_][^\s*_]|[^\s*_][*_](?:[\s.,;:)]|$)/.test(conteudo);

      const semComandos = conteudo
        .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{[^{}]*\}/g, ' ')
        .replace(/\\[a-zA-Z]+/g, ' ')
        .replace(/[{}]/g, ' ');

      const palavras = semComandos.match(/[A-Za-zÀ-ÿ]+/g) || [];
      const funcoesPermitidas = new Set([
        'sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan',
        'sinh', 'cosh', 'tanh', 'log', 'ln', 'lim',
        'max', 'min', 'exp', 'det', 'gcd', 'mod', 'dx', 'dy', 'dz', 'dt'
      ]);
      const palavrasProsa = new Set([
        'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
        'com', 'por', 'para', 'que', 'se', 'ou', 'as', 'os', 'um', 'uma',
        'ao', 'aos', 'pelo', 'pela', 'entre', 'sobre', 'ate', 'mais', 'menos'
      ]);

      const pareceProsa =
        temEnfaseMarkdown ||
        palavras.some((p) => {
          if (/[À-ÿ]/.test(p)) return true;
          const low = p.toLowerCase();
          if (palavrasProsa.has(low)) return true;
          return p.length >= 4 && !funcoesPermitidas.has(low);
        });

      const temOperador = /(?:=|<|>|\\implies|\\Longrightarrow|\\Rightarrow)/.test(conteudo);
      const temEstrutura = /\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|times|cdot|div)\b/.test(conteudo);
      const temIndice = /[MJ]_\{\\text\{/.test(conteudo);

      const formulaReconhecida = !pareceProsa && temOperador && (temEstrutura || temIndice);

      resultado.push(
        formulaReconhecida
          ? `$$\n${corrigirConteudoFormula(conteudo)}\n$$`
          : linha
      );
    }
    return resultado.join('\n');
  }

  function corrigirIndicadoresLegais(texto) {
    return texto
      .replace(
        /(^|[^A-Za-zÀ-ÿ0-9_])(art\.?|artigo|inciso|parágrafo|§|item|lei|decreto|n\.?º?)\s*(\d+)\s*o(?![A-Za-zÀ-ÿ0-9_])/gi,
        '$1$2 $3º'
      )
      .replace(/\bn\.o\b/gi, 'n.º');
  }

  function transformarForaDeMatematica(linha, transformar) {
    const protegidos = [];
    const mascarada = linha.replace(
      /(\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)[^$\n]+?(?<!\\)\$(?!\$)|\\+\([\s\S]*?\\+\)|\\+\[[\s\S]*?\\+\])/g,
      (m) => {
        const marcador = `ZXQMATH${protegidos.length}QXZ`;
        protegidos.push(m);
        return marcador;
      }
    );

    const processada = transformar(mascarada);

    return processada.replace(
      /ZXQMATH(\d+)QXZ/g,
      (_m, indice) => protegidos[Number(indice)]
    );
  }

  function transformarComEnfaseMarkdown(trecho, transformar, profundidade = 0) {
    if (profundidade > 2) {
      return transformar(trecho);
    }

    const padraoEnfase = new RegExp(
      String.raw`(?<![\\*A-Za-zÀ-ÿ0-9)])(\*{1,3})(?!\s|\*)([^\n]+?)(?<!\s|\\)\1(?![*A-Za-zÀ-ÿ0-9(])` +
      String.raw`|(?<![\\A-Za-zÀ-ÿ0-9_)\]}∑Σ∏Π])(_{1,3})(?!\s|_|\{)([^\n]+?)(?<!\s|\\)\3(?![A-Za-zÀ-ÿ0-9_(\[{])` +
      String.raw`|(^|[\s(\[—–\-])(\*{1,3})\s+([^*\n]+?=[^*\n]+?)\s+\6(?=[\s.,;:)\]—–\-]|$)` +
      String.raw`|(^|[\s(\[—–\-])(_{1,3})\s+([^_\n]+?)\s+\9(?=[\s.,;:)\]—–\-]|$)`,
      'g'
    );

    const partes = [];
    let ultimoIndice = 0;
    let m;

    while ((m = padraoEnfase.exec(trecho)) !== null) {
      const inicio = m.index;
      const fim = inicio + m[0].length;

      if (inicio > ultimoIndice) {
        partes.push(transformar(trecho.slice(ultimoIndice, inicio)));
      }

      if (m[1] !== undefined) {
        const delim = m[1];
        const miolo = m[2];
        if (delim.length === 1 && miolo.includes('*')) {
          const subPartes = miolo.split('*');
          if (subPartes.some((p) => !p.trim())) {
            partes.push(transformar(m[0]));
            ultimoIndice = fim;
            continue;
          }
        }
        partes.push(`${delim}${transformarComEnfaseMarkdown(miolo, transformar, profundidade + 1)}${delim}`);
      } else if (m[3] !== undefined) {
        const delim = m[3];
        const miolo = m[4];
        partes.push(`${delim}${transformarComEnfaseMarkdown(miolo, transformar, profundidade + 1)}${delim}`);
      } else if (m[5] !== undefined) {
        const pref = m[5];
        const delim = m[6];
        const miolo = m[7];
        partes.push(`${pref}${delim} ${transformarComEnfaseMarkdown(miolo, transformar, profundidade + 1)} ${delim}`);
      } else {
        const pref = m[8];
        const delim = m[9];
        const miolo = m[10];
        partes.push(`${pref}${delim} ${transformarComEnfaseMarkdown(miolo, transformar, profundidade + 1)} ${delim}`);
      }

      ultimoIndice = fim;
    }

    if (ultimoIndice < trecho.length) {
      partes.push(transformar(trecho.slice(ultimoIndice)));
    }

    return partes.join('');
  }

  function converterEquacoesEmParagrafos(texto) {
    const linhas = texto.split('\n');

    const identificador = String.raw`(?!ZXQMATH\d+QXZ)(?:\\(?:alpha|beta|gamma|delta|Delta|theta|lambda|mu|pi|sigma|Sigma|omega|Omega|phi|rho|tau|epsilon|varepsilon|eta)\b|[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]*)(?:_(?:\{[^{}\n]+\}|\([^()\n]+\)|[A-Za-zÀ-ÿ0-9]+))?(?:\([^()\n]+\))?`;
    const numero = String.raw`\d+(?:[.,]\d+)?(?:%|[kKmM])?`;
    const moeda = String.raw`${MOEDA_TOKEN}\s*\d+(?:[.,]\d+)?`;
    const grupoParenteses = String.raw`\(\s*[-+]?\s*(?:${identificador}|${numero}|${moeda})(?:\s*[-+*/×÷]\s*(?:${identificador}|${numero}|${moeda}))*\s*\)`;

    const atomo = String.raw`(?:${moeda}|${grupoParenteses}|${identificador}|${numero})`;
    const termo = String.raw`(?:[-+]\s*)?${atomo}`;
    const expressao = String.raw`${termo}(?:\s*[-+*/×÷]\s*${termo})*`;

    const padrao = new RegExp(
      String.raw`(^|[^A-Za-zÀ-ÿ0-9_])(${expressao}\s*=\s*${expressao}(?:\s*=\s*${expressao})*)(?![A-Za-zÀ-ÿ0-9_])`,
      'g'
    );

    let dentroBloco = false;

    return linhas.map((linha) => {
      const conteudo = linha.trim();
      const semPrefixo = conteudo.replace(/^(?:>\s?)*/, '').trim();

      if (semPrefixo === '$$') {
        dentroBloco = !dentroBloco;
        return linha;
      }

      if (dentroBloco || /^\s*#{1,6}\s/.test(linha)) {
        return linha;
      }

      return transformarForaDeMatematica(linha, (trecho) =>
        transformarComEnfaseMarkdown(trecho, (subTrecho) =>
          subTrecho.replace(padrao, (correspondencia, anterior, formula, offset) => {
          if (anterior === '(' && /_\s*$/.test(subTrecho.slice(0, offset))) {
            return correspondencia;
          }

          const limpo = formula.trim();

          const possuiEstruturaMatematica =
            /[-+*/×÷_]/.test(limpo) ||
            /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]*\(/.test(limpo);

          const ehAtribuicaoMatematica =
            /^[A-Za-z]{1,4}\s*=\s*[-+]?\s*\d+(?:[.,]\d+)?$/.test(limpo);

          if (!possuiEstruturaMatematica && !ehAtribuicaoMatematica) {
            return correspondencia;
          }

          const formatada = limpo
            .replace(/\s*=\s*/g, ' = ')
            .replace(/\s*×\s*/g, ' \\times ')
            .replace(/\s*÷\s*/g, ' \\div ')
            .replace(/\(\s+/g, '(')
            .replace(/\s+\)/g, ')')
            .replace(/\s{2,}/g, ' ')
            .trim();

          return `${anterior}$${formatada}$`;
        })
        )
      );
    }).join('\n');
  }

  function converterFragmentosLatexInline(texto) {
    const padrao = new RegExp(
      String.raw`(^|[\s:(*_"'“‘\[—–\-])([-+]?\s*\\(?:text|mathrm|mathbf|frac|dfrac|tfrac|sqrt)(?:\{[^{}\n]+\}){1,2}(?:\s*[-+*/=×÷]?\s*(?:${MOEDA_TOKEN}\s*)?\d+(?:[.,]\d+)?)?)(?=[.,;:)*_"'”’\]—–\s\-]|$)`,
      'g'
    );

    let dentroBloco = false;

    return texto.split('\n').map((linha) => {
      const semPrefixo = linha.trim().replace(/^(?:>\s?)*/, '').trim();
      if (semPrefixo === '$$') {
        dentroBloco = !dentroBloco;
        return linha;
      }

      if (dentroBloco || /^\s*#{1,6}\s/.test(linha)) {
        return linha;
      }

      return transformarForaDeMatematica(linha, (trecho) =>
        transformarComEnfaseMarkdown(trecho, (subTrecho) =>
          subTrecho.replace(padrao, (_m, antes, frag) => `${antes}$${frag.trim()}$`)
        )
      );
    }).join('\n');
  }

  function converterExpressoesSemIgualdade(texto) {
    const linhas = texto.split('\n');

    const normalizarSubscritosEExpoentes = (formula) => {
      formula = formula.replace(/([A-Za-z])_([A-Za-z0-9]+)/g, '$1_{$2}');

      const expoentes = {
        '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
        '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9'
      };

      formula = formula.replace(
        /([A-Za-z])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g,
        (_, base, expoente) =>
          `${base}^{${[...expoente].map((c) => expoentes[c]).join('')}}`
      );

      formula = formula.replace(/([A-Za-z])\^\((-?\d+)\)/g, '$1^{$2}');
      formula = formula.replace(/([A-Za-z])_\(([^()\n]+)\)/g, '$1_{$2}');

      return formula;
    };

    let dentroBloco = false;

    return linhas.map((linha) => {
      const conteudo = linha.trim();
      const semPrefixo = conteudo.replace(/^(?:>\s?)*/, '').trim();

      if (semPrefixo === '$$') {
        dentroBloco = !dentroBloco;
        return linha;
      }

      if (/^\s*#{1,6}\s/.test(linha)) {
        return linha;
      }

      const delimitar = (formula) => (dentroBloco ? formula : `$${formula}$`);

      return transformarForaDeMatematica(linha, (trecho) =>
        transformarComEnfaseMarkdown(trecho, (subTrecho) => {
        let resultado = subTrecho;

        // Somatórios: ∑_(i=1)^n x_i
        resultado = resultado.replace(
          /[∑Σ]\s*_\s*\(([^()\n]+)\)\s*\^\s*([A-Za-z0-9]+)\s+([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)?)/g,
          (_, inferior, superior, termo) => {
            const indice = normalizarSubscritosEExpoentes(termo);
            return delimitar(`\\sum_{${inferior}}^{${superior}} ${indice}`);
          }
        );

        // Raízes: √(25) -> \sqrt{25}
        resultado = resultado.replace(
          /√\s*\(([^()\n]+)\)/g,
          (_, radicando) => delimitar(`\\sqrt{${radicando}}`)
        );

        // Expoentes negativos: A^(-1), (1+i)^(-1)
        resultado = resultado.replace(
          /(\([^()\n]+\)|[A-Za-z])\^\((-?\d+)\)/g,
          (_, base, expoente) => delimitar(`${base}^{${expoente}}`)
        );

        // Expoentes Unicode protegidos antes da normalização NFKC
        resultado = resultado.replace(
          /(?!ZXQMATH\d+QXZ)([A-Za-z])((?:ZXQEXP[0-9]QXZ)+)/g,
          (_, base, marcadores) => {
            const expoente = [...marcadores.matchAll(/ZXQEXP([0-9])QXZ/g)]
              .map((m) => m[1])
              .join('');
            return delimitar(`${base}^{${expoente}}`);
          }
        );

        // Subscritos explícitos: C_(N,n) -> C_{N,n}
        resultado = resultado.replace(
          /(?!ZXQMATH\d+QXZ)([A-Za-z])_\(([^()\n]+)\)/g,
          (_, base, indice) => delimitar(`${base}_{${indice}}`)
        );

        return resultado;
      })
      );
    }).join('\n');
  }

  function restaurarMoeda(texto) {
    // Dentro de blocos/expressões matemáticas, formata R$ com \text{R\$ } sem aninhar \text{...}
    texto = texto.replace(/(\$\$[\s\S]*?\$\$|(?<!\$)\$(?!\$)[^$\n]+?(?<!\\)\$(?!\$))/g, (formula) => {
      let f = formula.replace(
        new RegExp(`\\\\text\\{${MOEDA_TOKEN}\\s*\\}\\s*`, 'g'),
        '\\text{R\\$ }'
      );
      f = f.replace(
        new RegExp(`(\\\\text\\{[^{}]*)${MOEDA_TOKEN}`, 'g'),
        '$1R\\$'
      );
      f = f.replace(
        new RegExp(`${MOEDA_TOKEN}\\s*`, 'g'),
        '\\text{R\\$ }'
      );
      return f;
    });

    // Fora de matemática, restaura como R\$ para evitar pareamento acidental de cifrões no Markdown
    return texto.split(MOEDA_TOKEN).join('R\\$');
  }

  function limparLatex(texto) {
    if (typeof texto !== 'string' || !texto) return texto;

    const codigo = protegerCodigo(texto);
    const referenciasWiki = protegerReferenciasWiki(codigo.texto);
    let s = referenciasWiki.texto;

    s = decodificarHTML(s);

    const mapaExpoentes = {
      '⁰': 'ZXQEXP0QXZ', '¹': 'ZXQEXP1QXZ', '²': 'ZXQEXP2QXZ',
      '³': 'ZXQEXP3QXZ', '⁴': 'ZXQEXP4QXZ', '⁵': 'ZXQEXP5QXZ',
      '⁶': 'ZXQEXP6QXZ', '⁷': 'ZXQEXP7QXZ', '⁸': 'ZXQEXP8QXZ',
      '⁹': 'ZXQEXP9QXZ'
    };

    s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (caractere) => mapaExpoentes[caractere]);
    s = s.normalize('NFKC');

    s = normalizarQuebras(s);
    s = protegerMoeda(s);
    s = corrigirMarkdownEscapado(s);
    s = corrigirIndicadoresLegais(s);
    s = corrigirIndicesMatematicos(s);
    s = normalizarDelimitadoresEscapados(s);

    s = corrigirDelimitadoresDuplicadosEmBlocos(s);
    s = converterDelimitadoresLatex(s);
    s = corrigirEquacoesComDelimitadoresParciais(s);
    s = escaparPercentualEmMatematica(s);
    s = converterColchetesMatematicos(s);
    s = envolverEquacoesComLeftRight(s);
    s = removerBarrasSoltas(s);
    s = converterFormulasIsoladas(s);
    s = converterEquacoesEmParagrafos(s);
    s = converterFragmentosLatexInline(s);
    s = converterExpressoesSemIgualdade(s);
    s = s.replace(
      /([A-Za-z0-9)\]])((?:ZXQEXP[0-9]QXZ)+)/g,
      (_, base, marcadores) => {
        const expoente = [...marcadores.matchAll(/ZXQEXP([0-9])QXZ/g)]
          .map((m) => m[1])
          .join('');
        return `${base}^{${expoente}}`;
      }
    );
    s = normalizarCallouts(s);
    s = restaurarMoeda(s);
    s = referenciasWiki.restaurar(s);
    s = codigo.restaurar(s);

    return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  return {
    limparLatex,
    protegerCodigo,
    pareceFormula,
    expressaoLaTeXCompleta,
    extrairLatexDeHTML
  };
})();

const detectarEnterLaTeX = (plugin) =>
  EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;

    const editor = plugin.obterEditorDaViewCodeMirror(update.view);
    if (!editor) return;

    for (const transacao of update.transactions) {
      if (!transacao.docChanged) continue;

      transacao.changes.iterChanges(
        (fromA, _toA, _fromB, _toB, textoInserido) => {
          if (!textoInserido.toString().includes('\n')) return;

          const linhaAnterior = transacao.startState.doc.lineAt(fromA).number - 1;

          const timer = setTimeout(() => {
            plugin.timersPendentes.delete(timer);
            plugin.normalizarLinhaConfirmada(editor, linhaAnterior);
          }, 50);

          plugin.timersPendentes.add(timer);
        }
      );
    }
  });

function pareceExpressaoMatematicaAutonoma(expressao) {
  let texto = expressao.trim();
  if (!texto) return false;

  if (/\bR\s*\$/i.test(texto)) return false;
  if (/^#{1,6}\s/.test(texto)) return false;

  texto = texto.replace(/\\text\s*\{[^{}]*\}/g, ' ');
  texto = texto.replace(/\\[a-zA-Z]+/g, ' ');
  texto = texto.replace(/[{}]/g, ' ');

  const palavras = texto.match(/[A-Za-zÀ-ÿ]+/g) || [];

  const funcoesPermitidas = new Set([
    'sin', 'cos', 'tan',
    'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh',
    'log', 'ln', 'lim',
    'max', 'min', 'exp',
    'det', 'gcd'
  ]);

  return palavras.every(
    (palavra) => palavra.length === 1 || funcoesPermitidas.has(palavra.toLowerCase())
  );
}

class GNMathNormalizer extends Plugin {
  async onload() {
    this.ultimaColagem = null;
    this.timersNormalizacao = new WeakMap();
    this.timersPendentes = new Set();
    this.normalizacaoEmAndamento = new WeakSet();

    this.registerEditorExtension(detectarEnterLaTeX(this));

    this.registerEvent(
      this.app.workspace.on('editor-change', (editor) => {
        if (!editor) return;
        if (this.normalizacaoEmAndamento.has(editor)) return;

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
      })
    );

    const agendarNormalizacao = (file = null) => {
      const caminho = file?.path ?? null;
      let tentativa = 0;
      const maxTentativas = 12;
      const intervalo = 250;

      const executar = async () => {
        try {
          const pronto = await this.normalizarTodasNotasAbertas(caminho);
          if (pronto || tentativa >= maxTentativas) return;

          tentativa++;
          const timer = setTimeout(() => {
            this.timersPendentes.delete(timer);
            executar();
          }, intervalo);

          this.timersPendentes.add(timer);
        } catch (erro) {
          console.error('[GN Math Normalizer] Falha no agendamento da normalização:', erro);
        }
      };

      const timer = setTimeout(() => {
        this.timersPendentes.delete(timer);
        executar();
      }, intervalo);

      this.timersPendentes.add(timer);
    };

    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        agendarNormalizacao(file);
      })
    );

    this.registerEvent(
      this.app.workspace.on('window-open', () => {
        agendarNormalizacao();
      })
    );

    this.app.workspace.onLayoutReady(() => {
      agendarNormalizacao();
    });

    this.registerEvent(
      this.app.workspace.on('editor-paste', (evt, editor) => {
        try {
          const clipboard = evt.clipboardData;
          if (!clipboard || !editor) return;

          const textoPlano = clipboard.getData('text/plain');
          const html = clipboard.getData('text/html');
          const extraidoHtml = extrairLatexDeHTML(html);
          const fonte = extraidoHtml || textoPlano;

          if (typeof fonte !== 'string' || !fonte.trim()) return;

          const inicio = editor.posToOffset(editor.getCursor('from'));
          let filePath = null;

          this.app.workspace.iterateAllLeaves((leaf) => {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.editor === editor && view.file) {
              filePath = view.file.path;
            }
          });

          const resultado = limparLatex(fonte);
          if (resultado !== textoPlano) {
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
      })
    );

    this.addRibbonIcon(
      'wand-sparkles',
      'GN Math Normalizer: normalizar texto selecionado',
      async () => this.normalizarSelecao()
    );

    this.addCommand({
      id: 'normalizar-ultima-colagem',
      name: 'Normalizar último conteúdo colado',
      callback: () => this.normalizarUltimaColagem()
    });
    this.addCommand({
      id: 'normalizar-texto-selecionado',
      name: 'Normalizar texto selecionado na nota',
      callback: () => this.normalizarSelecao()
    });
    this.addCommand({
      id: 'normalizar-clipboard-inserir',
      name: 'Normalizar clipboard e inserir no cursor',
      callback: () => this.normalizarEInserir()
    });
    this.addCommand({
      id: 'normalizar-clipboard-copiar',
      name: 'Normalizar clipboard e copiar resultado',
      callback: () => this.normalizarECopiar()
    });
  }

  onunload() {
    for (const timer of this.timersPendentes ?? []) clearTimeout(timer);
    this.timersPendentes?.clear();
  }

  obterEditorDaViewCodeMirror(cmView) {
    if (!cmView?.dom) return null;

    let editorEncontrado = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.containerEl?.contains(cmView.dom)) {
        editorEncontrado = view.editor;
      }
    });

    return editorEncontrado;
  }

  async normalizarTodasNotasAbertas(caminho = null) {
    let encontrouEditorPronto = false;
    let existeEditorPendente = false;
    const tarefasNormalizacao = [];

    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) return;
      if (caminho && view.file?.path !== caminho) return;

      if (!view.file || !view.editor) {
        existeEditorPendente = true;
        return;
      }

      const conteudo = view.editor.getValue();
      if (!conteudo && (view.file.stat?.size ?? 0) > 0) {
        existeEditorPendente = true;
        return;
      }

      encontrouEditorPronto = true;
      tarefasNormalizacao.push(this.normalizarNotaAberta(view.editor, view));
    });

    await Promise.all(tarefasNormalizacao);
    return encontrouEditorPronto && !existeEditorPendente;
  }

  async normalizarNotaAberta(editor, view = null) {
    if (!editor || this.normalizacaoEmAndamento.has(editor)) return;

    try {
      const original = editor.getValue();
      if (!original || !original.trim()) return;

      const texto = limparLatex(original);
      if (texto === original) return;

      const modo = view?.getMode?.() ?? 'source';
      const anchorOffset = editor.posToOffset(editor.getCursor('from'));
      const headOffset = editor.posToOffset(editor.getCursor('to'));

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
        original[original.length - 1 - sufixoComum] === texto[texto.length - 1 - sufixoComum]
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
          Math.max(0, texto.length - prefixoComum - sufixoComum)
        );
      };

      const novoAnchor = Math.max(0, Math.min(texto.length, mapearOffset(anchorOffset)));
      const novoHead = Math.max(0, Math.min(texto.length, mapearOffset(headOffset)));

      this.normalizacaoEmAndamento.add(editor);

      if (modo === 'preview') {
        if (!view || typeof view.setViewData !== 'function') {
          throw new Error('MarkdownView.setViewData() não está disponível no modo preview.');
        }
        view.setViewData(texto, false);
      } else {
        editor.replaceRange(
          texto,
          { line: 0, ch: 0 },
          editor.offsetToPos(original.length)
        );
        editor.setSelection(
          editor.offsetToPos(novoAnchor),
          editor.offsetToPos(novoHead)
        );
      }

      if (view && typeof view.save === 'function') {
        await view.save();
      }

      setTimeout(() => {
        this.normalizacaoEmAndamento.delete(editor);
      }, 0);
    } catch (erro) {
      this.normalizacaoEmAndamento.delete(editor);
      console.error('[GN Math Normalizer] Falha na normalização ao abrir nota:', erro);
    }
  }

  linhaDentroBlocoCodigo(editor, linhaAlvo) {
    let cercaAtual = null;
    let tamanhoAtual = 0;

    for (let i = 0; i <= linhaAlvo; i++) {
      const linha = editor.getLine(i);
      const m = linha.match(/^( {0,3}(?:> ?)*)( {0,3})(`{3,}|~{3,})(.*)$/);

      if (!cercaAtual) {
        if (m) {
          cercaAtual = m[3][0];
          tamanhoAtual = m[3].length;
        }
      } else if (
        m &&
        m[3][0] === cercaAtual &&
        m[3].length >= tamanhoAtual &&
        !m[4].trim()
      ) {
        cercaAtual = null;
        tamanhoAtual = 0;
      }

      if (i === linhaAlvo) return cercaAtual !== null;
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
      if (/^\s{0,3}#{1,6}\s/.test(linhaOriginal)) return;
      if (/^\s*(?:>|[-*+]\s|\d+[.)]\s)/.test(linhaOriginal)) return;
      if (/^\s*\[![^\]]+\]/.test(linhaOriginal)) return;

      const corpo = linhaOriginal.trim();
      if (corpo.includes('$') || corpo.includes('\\(') || corpo.includes('\\[')) return;
      if (!pareceExpressaoMatematicaAutonoma(corpo)) return;
      if (!expressaoLaTeXCompleta(corpo)) return;

      const resultado = limparLatex(`\\[${corpo}\\]`);
      if (!resultado) return;

      const indentacao = linhaOriginal.match(/^\s*/)[0];
      const novaLinha = resultado
        .split('\n')
        .map((linha) => indentacao + linha)
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
      console.error('[GN Math Normalizer] Falha na confirmação matemática:', erro);
    }
  }

  normalizarLinhaAtual(editor) {
    if (!editor || this.normalizacaoEmAndamento.has(editor)) return;

    try {
      if (editor.getSelection()) return;
      const cursor = editor.getCursor();
      const linhaOriginal = editor.getLine(cursor.line);
      if (!linhaOriginal || !linhaOriginal.trim()) return;

      if (/^\s*(?:>\s*)?(?:`{3,}|~{3,})/.test(linhaOriginal)) return;
      if (this.linhaDentroBlocoCodigo(editor, cursor.line)) return;

      const prefixoMatch = linhaOriginal.match(/^(\s*(?:(?:>\s*)*)(?:(?:[-*+]\s+|\d+[.)]\s+))?)/);
      const prefixo = prefixoMatch?.[1] ?? '';
      const corpo = linhaOriginal.slice(prefixo.length);
      if (!corpo.trim() || /^\[![^\]]+\]/.test(corpo.trim())) return;

      const temProblemaLaTeX =
        /\\+\([^()\n]*?\\+\)/.test(corpo) ||
        /\\+\[[^\n]*?\\+\]/.test(corpo) ||
        /\\left\\?\$[\s\S]*?\\right\\?\$/.test(corpo) ||
        /\\_(?=\{)/.test(corpo) ||
        /\$\$[^\n]*?\$[^$\n]+\$[^$\n]*?\$\$/.test(corpo) ||
        /\\text\{R\\?\$\s*\}/i.test(corpo);

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

      let prefixoComum = 0;
      while (
        prefixoComum < linhaOriginal.length &&
        prefixoComum < novaLinha.length &&
        linhaOriginal[prefixoComum] === novaLinha[prefixoComum]
      ) {
        prefixoComum++;
      }

      let sufixoComum = 0;
      while (
        sufixoComum < linhaOriginal.length - prefixoComum &&
        sufixoComum < novaLinha.length - prefixoComum &&
        linhaOriginal[linhaOriginal.length - 1 - sufixoComum] === novaLinha[novaLinha.length - 1 - sufixoComum]
      ) {
        sufixoComum++;
      }

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
      if (resultado === original) {
        return new Notice('Último conteúdo colado identificado; nenhuma correção necessária.');
      }
      editor.replaceRange(resultado, inicio, fim);
      this.ultimaColagem = null;
      new Notice('Último conteúdo colado normalizado.');
    } catch (erro) {
      console.error('[GN Math Normalizer]', erro);
      new Notice(erro.message || 'Falha ao normalizar a última colagem.');
    }
  }

  async lerClipboard() {
    try {
      return await navigator.clipboard.readText();
    } catch {
      throw new Error('O Obsidian não conseguiu ler a área de transferência. Verifique a permissão de clipboard do aplicativo.');
    }
  }

  async normalizarSelecao() {
    try {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return new Notice('Abra uma nota no editor Markdown.');

      const original = view.editor.getSelection();
      if (!original.trim()) {
        return new Notice('Selecione o texto da nota que deseja normalizar.');
      }

      const resultado = limparLatex(original);
      if (resultado !== original) {
        view.editor.replaceSelection(resultado);
      }

      new Notice(
        resultado !== original
          ? 'Texto selecionado normalizado.'
          : 'Nenhuma alteração necessária.'
      );
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
